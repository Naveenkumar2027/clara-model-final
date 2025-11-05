import { io, Socket } from 'socket.io-client';

interface CallUpdateEvent {
  state: 'created' | 'ringing' | 'accepted' | 'declined' | 'ended';
  staffId?: string;
  reason?: string;
}

interface CallSDPEvent {
  callId: string;
  type: 'offer' | 'answer';
  sdp: string;
}

interface CallICEEvent {
  callId: string;
  candidate: RTCIceCandidateInit;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || '/socket';
const ENABLE_UNIFIED = import.meta.env.VITE_ENABLE_UNIFIED_MODE === 'true';

export interface CallServiceOptions {
  apiBase?: string;
  token: string;
  clientId: string;
}

export class CallService {
  private socket: Socket | null = null;
  private apiBase: string;
  private token: string;
  private clientId: string;
  private activeCalls: Map<string, { pc: RTCPeerConnection; stream: MediaStream }> = new Map();

  constructor({ apiBase = API_BASE, token, clientId }: CallServiceOptions) {
    this.apiBase = apiBase;
    this.token = token;
    this.clientId = clientId;
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
    }
    return this.socket;
  }

  async startCall({
    targetStaffId,
    department,
    purpose,
    onAccepted,
    onDeclined,
    onError,
  }: {
    targetStaffId?: string;
    department?: string;
    purpose?: string;
    onAccepted?: (callId: string, pc: RTCPeerConnection, stream: MediaStream) => void;
    onDeclined?: (reason?: string) => void;
    onError?: (error: Error) => void;
  }): Promise<{ callId: string; pc: RTCPeerConnection; stream: MediaStream } | null> {
    if (!ENABLE_UNIFIED) {
      console.warn('Unified mode disabled');
      return null;
    }

    try {
      // Initiate call
      const res = await fetch(`${this.apiBase}/api/calls/initiate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ clientId: this.clientId, targetStaffId, department, purpose }),
      });

      if (!res.ok) {
        throw new Error(`Failed to initiate call: ${res.statusText}`);
      }

      const { callId } = await res.json();

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
            body: JSON.stringify({ callId, from: this.clientId, candidate: e.candidate }),
          }).catch(console.error);
        }
      };

      // Handle remote stream
      pc.ontrack = (e) => {
        if (onAccepted) {
          onAccepted(callId, pc, e.streams[0]);
        }
      };

      // Listen for call updates
      socket.on('call:update', ({ state, reason }: CallUpdateEvent) => {
        if (state === 'declined') {
          stream.getTracks().forEach((t) => t.stop());
          pc.close();
          this.activeCalls.delete(callId);
          if (onDeclined) onDeclined(reason);
        } else if (state === 'accepted') {
          // Create and send offer
          this.createOffer(callId, pc);
        }
      });

      // Listen for SDP answer
      socket.on('call:sdp', async ({ type, sdp }: CallSDPEvent) => {
        if (type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp });
        }
      });

      // Listen for ICE candidates
      socket.on('call:ice', async ({ candidate }: CallICEEvent) => {
        if (candidate) {
          await pc.addIceCandidate(candidate);
        }
      });

      this.activeCalls.set(callId, { pc, stream });

      return { callId, pc, stream };
    } catch (error) {
      console.error('CallService.startCall error:', error);
      if (onError) onError(error as Error);
      return null;
    }
  }

  private async createOffer(callId: string, pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await fetch(`${this.apiBase}/api/calls/sdp`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ callId, from: this.clientId, type: 'offer', sdp: offer.sdp }),
      });
    } catch (error) {
      console.error('Failed to create offer:', error);
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

