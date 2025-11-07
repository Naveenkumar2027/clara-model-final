/**
 * Production-grade Call API endpoints
 * Implements: routing, CAS accept, timeout handling, proper state management
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { CallRepository } from '../repositories/CallRepository.js';
import { StaffAvailabilityRepository } from '../repositories/StaffAvailabilityRepository.js';
import { Call, CallParticipant, CallStatus } from '../models/Call.js';
import { Server as IOServer } from 'socket.io';

const NAMESPACE = '/rtc';
const RING_TIMEOUT_MS = 45000; // 45 seconds

const rooms = {
  staff: (id: string) => `staff:${id}`,
  dept: (code: string) => `dept:${code}`,
  client: (id: string) => `client:${id}`,
  call: (id: string) => `call:${id}`,
  org: (id: string) => `org:${id}`,
};

type AuthPayload = {
  userId: string;
  role: 'client' | 'staff';
  staffId?: string;
  dept?: string;
  tenant?: string;
  orgId?: string;
};

type AuthenticatedRequest = Request & { user?: AuthPayload };

export function createCallRoutes(
  callRepo: CallRepository,
  availabilityRepo: StaffAvailabilityRepository,
  io: IOServer
): Router {
  const router = Router();

  // POST /v1/calls - Initiate a call
  const initiateSchema = z.object({
    orgId: z.string().optional(),
    clientId: z.string(),
    reason: z.string().optional(),
    targetStaffId: z.string().optional(),
    department: z.string().optional(),
  });

  router.post('/v1/calls', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = initiateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const { orgId, clientId, reason, targetStaffId, department } = parsed.data;
      const user = req.user!;
      const effectiveOrgId = orgId || user.orgId || 'default';

      // Create call record
      const callId = uuid();
      const now = Date.now();
      const call: Call = {
        id: callId,
        orgId: effectiveOrgId,
        status: 'initiated',
        createdByUserId: clientId,
        createdAt: now,
        updatedAt: now,
        reason,
        ringExpiresAt: now + RING_TIMEOUT_MS,
      };

      // Create participants
      const participants: CallParticipant[] = [
        {
          id: uuid(),
          callId,
          userId: clientId,
          role: 'client',
          state: 'invited',
        },
      ];

      // Call routing logic: find available staff
      let availableStaff: { userId: string; staffId?: string }[] = [];
      
      if (targetStaffId) {
        // Direct call to specific staff
        const availability = await availabilityRepo.getAvailability(targetStaffId, effectiveOrgId);
        if (availability && availability.status === 'available') {
          availableStaff = [{ userId: targetStaffId, staffId: targetStaffId }];
        }
      } else {
        // Find available staff in org/department
        const staffList = await availabilityRepo.findAvailableStaff(
          effectiveOrgId,
          department ? [department] : undefined
        );
        availableStaff = staffList.map(s => ({ userId: s.userId, staffId: s.userId }));
      }

      if (availableStaff.length === 0) {
        // No available staff - mark as missed immediately
        call.status = 'missed';
        call.endedAt = now;
        call.reason = 'No available staff';
        await callRepo.create(call, participants);
        return res.status(503).json({
          error: 'No available staff',
          callId,
          status: 'missed',
        });
      }

      // Add staff participants
      for (const staff of availableStaff) {
        participants.push({
          id: uuid(),
          callId,
          userId: staff.userId,
          role: 'staff',
          state: 'invited',
        });
      }

      // Update call to ringing
      call.status = 'ringing';
      await callRepo.create(call, participants);

      // Emit call.initiated to all available staff
      const nsp = io.of(NAMESPACE);
      const clientInfo = {
        id: clientId,
        name: user.userId,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.userId)}&background=6366f1&color=fff`,
      };

      for (const staff of availableStaff) {
        nsp.to(rooms.staff(staff.staffId || staff.userId)).emit('call.initiated', {
          callId,
          client: clientInfo,
          reason,
          createdAt: now,
        });
      }

      // Also emit to org room for broadcast
      nsp.to(rooms.org(effectiveOrgId)).emit('call.initiated', {
        callId,
        client: clientInfo,
        reason,
        createdAt: now,
      });

      res.json({ callId, status: call.status });
    } catch (error: any) {
      console.error('[Calls API] Error initiating call:', error);
      res.status(500).json({ error: 'Failed to initiate call' });
    }
  });

  // POST /v1/calls/:callId/accept - Accept call (CAS-protected)
  router.post('/v1/calls/:callId/accept', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { callId } = req.params;
      const user = req.user!;

      if (user.role !== 'staff') {
        return res.status(403).json({ error: 'Only staff can accept calls' });
      }

      const call = await callRepo.get(callId);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // CAS operation: only accept if ringing and not already accepted
      const staffId = user.staffId || user.userId;
      const accepted = await callRepo.acceptCallCAS(callId, staffId);

      if (!accepted) {
        return res.status(409).json({
          error: 'Call already accepted or not in ringing state',
          callId,
        });
      }

      // Update participant state
      const participants = await callRepo.getParticipants(callId);
      const staffParticipant = participants.find(p => p.userId === staffId && p.role === 'staff');
      if (staffParticipant) {
        // TODO: Update participant state to 'joined'
      }

      // Emit call.accepted to all parties
      const nsp = io.of(NAMESPACE);
      const staffInfo = {
        id: staffId,
        name: user.userId,
      };

      // Notify client
      nsp.to(rooms.client(call.createdByUserId)).emit('call.accepted', {
        callId,
        staff: staffInfo,
      });

      // Notify all staff (others' popups should auto-dismiss)
      nsp.to(rooms.org(call.orgId)).emit('call.accepted', {
        callId,
        staff: staffInfo,
      });

      // Also emit to call room
      nsp.to(rooms.call(callId)).emit('call:update', {
        state: 'accepted',
        staffId,
      });

      res.json({ callId, status: 'accepted', staffId });
    } catch (error: any) {
      console.error('[Calls API] Error accepting call:', error);
      res.status(500).json({ error: 'Failed to accept call' });
    }
  });

  // POST /v1/calls/:callId/decline
  router.post('/v1/calls/:callId/decline', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { callId } = req.params;
      const { reason } = req.body;
      const user = req.user!;

      const call = await callRepo.get(callId);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Only staff can decline
      if (user.role !== 'staff') {
        return res.status(403).json({ error: 'Only staff can decline calls' });
      }

      // Update status
      await callRepo.updateStatus(callId, 'declined', { reason });

      // Emit to client
      const nsp = io.of(NAMESPACE);
      nsp.to(rooms.client(call.createdByUserId)).emit('call.declined', {
        callId,
        reason: reason || 'Call declined by staff',
      });

      nsp.to(rooms.call(callId)).emit('call:update', {
        state: 'declined',
        reason,
      });

      res.json({ callId, status: 'declined' });
    } catch (error: any) {
      console.error('[Calls API] Error declining call:', error);
      res.status(500).json({ error: 'Failed to decline call' });
    }
  });

  // POST /v1/calls/:callId/cancel
  router.post('/v1/calls/:callId/cancel', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { callId } = req.params;
      const user = req.user!;

      const call = await callRepo.get(callId);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Only client can cancel
      if (call.createdByUserId !== user.userId) {
        return res.status(403).json({ error: 'Only call creator can cancel' });
      }

      if (call.status !== 'ringing' && call.status !== 'initiated') {
        return res.status(400).json({ error: 'Call cannot be canceled in current state' });
      }

      await callRepo.updateStatus(callId, 'canceled', { endedAt: Date.now() });

      // Emit to all staff
      const nsp = io.of(NAMESPACE);
      nsp.to(rooms.org(call.orgId)).emit('call.canceled', { callId });
      nsp.to(rooms.call(callId)).emit('call:update', { state: 'canceled' });

      res.json({ callId, status: 'canceled' });
    } catch (error: any) {
      console.error('[Calls API] Error canceling call:', error);
      res.status(500).json({ error: 'Failed to cancel call' });
    }
  });

  // POST /v1/calls/:callId/end
  router.post('/v1/calls/:callId/end', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { callId } = req.params;
      const user = req.user!;

      const call = await callRepo.get(callId);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Either party can end
      const isParticipant = call.createdByUserId === user.userId || 
                           call.acceptedByUserId === user.userId;
      
      if (!isParticipant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      await callRepo.updateStatus(callId, 'ended', { endedAt: Date.now() });

      const nsp = io.of(NAMESPACE);
      nsp.to(rooms.call(callId)).emit('call:update', { state: 'ended' });
      nsp.to(rooms.client(call.createdByUserId)).emit('call.ended', { callId });

      res.json({ callId, status: 'ended' });
    } catch (error: any) {
      console.error('[Calls API] Error ending call:', error);
      res.status(500).json({ error: 'Failed to end call' });
    }
  });

  // GET /v1/calls/:callId
  router.get('/v1/calls/:callId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { callId } = req.params;
      const call = await callRepo.get(callId);
      
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      const participants = await callRepo.getParticipants(callId);
      res.json({ ...call, participants });
    } catch (error: any) {
      console.error('[Calls API] Error getting call:', error);
      res.status(500).json({ error: 'Failed to get call' });
    }
  });

  return router;
}

