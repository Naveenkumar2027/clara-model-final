import { Namespace } from 'socket.io';
import type { AuthPayload, CallSession } from '@clara/shared';
import { rooms } from '@clara/shared';
import { CallRepository } from './repository.js';

export function setupSocketHandlers(nsp: Namespace, callRepo: CallRepository) {
  nsp.on('connection', (socket) => {
    const user: AuthPayload = (socket as any).user;
    
    // Join role-based rooms
    if (user.role === 'staff' && user.staffId) {
      socket.join(rooms.staff(user.staffId));
      if (user.dept) socket.join(rooms.dept(user.dept));
      console.log(`Staff ${user.staffId} connected`);
    }
    if (user.role === 'client') {
      socket.join(rooms.client(user.userId));
      console.log(`Client ${user.userId} connected`);
    }

    // Join a specific call room
    socket.on('join:call', async ({ callId }: { callId: string }) => {
      socket.join(rooms.call(callId));
      const sess = await callRepo.get(callId);
      if (sess) {
        socket.emit('call:update', { state: sess.state });
      }
    });

    // Staff accepts call
    socket.on('call:accept', async ({ callId }: { callId: string }) => {
      const sess = await callRepo.get(callId);
      if (!sess) return;
      
      sess.state = 'accepted';
      sess.staff_id = user.staffId;
      sess.updated_at = Date.now();
      
      await callRepo.update(sess);
      nsp.to(rooms.call(callId)).emit('call:update', { state: 'accepted', staffId: user.staffId });
    });

    // Staff declines call
    socket.on('call:decline', async ({ callId, reason }: { callId: string; reason?: string }) => {
      const sess = await callRepo.get(callId);
      if (!sess) return;
      
      sess.state = 'declined';
      sess.staff_id = user.staffId;
      sess.updated_at = Date.now();
      
      await callRepo.update(sess);
      nsp.to(rooms.call(callId)).emit('call:update', { state: 'declined', reason });
    });

    // SDP exchange
    socket.on('call:sdp', async ({ callId, type, sdp }: { callId: string; type: 'offer' | 'answer'; sdp: any }) => {
      const sess = await callRepo.get(callId);
      if (!sess) return;
      
      if (type === 'offer') sess.sdp_offer = sdp;
      else sess.sdp_answer = sdp;
      sess.updated_at = Date.now();
      
      await callRepo.update(sess);
      
      // Broadcast to all participants in the call room
      socket.to(rooms.call(callId)).emit('call:sdp', { callId, type, sdp });
    });

    // ICE candidate exchange
    socket.on('call:ice', async ({ callId, candidate }: { callId: string; candidate: any }) => {
      const sess = await callRepo.get(callId);
      if (!sess) return;
      
      // Broadcast to all participants in the call room
      socket.to(rooms.call(callId)).emit('call:ice', { callId, candidate });
    });

    socket.on('disconnect', () => {
      console.log(`User ${user.userId} disconnected`);
    });
  });
}

