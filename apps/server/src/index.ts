import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server as IOServer } from 'socket.io';
import { createProxyMiddleware } from 'http-proxy-middleware';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
// Types (moved inline since workspace deps not available)
const NAMESPACE = '/rtc';
const rooms = {
  staff: (id: string) => `staff:${id}`,
  dept: (code: string) => `dept:${code}`,
  client: (id: string) => `client:${id}`,
  call: (id: string) => `call:${id}`,
};

type Role = 'client' | 'staff';
type AuthPayload = {
  userId: string;
  role: Role;
  staffId?: string;
  dept?: string;
  tenant?: string;
};
type CallState = 'created' | 'ringing' | 'accepted' | 'declined' | 'ended';
type CallSession = {
  call_id: string;
  client_id: string;
  staff_id?: string;
  dept_code?: string;
  state: CallState;
  created_at: number;
  updated_at: number;
  sdp_offer?: any;
  sdp_answer?: any;
};
// Old repository (kept for backward compatibility during transition)
import { CallRepository as OldCallRepository } from './repository.js';
// New production-grade repositories
import { CallRepository } from './repositories/CallRepository.js';
import { StaffAvailabilityRepository } from './repositories/StaffAvailabilityRepository.js';
import { TimeoutWorker } from './workers/TimeoutWorker.js';
import { createCallRoutes } from './routes/calls.js';
import { createStaffRoutes } from './routes/staff.js';
import { setupSocketHandlers } from './socket.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS/Env sanity
const serverPort = Number(process.env.SERVER_PORT || process.env.PORT || 8080);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const isDevelopment = process.env.NODE_ENV !== 'production';

// In development, allow all origins for flexibility (network IPs, different ports, etc.)
// In production, use strict CORS configuration
const corsOptions = isDevelopment
  ? {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // In development, allow all origins
        callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }
  : {
      origin: (process.env.CORS_ORIGINS || `${clientOrigin},http://localhost:5174,http://localhost:${serverPort}`).split(',').filter(Boolean),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    };

app.use(cors(corsOptions));

const server = http.createServer(app);

const io = new IOServer(server, {
  path: process.env.SOCKET_PATH || '/socket',
  cors: isDevelopment
    ? { origin: true, credentials: true }
    : {
        origin: (process.env.CORS_ORIGINS || `${clientOrigin},http://localhost:5174,http://localhost:${serverPort}`).split(',').filter(Boolean),
        credentials: true,
      },
});

const ENABLE_UNIFIED = process.env.ENABLE_UNIFIED_MODE === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// JWT Auth Middleware
function authMiddleware(req: Request & { user?: AuthPayload }, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// Socket auth
io.of(NAMESPACE).use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || 
      socket.handshake.headers?.authorization?.toString().replace('Bearer ', '');
    if (!token) return next(new Error('missing token'));
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (socket as any).user = payload;
    next();
  } catch (e) {
    next(new Error('unauthorized'));
  }
});

// Initialize repositories
const callRepo = new CallRepository();
const availabilityRepo = new StaffAvailabilityRepository();
// Keep old repo for backward compatibility during transition
const oldCallRepo = new OldCallRepository();

