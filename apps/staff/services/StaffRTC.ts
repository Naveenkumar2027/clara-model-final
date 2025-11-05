import { io, Socket } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || '/socket';
const ENABLE_UNIFIED = import.meta.env.VITE_ENABLE_UNIFIED_MODE === 'true';

export interface CallIncomingEvent {
  callId: string;
  clientInfo: {
    clientId: string;
    name?: string;
    phone?: string;
  };
  purpose?: string;
  ts: number;
}

export interface CallUpdateEvent {
  state: 'created' | 'ringing' | 'accepted' | 'declined' | 'ended';
  staffId?: string;
  reason?: string;
}

export interface CallSDPEvent {
  callId: string;
  type: 'offer' | 'answer';
  sdp: string;
}

export interface CallICEEvent {
  callId: string;
  candidate: RTCIceCandidateInit;
}

export class StaffRTC {
  private socket: Socket | null = null;
  private apiBase: string;
  private token: string;
  private staffId: string;
  private activeCalls: Map<string, { pc: RTCPeerConnection; stream: MediaStream }> = new Map();

  constructor({ apiBase = API_BASE, token, staffId }: { apiBase?: string; token: string; staffId: string }) {
    this.apiBase = apiBase;
    this.token = token;
    this.staffId = staffId;
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private ensureSocket() {
    if (!this.socket) {
      const socketUrl = this.apiBase.replace(/\/api$/, '');
      this.socket = io(socketUrl, {
        path: SOCKET_PATH,
        auth: { token: this.token },
      });

      // Join staff room
      this.socket.on('connect', () => {
        console.log('Staff socket connected');
      });
    }
    return this.socket;
  }

  attachHandlers({
    onIncoming,
    onUpdate,
  }: {
    onIncoming: (event: CallIncomingEvent) => void;
    onUpdate: (event: CallUpdateEvent) => void;
  }) {
    if (!ENABLE_UNIFIED) return;

    const socket = this.ensureSocket();

    socket.on('call:incoming', (event: CallIncomingEvent) => {
      onIncoming(event);
    });

    socket.on('call:update', (event: CallUpdateEvent) => {
      onUpdate(event);
    });
  }

  async accept(callId: string): Promise<{ pc: RTCPeerConnection; stream: MediaStream } | null> {
    if (!ENABLE_UNIFIED) return null;

    try {
      // Accept via REST
      const res = await fetch(`${this.apiBase}/api/calls/accept`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ callId, staffId: this.staffId }),
      });

      if (!res.ok) {
        throw new Error(`Failed to accept call: ${res.statusText}`);
      }

      // Join call room
      const socket = this.ensureSocket();
      socket.emit('join:call', { callId });

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle ICE candidates
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          fetch(`${this.apiBase}/api/calls/ice`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ callId, from: this.staffId, candidate: e.candidate }),
          }).catch(console.error);
        }
      };

      // Listen for offer
      socket.on('call:sdp', async ({ type, sdp }: CallSDPEvent) => {
        if (type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await fetch(`${this.apiBase}/api/calls/sdp`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ callId, from: this.staffId, type: 'answer', sdp: answer.sdp }),
          });
        }
      });

      // Listen for ICE candidates
      socket.on('call:ice', async ({ candidate }: CallICEEvent) => {
        if (candidate) {
          await pc.addIceCandidate(candidate);
        }
      });

      this.activeCalls.set(callId, { pc, stream });

      return { pc, stream };
    } catch (error) {
      console.error('StaffRTC.accept error:', error);
      return null;
    }
  }

  async decline(callId: string, reason?: string): Promise<void> {
    if (!ENABLE_UNIFIED) return;

    try {
      await fetch(`${this.apiBase}/api/calls/decline`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ callId, staffId: this.staffId, reason }),
      });
    } catch (error) {
      console.error('Failed to decline call:', error);
    }
  }

  endCall(callId: string) {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.stream.getTracks().forEach((t) => t.stop());
      call.pc.close();
      this.activeCalls.delete(callId);
    }
  }

  disconnect() {
    this.activeCalls.forEach((call) => {
      call.stream.getTracks().forEach((t) => t.stop());
      call.pc.close();
    });
    this.activeCalls.clear();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

