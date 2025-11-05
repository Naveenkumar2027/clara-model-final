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
import { CallRepository } from './repository.js';
import { setupSocketHandlers } from './socket.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({ origin: corsOrigins.length > 0 ? corsOrigins : true, credentials: true }));

const server = http.createServer(app);

const io = new IOServer(server, {
  path: process.env.SOCKET_PATH || '/socket',
  cors: { origin: corsOrigins.length > 0 ? corsOrigins : true, credentials: true },
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

// Initialize repository
const callRepo = new CallRepository();

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

// Health check
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Auth endpoint
const loginSchema = z.object({
  username: z.string(),
  password: z.string().optional(),
  role: z.enum(['client', 'staff']),
  staffId: z.string().optional(),
  dept: z.string().optional(),
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { username, role, staffId, dept } = parsed.data;
  const userId = username;
  const claims: AuthPayload = { userId, role, staffId, dept };
  
  const token = jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  res.json({ token });
});

// REST endpoints
const initiateSchema = z.object({
  clientId: z.string(),
  targetStaffId: z.string().optional(),
  department: z.string().optional(),
  purpose: z.string().optional(),
});

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
  
  await callRepo.create(session);
  
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

app.post('/api/calls/accept', apiLimiter, authMiddleware, async (req, res) => {
  const parsed = acceptDeclineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { callId, staffId } = parsed.data;
  const sess = await callRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  sess.state = 'accepted';
  sess.staff_id = staffId;
  sess.updated_at = Date.now();
  
  await callRepo.update(sess);
  
  io.of(NAMESPACE).to(rooms.call(callId)).emit('call:update', { state: 'accepted', staffId });
  return res.json({ ok: true });
});

app.post('/api/calls/decline', apiLimiter, authMiddleware, async (req, res) => {
  const parsed = acceptDeclineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { callId, staffId, reason } = parsed.data;
  const sess = await callRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  sess.state = 'declined';
  sess.staff_id = staffId;
  sess.updated_at = Date.now();
  
  await callRepo.update(sess);
  
  io.of(NAMESPACE).to(rooms.call(callId)).emit('call:update', { state: 'declined', reason });
  return res.json({ ok: true });
});

const sdpSchema = z.object({
  callId: z.string(),
  from: z.string(),
  type: z.enum(['offer', 'answer']),
  sdp: z.any(),
});

app.post('/api/calls/sdp', apiLimiter, authMiddleware, async (req, res) => {
  const parsed = sdpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  
  const { callId, type, sdp } = parsed.data;
  const sess = await callRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  if (type === 'offer') sess.sdp_offer = sdp;
  else sess.sdp_answer = sdp;
  sess.updated_at = Date.now();
  
  await callRepo.update(sess);
  
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
  const sess = await callRepo.get(callId);
  if (!sess) return res.status(404).json({ error: 'not found' });
  
  io.of(NAMESPACE).to(rooms.call(callId)).emit('call:ice', { callId, candidate });
  return res.json({ ok: true });
});

// Setup Socket.IO handlers
setupSocketHandlers(io.of(NAMESPACE), callRepo);

// Dev proxy vs prod static
if (ENABLE_UNIFIED) {
  const clientPath = process.env.CLIENT_PUBLIC_PATH || '/';
  const staffPath = process.env.STAFF_PUBLIC_PATH || '/staff';
  
  if (process.env.NODE_ENV === 'development') {
    app.use(clientPath === '/' ? '/' : clientPath, createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
    }));
    app.use(staffPath, createProxyMiddleware({
      target: 'http://localhost:5174',
      changeOrigin: true,
      ws: true,
    }));
  } else {
    app.use(clientPath, express.static(path.resolve(__dirname, '../../client/dist')));
    app.use(staffPath, express.static(path.resolve(__dirname, '../../staff/dist')));
    app.get(clientPath === '/' ? '/' : clientPath, (_req, res) => {
      res.sendFile(path.resolve(__dirname, '../../client/dist/index.html'));
    });
    app.get(staffPath, (_req, res) => {
      res.sendFile(path.resolve(__dirname, '../../staff/dist/index.html'));
    });
  }
}

const port = Number(process.env.PORT || 8080);
server.listen(port, () => {
  console.log(`Server listening on :${port}`);
  console.log(`Unified mode: ${ENABLE_UNIFIED}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down...');
  server.close(() => {
    callRepo.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