// Helper function to create complete StaffProfile objects
function createStaffProfile(email: string, dept?: string): {
  id: string;
  name: string;
  email: string;
  department: string;
  shortName: string;
  description: string;
  subjects: string[];
  avatar: string;
} {
  const name = email.split('@')[0];
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
  const shortName = name.toLowerCase();
  
  return {
    id: email,
    name: capitalizedName,
    email: email,
    department: dept || 'general',
    shortName: shortName,
    description: `Staff member in ${dept || 'general'} department`,
    subjects: [],
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(capitalizedName)}&background=6366f1&color=fff&size=128`,
  };
}

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts',
});

// Health check - explicitly handle CORS for health checks
app.get('/healthz', (req, res) => {
  // CORS middleware should handle this, but ensure headers are set
  res.json({ status: 'ok' });
});

// Auth endpoints - support both unified and staff formats
const unifiedLoginSchema = z.object({
  username: z.string(),
  password: z.string().optional(),
  role: z.enum(['client', 'staff']),
  staffId: z.string().optional(),
  dept: z.string().optional(),
});

const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  // Try staff format first (email/password)
  const staffParsed = staffLoginSchema.safeParse(req.body);
  if (staffParsed.success) {
    const { email, password } = staffParsed.data;
    // For demo: accept any email/password combination
    // In production, verify against database
    const userId = email;
    const claims: AuthPayload = { 
      userId, 
      role: 'staff', 
      staffId: email.split('@')[0], // Use email prefix as staffId
      dept: 'general' 
    };
    
    const token = jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
    
    // Return format expected by staff app
    return res.json({ 
      token, 
      refreshToken,
      user: createStaffProfile(email, 'general')
    });
  }
  
  // Try unified format (username/role)
  const unifiedParsed = unifiedLoginSchema.safeParse(req.body);
  if (unifiedParsed.success) {
    const { username, role, staffId, dept } = unifiedParsed.data;
    const userId = username;
    const claims: AuthPayload = { userId, role, staffId, dept };
    
    const token = jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
    return res.json({ token });
  }
  
  return res.status(400).json({ error: 'Invalid login format' });
});

// Staff auth refresh token endpoint
app.post('/api/auth/refresh-token', authLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  
  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET) as { userId: string };
    const claims: AuthPayload = { userId: payload.userId, role: 'staff' };
    const newToken = jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ userId: payload.userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
    
    res.json({ token: newToken, refreshToken: newRefreshToken });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Staff logout endpoint
app.post('/api/auth/logout', authMiddleware, (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Mock user data endpoint for staff app
app.get('/api/user/:username', authMiddleware, async (req: Request & { user?: AuthPayload }, res) => {
  const { username } = req.params;
  // Prioritize JWT user ID (which contains the email) if available
  // Otherwise, reconstruct email from username parameter
  const email = req.user?.userId?.includes('@') 
    ? req.user.userId 
    : (username.includes('@') ? username : `${username}@example.com`);
  const dept = req.user?.dept || 'general';
  
  // Return complete StaffProfile matching the Staff app's expected structure
  res.json({
    user: createStaffProfile(email, dept),
    meetings: [],
    tasks: [],
    timetable: [],
  });
});

// Mock notifications endpoints for staff app
app.get('/api/notifications', authMiddleware, (_req, res) => {
  res.json({ notifications: [] });
});

app.get('/api/notifications/unread', authMiddleware, (_req, res) => {
  res.json({ count: 0 });
});

app.post('/api/notifications', authMiddleware, (_req, res) => {
  res.json({ message: 'Notification created', count: 0 });
});

app.patch('/api/notifications/:id/read', authMiddleware, (_req, res) => {
  res.json({ notification: { id: _req.params.id, read: true } });
});

app.patch('/api/notifications/read-all', authMiddleware, (_req, res) => {
  res.json({ message: 'All notifications marked as read' });
});

app.delete('/api/notifications/:id', authMiddleware, (_req, res) => {
  res.json({ message: 'Notification deleted' });
});

// REST endpoints
const initiateSchema = z.object({
  clientId: z.string(),
  targetStaffId: z.string().optional(),
  department: z.string().optional(),
  purpose: z.string().optional(),
});

// Legacy endpoint - kept for backward compatibility
app.post('/api/calls/initiate', apiLimiter, authMiddleware, async (req: Request & { user?: AuthPayload }, res) => {
  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { clientId, targetStaffId, department, purpose } = parsed.data;
  const callId = uuid();
  const now = Date.now();
  
  const session: CallSession = {
    call_id: callId,
    client_id: clientId,
    staff_id: targetStaffId,
    dept_code: department,
    state: 'ringing',
    created_at: now,
    updated_at: now,
  };
  
  await oldCallRepo.create(session);
  
  const nsp = io.of(NAMESPACE);
  const clientInfo = { clientId, name: req.user?.userId };
  
  if (targetStaffId) {
    nsp.to(rooms.staff(targetStaffId)).emit('call:incoming', { callId, clientInfo, purpose, ts: now });
  } else if (department) {
    nsp.to(rooms.dept(department)).emit('call:incoming', { callId, clientInfo, purpose, ts: now });
  }
  nsp.to(rooms.call(callId)).emit('call:update', { state: 'ringing' });
  
  return res.json({ callId });
});

const acceptDeclineSchema = z.object({
  callId: z.string(),
  staffId: z.string(),
  reason: z.string().optional(),
});

// Legacy endpoint - kept for backward compatibility
app.post('/api/calls/accept', apiLimiter, authMiddleware, async (req, res) => {
  const parsed = acceptDeclineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { callId, staffId } = parsed.data;
  const sess = await oldCallRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  sess.state = 'accepted';
  sess.staff_id = staffId;
  sess.updated_at = Date.now();
  
  await oldCallRepo.update(sess);
  
  io.of(NAMESPACE).to(rooms.call(callId)).emit('call:update', { state: 'accepted', staffId });
  return res.json({ ok: true });
});

// Legacy endpoint - kept for backward compatibility
app.post('/api/calls/decline', apiLimiter, authMiddleware, async (req, res) => {
  const parsed = acceptDeclineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { callId, staffId, reason } = parsed.data;
  const sess = await oldCallRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  sess.state = 'declined';
  sess.staff_id = staffId;
  sess.updated_at = Date.now();
  
  await oldCallRepo.update(sess);
  
  io.of(NAMESPACE).to(rooms.call(callId)).emit('call:update', { state: 'declined', reason });
  return res.json({ ok: true });
});

const sdpSchema = z.object({
  callId: z.string(),
  from: z.string(),
  type: z.enum(['offer', 'answer']),
  sdp: z.any(),
});

// Legacy endpoint - kept for backward compatibility
app.post('/api/calls/sdp', apiLimiter, authMiddleware, async (req, res) => {
  const parsed = sdpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { callId, type, sdp } = parsed.data;
  const sess = await oldCallRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  if (type === 'offer') sess.sdp_offer = sdp;
  else sess.sdp_answer = sdp;
  sess.updated_at = Date.now();
  
  await oldCallRepo.update(sess);
  
  io.of(NAMESPACE).to(rooms.call(callId)).emit('call:sdp', { callId, type, sdp });
  return res.json({ ok: true });
});

const iceSchema = z.object({
  callId: z.string(),
  from: z.string(),
  candidate: z.any(),
});

app.post('/api/calls/ice', apiLimiter, authMiddleware, async (req, res) => {
  const parsed = iceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { callId, candidate } = parsed.data;
  const sess = await oldCallRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  io.of(NAMESPACE).to(rooms.call(callId)).emit('call:ice', { callId, candidate });
  return res.json({ ok: true });
});

// Mount new production-grade API routes with auth middleware
const callRoutes = createCallRoutes(callRepo, availabilityRepo, io);
const staffRoutes = createStaffRoutes(availabilityRepo);
app.use('/api', authMiddleware, callRoutes);
app.use('/api', authMiddleware, staffRoutes);

// Setup Socket.IO handlers (pass both old and new repos for compatibility)
setupSocketHandlers(io.of(NAMESPACE), oldCallRepo, undefined, undefined, callRepo);

// Start timeout worker for call timeouts
const timeoutWorker = new TimeoutWorker(callRepo, io);
timeoutWorker.start();

// Dev proxy vs prod static - Always serve from unified server
if (ENABLE_UNIFIED) {
  const clientPath = process.env.CLIENT_PUBLIC_PATH || '/';
  const staffPath = process.env.STAFF_PUBLIC_PATH || '/staff';
  
  if (process.env.NODE_ENV === 'development') {
    // Dev: Proxy to Vite dev servers but accessible via 8080
    // IMPORTANT: Staff proxy must come BEFORE client proxy to avoid /staff being caught by /
    const staffProxy = createProxyMiddleware({
      target: 'http://localhost:5174',
      changeOrigin: true,
      ws: true,
      pathRewrite: {
        [`^${staffPath}`]: '', // Strip /staff prefix when proxying
      },
    });
    // Match /staff and /staff/* explicitly
    app.use(`${staffPath}`, staffProxy);
    app.use(`${staffPath}/*`, staffProxy);
    
    // Client proxy - explicitly exclude /staff routes to avoid conflicts
    const clientProxy = createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
    });
    app.use((req, res, next) => {
      // Skip client proxy if request is for staff path
      if (req.path === staffPath || req.path.startsWith(`${staffPath}/`)) {
        return next();
      }
      clientProxy(req, res, next);
    });
  } else {
    // Prod: Serve static builds
    const clientDist = path.resolve(__dirname, '../../client/dist');
    const staffDist = path.resolve(__dirname, '../../staff/dist');
    
    // Serve static files
    app.use(clientPath, express.static(clientDist, { index: 'index.html' }));
    app.use(staffPath, express.static(staffDist, { index: 'index.html' }));
    
    // SPA fallback routes (must come after static and API routes)
    app.get(`${staffPath}/*`, (_req, res) => {
      res.sendFile(path.join(staffDist, 'index.html'));
    });
    app.get(clientPath === '/' ? '/*' : `${clientPath}/*`, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
}

const port = serverPort;
server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on :${port}`);
  console.log(`Unified mode: ${ENABLE_UNIFIED}`);
  console.log(`Health check: http://localhost:${port}/healthz`);
}).on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Please free the port or change PORT in .env`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down...');
  timeoutWorker.stop();
  server.close(() => {
    callRepo.close();
    availabilityRepo.close();
    oldCallRepo.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

