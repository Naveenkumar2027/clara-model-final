import { Namespace } from 'socket.io';
import { CallRepository as OldCallRepository } from './repository.js';
import { CallRepository } from './repositories/CallRepository.js';
import { SessionRepository } from './models/Session.js';
import { AppointmentRepository } from './models/Appointment.js';

type AuthPayload = {
  userId: string;
  role: 'client' | 'staff';
  staffId?: string;
  dept?: string;
  tenant?: string;
};

const rooms = {
  staff: (id: string) => `staff:${id}`,
  dept: (code: string) => `dept:${code}`,
  client: (id: string) => `client:${id}`,
  call: (id: string) => `call:${id}`,
  org: (id: string) => `org:${id}`,
};

export function setupSocketHandlers(
  nsp: Namespace, 
  oldCallRepo: OldCallRepository,
  sessionRepo?: SessionRepository,
  appointmentRepo?: AppointmentRepository,
  newCallRepo?: CallRepository
) {
  nsp.on('connection', async (socket) => {
    const user: AuthPayload = (socket as any).user;
    
    console.log(`[Socket] ===== NEW CONNECTION =====`);
    console.log(`[Socket] Socket ID: ${socket.id}`);
    console.log(`[Socket] User: ${user.userId}, Role: ${user.role}, StaffId: ${user.staffId}`);
    console.log(`[Socket] Full user payload:`, JSON.stringify(user, null, 2));
    
    // Join role-based rooms
    if (user.role === 'staff' && user.staffId) {
      const staffRoom = rooms.staff(user.staffId);
      socket.join(staffRoom);
      console.log(`[Socket] ✅ Staff ${user.staffId} joined room: ${staffRoom}`);
      
      // Verify room membership immediately
      const roomSockets = await nsp.in(staffRoom).fetchSockets();
      console.log(`[Socket] ✅ Room ${staffRoom} now has ${roomSockets.length} socket(s)`);
      roomSockets.forEach(s => {
        const sUser = (s as any).user;
        console.log(`[Socket]   - Socket ${s.id}: userId=${sUser?.userId}, staffId=${sUser?.staffId}`);
      });
      
      if (user.dept) {
        const deptRoom = rooms.dept(user.dept);
        socket.join(deptRoom);
        console.log(`[Socket] Staff ${user.staffId} joined dept room: ${deptRoom}`);
      }

      // Join org room if orgId is available
      const orgId = (user as any).orgId || 'default';
      const orgRoom = rooms.org(orgId);
      socket.join(orgRoom);
      console.log(`[Socket] Staff ${user.staffId} joined org room: ${orgRoom}`);

      // Send pending notifications to staff on connect
      if (appointmentRepo) {
        try {
          const pendingAppointments = await appointmentRepo.findByStaff(user.staffId, { status: 'Pending' });
          if (pendingAppointments.length > 0) {
            socket.emit('notifications:appointments', {
              type: 'pending_appointments',
              count: pendingAppointments.length,
              appointments: pendingAppointments.slice(0, 5) // Send top 5
            });
          }
        } catch (error) {
          console.error('Error fetching pending appointments:', error);
        }
      }
    }
    if (user.role === 'client') {
      const clientRoom = rooms.client(user.userId);
      socket.join(clientRoom);
      console.log(`[Socket] Client ${user.userId} joined room: ${clientRoom}`);
      
      // Join org room if orgId is available
      const orgId = (user as any).orgId || 'default';
      const orgRoom = rooms.org(orgId);
      socket.join(orgRoom);
      console.log(`[Socket] Client ${user.userId} joined org room: ${orgRoom}`);
    }

    // Join staff room explicitly (in case it wasn't joined on connect)
    socket.on('join:staff', ({ staffId }: { staffId: string }) => {
      console.log(`[Socket] ===== RECEIVED join:staff REQUEST =====`);
      console.log(`[Socket] Requested staffId: ${staffId}`);
      console.log(`[Socket] User role: ${user.role}`);
      console.log(`[Socket] User staffId: ${user.staffId}`);
      console.log(`[Socket] User userId: ${user.userId}`);
      console.log(`[Socket] Socket ID: ${socket.id}`);
      
      if (user.role === 'staff' && user.staffId === staffId) {
        const staffRoom = rooms.staff(staffId);
        socket.join(staffRoom);
        console.log(`[Socket] ✅ Staff ${staffId} successfully joined room: ${staffRoom}`);
        
        // Verify room membership immediately
        nsp.in(staffRoom).fetchSockets().then(sockets => {
          console.log(`[Socket] ✅ Room ${staffRoom} verification: ${sockets.length} socket(s) present`);
          sockets.forEach(s => {
            const sUser = (s as any).user;
            console.log(`[Socket]   - Socket ${s.id}: userId=${sUser?.userId}, staffId=${sUser?.staffId}`);
          });
        });
      } else {
        console.error(`[Socket] ❌ join:staff REJECTED - role mismatch or staffId mismatch`);
        console.error(`[Socket] Expected: role=staff, staffId=${staffId}`);
        console.error(`[Socket] Got: role=${user.role}, staffId=${user.staffId}`);
      }
    });

    // Join a specific call room
    socket.on('join:call', async ({ callId }: { callId: string }) => {
      const callRoom = rooms.call(callId);
      socket.join(callRoom);
      console.log(`[Socket] Socket ${socket.id} joined call room: ${callRoom}`);
      
      // Try new repository first, fallback to old
      let call = null;
      if (newCallRepo) {
        call = await newCallRepo.get(callId);
      }
      if (!call) {
        const sess = await oldCallRepo.get(callId);
        if (sess) {
          // Convert old format to new format for compatibility
          socket.emit('call:update', { state: sess.state });
          if (sess.sdp_answer) {
            console.log(`[Socket] Sending stored answer to newly joined socket for call ${callId}`);
            socket.emit('call:sdp', { callId, type: 'answer', sdp: sess.sdp_answer });
          }
          if (sess.sdp_offer && user.role === 'staff') {
            console.log(`[Socket] Sending stored offer to newly joined staff socket for call ${callId}`);
            socket.emit('call:sdp', { callId, type: 'offer', sdp: sess.sdp_offer });
          }
        }
      } else {
        // New repository format
        socket.emit('call:update', { state: call.status });
        // TODO: Handle SDP from new repository format if needed
      }
    });

    // Staff accepts call - use CAS if new repository available
    socket.on('call:accept', async ({ callId }: { callId: string }) => {
      if (newCallRepo && user.staffId) {
        // Use CAS for race-condition safe accept
        const accepted = await newCallRepo.acceptCallCAS(callId, user.staffId);
        if (accepted) {
          const call = await newCallRepo.get(callId);
          if (call) {
            const orgId = call.orgId || 'default';
            // Emit new event names
            nsp.to(rooms.client(call.createdByUserId)).emit('call.accepted', {
              callId,
              staff: { id: user.staffId, name: user.userId },
            });
            nsp.to(rooms.org(orgId)).emit('call.accepted', {
              callId,
              staff: { id: user.staffId, name: user.userId },
            });
            nsp.to(rooms.call(callId)).emit('call:update', { state: 'accepted', staffId: user.staffId });
          }
          return;
        } else {
          // CAS failed - call already accepted
          socket.emit('call:update', { state: 'accepted', error: 'Call already accepted by another staff' });
          return;
        }
      }
      
      // Fallback to old repository
      const sess = await oldCallRepo.get(callId);
      if (!sess) return;
      
      sess.state = 'accepted';
      sess.staff_id = user.staffId;
      sess.updated_at = Date.now();
      
      await oldCallRepo.update(sess);
      nsp.to(rooms.call(callId)).emit('call:update', { state: 'accepted', staffId: user.staffId });
    });

    // Staff declines call
    socket.on('call:decline', async ({ callId, reason }: { callId: string; reason?: string }) => {
      if (newCallRepo) {
        const call = await newCallRepo.get(callId);
        if (call) {
          await newCallRepo.updateStatus(callId, 'declined', { reason });
          // Emit new event names
          nsp.to(rooms.client(call.createdByUserId)).emit('call.declined', {
            callId,
            reason: reason || 'Call declined by staff',
          });
          nsp.to(rooms.call(callId)).emit('call:update', { state: 'declined', reason });
          return;
        }
      }
      
      // Fallback to old repository
      const sess = await oldCallRepo.get(callId);
      if (!sess) return;
      
      sess.state = 'declined';
      sess.staff_id = user.staffId;
      sess.updated_at = Date.now();
      
      await oldCallRepo.update(sess);
      nsp.to(rooms.call(callId)).emit('call:update', { state: 'declined', reason });
    });

    // SDP exchange - also emit as webrtc.offer/webrtc.answer for new spec
    socket.on('call:sdp', async ({ callId, type, sdp }: { callId: string; type: 'offer' | 'answer'; sdp: any }) => {
      // Try new repository first
      if (newCallRepo) {
        const call = await newCallRepo.get(callId);
        if (!call) {
          console.error(`[Socket] Call ${callId} not found for SDP exchange`);
          return;
        }
        // Update call metadata with SDP (new repo doesn't store SDP directly, but we can in metadata)
        await newCallRepo.updateStatus(callId, call.status, {
          metadata: { ...call.metadata, [`sdp_${type}`]: sdp },
        });
      } else {
        // Fallback to old repository
        const sess = await oldCallRepo.get(callId);
        if (!sess) {
          console.error(`[Socket] Call ${callId} not found for SDP exchange`);
          return;
        }
        
        if (type === 'offer') sess.sdp_offer = sdp;
        else sess.sdp_answer = sdp;
        sess.updated_at = Date.now();
        
        await oldCallRepo.update(sess);
      }
      
      console.log(`[Socket] Broadcasting ${type} for call ${callId} to room ${rooms.call(callId)}`);
      // Emit both old and new event names for compatibility
      nsp.to(rooms.call(callId)).emit('call:sdp', { callId, type, sdp });
      nsp.to(rooms.call(callId)).emit(`webrtc.${type}`, { callId, sdp });
      
      // Also send directly to the socket that didn't send it (for immediate delivery)
      const roomSockets = await nsp.in(rooms.call(callId)).fetchSockets();
      console.log(`[Socket] Room ${rooms.call(callId)} has ${roomSockets.length} socket(s)`);
      roomSockets.forEach(s => {
        if (s.id !== socket.id) {
          s.emit('call:sdp', { callId, type, sdp });
          s.emit(`webrtc.${type}`, { callId, sdp });
        }
      });
    });

    // ICE candidate exchange - also emit as webrtc.ice for new spec
    socket.on('call:ice', async ({ callId, candidate }: { callId: string; candidate: any }) => {
      // Verify call exists
      let callExists = false;
      if (newCallRepo) {
        const call = await newCallRepo.get(callId);
        callExists = !!call;
      } else {
        const sess = await oldCallRepo.get(callId);
        callExists = !!sess;
      }
      
      if (!callExists) return;
      
      // Broadcast to all participants in the call room (both old and new event names)
      socket.to(rooms.call(callId)).emit('call:ice', { callId, candidate });
      socket.to(rooms.call(callId)).emit('webrtc.ice', { callId, candidate });
    });

    // Notification handlers
    socket.on('notifications:mark-read', async ({ notificationId }: { notificationId: string }) => {
      // Handle marking notification as read
      socket.emit('notifications:read', { notificationId });
    });

    socket.on('notifications:mark-all-read', async () => {
      // Handle marking all notifications as read
      socket.emit('notifications:all-read', { success: true });
    });

    // Appointment notification handlers
    socket.on('appointment:request', async ({ appointmentId, staffId }: { appointmentId: string; staffId: string }) => {
      if (appointmentRepo) {
        const appointment = await appointmentRepo.get(appointmentId);
        if (appointment && appointment.staffId === staffId) {
          // Notify staff about new appointment request
          nsp.to(rooms.staff(staffId)).emit('notifications:appointment', {
            type: 'new_appointment',
            appointment: {
              appointmentId: appointment.appointmentId,
              clientName: appointment.clientName,
              purpose: appointment.purpose,
              appointmentDate: appointment.appointmentDate,
              appointmentTime: appointment.appointmentTime
            }
          });
        }
      }
    });

    socket.on('appointment:decision', async ({ appointmentId, decision, staffId }: { appointmentId: string; decision: 'approved' | 'rejected'; staffId: string }) => {
      if (appointmentRepo) {
        const appointment = await appointmentRepo.get(appointmentId);
        if (appointment) {
          const updatedAppointment = {
            ...appointment,
            status: decision === 'approved' ? 'Confirmed' as const : 'Cancelled' as const,
            updatedAt: Date.now()
          };
          await appointmentRepo.update(updatedAppointment);

          // Notify client about decision
          nsp.to(rooms.client(appointment.clientId)).emit('notifications:appointment_decision', {
            appointmentId,
            decision,
            appointment: updatedAppointment
          });

          // Notify staff
          nsp.to(rooms.staff(staffId)).emit('notifications:appointment_updated', {
            appointmentId,
            status: updatedAppointment.status
          });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${user.userId} disconnected`);
    });
  });
}

