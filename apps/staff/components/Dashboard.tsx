import React, { useState, createContext, useEffect, useRef } from 'react';
import { StaffProfile, NavItem, TimetableEntry, Meeting, Group, ChatMessage } from '../types';
import { HOD_EMAIL } from '../constants';
import Sidebar from './Sidebar';
import DashboardHome from './DashboardHome';
import AIChatAssistant from './AIChatAssistant';
import TaskManagement from './TaskManagement';
import MeetingSummarizer from './MeetingSummarizer';
import Timetable from './Timetable';
import TeamDirectory from './TeamDirectory';
import Settings from './Settings';
import { useNotification } from './NotificationProvider';
import NotificationContainer from './NotificationContainer';
import NotificationSync from './NotificationSync';
import { apiService } from '../services/api';
import IncomingCallModal from './IncomingCallModal';
import VideoCallView from './VideoCallView';
import { StaffRTC, type CallIncomingEvent } from '../services/StaffRTC';
import { useStaffCallStore } from '../src/stores/callStore';
import CallRoom from './CallRoom';
import CallToast, { ToastType } from './CallToast';
import CallEndSummary from './CallEndSummary';

interface DashboardProps {
  user: StaffProfile;
  onLogout: () => void;
  initialView?: NavItem;
}

export const UserContext = createContext<{ user: StaffProfile | null }>({ user: null });

const Appointments: React.FC = () => <div className="text-white p-6 rounded-2xl bg-slate-900/50 backdrop-blur-lg border border-white/10">Appointments Content</div>;

const Header: React.FC<{ activeView: NavItem, onLogout: () => void, user?: StaffProfile }> = ({ activeView, onLogout, user }) => (
    <header className="flex justify-between items-center mb-6 bg-slate-900/30 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
        <div>
            <h1 className="text-3xl font-bold text-white">{activeView}</h1>
            <p className="text-slate-400">Welcome back{user ? `, ${user.name.split(' ').pop()}` : ''}! Here's what's happening today.</p>
        </div>
        <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-2 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span>Connected</span>
            </span>
            <button
                onClick={onLogout}
                className="bg-red-500/80 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
                <i className="fa-solid fa-right-from-bracket"></i>
                <span>Logout</span>
            </button>
        </div>
    </header>
);

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, initialView = 'Dashboard' }) => {
  const [activeView, setActiveView] = useState<NavItem>(initialView);
  const [incomingCall, setIncomingCall] = useState<CallIncomingEvent | null>(null);
  const [staffRTC, setStaffRTC] = useState<StaffRTC | null>(null);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeChatGroup, setActiveChatGroup] = useState<string | null>(null);
  const { addNotification } = useNotification();

  // New call store integration
  const callStore = useStaffCallStore();
  const [toast, setToast] = useState<{ type: ToastType; message?: string } | null>(null);
  const [showEndSummary, setShowEndSummary] = useState(false);

  const isHod = user.email === HOD_EMAIL;

  // Initialize RTC connection when user is available
  useEffect(() => {
    if (!user) return;

    const savedTimetable = localStorage.getItem(`timetable_${user.id}`);
    setTimetable(savedTimetable ? JSON.parse(savedTimetable) : []);
    const savedMeetings = localStorage.getItem('meetings');
    setMeetings(savedMeetings ? JSON.parse(savedMeetings) : []);
    const savedGroups = localStorage.getItem('groups');
    setGroups(savedGroups ? JSON.parse(savedGroups) : []);

    // ALWAYS enable unified RTC for WebRTC calls (required for presentation)
    // Force enable even if env var is not set
    const enableUnified = import.meta.env.VITE_ENABLE_UNIFIED_MODE === 'true' || true;
    if (!enableUnified) {
      console.log('[Dashboard] Unified mode is disabled');
      return;
    }
    console.log('[Dashboard] Unified mode ENABLED (forced for presentation)');

    // Extract staffId from user email (e.g., 'nagashreen' from 'nagashreen@gmail.com')
    // This must match what the client sends as targetStaffId
    const staffId = user.email?.includes('@') 
      ? user.email.split('@')[0] 
      : (user.id?.includes('@') ? user.id.split('@')[0] : (user.id || ''));
    
    console.log('[Dashboard] Initializing StaffRTC for user:', user.email || user.id);
    console.log('[Dashboard] Extracted staffId:', staffId);

    const initializeRTC = async () => {
      try {
        // Always refresh token to ensure it's valid
        const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
        console.log('[Dashboard] Refreshing token for staff:', staffId);
        console.log('[Dashboard] Using API base:', apiBase);
        
        let token = localStorage.getItem('clara-jwt-token');
        
        try {
          // Try unified login format first (works for demo)
          let response = await fetch(`${apiBase}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: user.email || user.id,
              role: 'staff',
              staffId: staffId,
              dept: user.department || 'general',
            }),
          });
          
          if (!response.ok) {
            // Try email/password format as fallback
            console.log('[Dashboard] Unified login failed, trying email/password format...');
            response = await fetch(`${apiBase}/api/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: user.email || user.id,
                password: 'Password123!', // Default password for demo
              }),
            });
          }
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('[Dashboard] Login failed:', response.status, errorText);
            // If we have an old token, try using it anyway
            if (token) {
              console.log('[Dashboard] Using existing token (may be expired)');
            } else {
              throw new Error(`Login failed: ${response.statusText}`);
            }
          } else {
            const data = await response.json();
            token = data.token;
            
            if (!token) {
              console.error('[Dashboard] No token received from login');
              // Check if we had an old token before login attempt
              const oldToken = localStorage.getItem('clara-jwt-token');
              if (oldToken) {
                token = oldToken;
                console.log('[Dashboard] Using existing token (may be expired)');
              } else {
                return;
              }
            } else {
              localStorage.setItem('clara-jwt-token', token);
              console.log('[Dashboard] ✅ Token refreshed and saved to localStorage');
            }
          }
        } catch (error) {
          console.error('[Dashboard] Error during auto-login:', error);
          // If we have an old token, try using it anyway
          if (token) {
            console.log('[Dashboard] Using existing token (may be expired)');
          } else {
            console.error('[Dashboard] No token available, RTC will not work');
            return;
          }
        }

        // Create StaffRTC instance
        const rtc = new StaffRTC({
          token,
          staffId: staffId,
        });
        
        console.log('[Dashboard] StaffRTC created with staffId:', staffId);
        
        // Set staff availability to 'available' on login
        fetch(`${apiBase}/api/v1/staff/availability`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'available',
          }),
        }).catch(err => console.error('[Dashboard] Failed to set availability:', err));

        // Attach handlers BEFORE setting state to ensure they're ready
        rtc.attachHandlers({
          onIncoming: (call) => {
            console.log('[Dashboard] ===== INCOMING CALL RECEIVED =====');
            console.log('[Dashboard] Call details:', JSON.stringify(call, null, 2));
            console.log('[Dashboard] Call ID:', call.callId);
            console.log('[Dashboard] Client Info:', call.clientInfo);
            
            // Update callStore
            callStore.onIncoming({
              callId: call.callId,
              clientInfo: {
                id: call.clientInfo.clientId,
                name: call.clientInfo.name,
              },
              reason: call.purpose,
              createdAt: call.ts,
            });
            callStore.showPopup();
            
            setIncomingCall(call);
            setToast({ type: 'incoming', message: `Incoming call from ${call.clientInfo?.name || call.clientInfo?.clientId}` });
            
            // Add floating glassy notification showing caller name
            const callerName = call.clientInfo?.name || call.clientInfo?.clientId || 'Unknown caller';
            console.log('[Dashboard] Showing notification for caller:', callerName);
            addNotification({
              type: 'call',
              title: 'Incoming Call',
              message: `Incoming video call from ${callerName}`
            });
            console.log('[Dashboard] Notification added and incomingCall state set');
          },
          onUpdate: (update) => {
            console.log('[Dashboard] Call update received:', update);
          },
        });
        
        setStaffRTC(rtc);
        staffRTCRef.current = rtc;
        console.log('[Dashboard] StaffRTC initialized and handlers attached for staffId:', staffId);
      } catch (error) {
        console.error('[Dashboard] Error initializing RTC:', error);
      }
    };

    initializeRTC();

    // Cleanup on unmount
    return () => {
      if (staffRTCRef.current) {
        console.log('[Dashboard] Disconnecting StaffRTC');
        staffRTCRef.current.disconnect();
        staffRTCRef.current = null;
        setStaffRTC(null);
      }
    };
  }, [user, addNotification]); // Depend on user and addNotification
  
  // When active view changes away from Team Directory, clear the active chat
  useEffect(() => {
    if (activeView !== 'Team Directory') {
      setActiveChatGroup(null);
    }
  }, [activeView]);

  const handleTimetableUpdate = (newTimetable: TimetableEntry[]) => {
    setTimetable(newTimetable);
    if (user) {
        localStorage.setItem(`timetable_${user.id}`, JSON.stringify(newTimetable));
    }
  };

  const handleSetMeeting = (meetingData: Omit<Meeting, 'id'>) => {
    const newMeeting = { ...meetingData, id: Date.now().toString() };
    const updatedMeetings = [...meetings, newMeeting];
    setMeetings(updatedMeetings);
    localStorage.setItem('meetings', JSON.stringify(updatedMeetings));
    addNotification({
        type: 'meeting',
        title: 'New Meeting Scheduled',
        message: `"${newMeeting.title}" on ${new Date(newMeeting.date).toLocaleDateString()}`
    });
  };

  const handleCreateGroup = (groupData: Omit<Group, 'id'>) => {
    const newGroup = { ...groupData, id: Date.now().toString(), messages: [] };
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    localStorage.setItem('groups', JSON.stringify(updatedGroups));
  };

  const handleAddMessage = async (groupId: string, messageData: Omit<ChatMessage, 'id'>) => {
    const newMessage = { ...messageData, id: Date.now().toString() };
    const updatedGroups = groups.map(g => 
      g.id === groupId ? { ...g, messages: [...g.messages, newMessage] } : g
    );
    setGroups(updatedGroups);
    localStorage.setItem('groups', JSON.stringify(updatedGroups));

    // Find the group to get member IDs
    const group = updatedGroups.find(g => g.id === groupId);
    if (group && group.members && group.members.length > 0) {
      // Send notification to all group members except the sender
      try {
        await apiService.createNotification(
          group.members,
          'message',
          `New Message in ${group.name}`,
          `${messageData.senderName}: ${messageData.text.substring(0, 40)}${messageData.text.length > 40 ? '...' : ''}`,
          groupId,
          user.id
        );
      } catch (error) {
        console.error('Error creating notification:', error);
      }
    }
  };

  const renderActiveComponent = () => {
    switch (activeView) {
      case 'Dashboard':
        return <DashboardHome timetable={timetable} meetings={meetings} />;
      case 'Timetable':
        return <Timetable initialTimetable={timetable} onTimetableUpdate={handleTimetableUpdate} user={user} />;
      case 'Appointments':
        return <Appointments />;
      case 'Task Management':
        return <TaskManagement />;
      case 'AI Assistant':
        return <AIChatAssistant />;
      case 'Meeting Summarizer':
        return <MeetingSummarizer />;
      case 'Team Directory':
        return <TeamDirectory 
                  isHod={isHod} 
                  currentUser={user}
                  groups={groups}
                  meetings={meetings}
                  onSetMeeting={handleSetMeeting}
                  onCreateGroup={handleCreateGroup}
                  onAddMessage={handleAddMessage}
                  activeChatGroup={activeChatGroup}
                  setActiveChatGroup={setActiveChatGroup}
                />;
      case 'Settings':
        return <Settings />;
      default:
        return <DashboardHome timetable={timetable} meetings={meetings} />;
    }
  };

  const [activeCall, setActiveCall] = useState<{
    callId: string;
    pc: RTCPeerConnection;
    stream: MediaStream;
    remoteStream: MediaStream | null;
  } | null>(null);
  
  // Store staffRTC in a ref to avoid dependency issues
  const staffRTCRef = useRef<StaffRTC | null>(null);

  // Listen for remote stream updates from peer connection
  useEffect(() => {
    if (!activeCall || !activeCall.pc) return;

    const pc = activeCall.pc;
    
    // Check for existing remote stream
    const checkRemoteStream = () => {
      const receivers = pc.getReceivers();
      if (receivers.length > 0) {
        const tracks = receivers.map(r => r.track).filter(Boolean) as MediaStreamTrack[];
        if (tracks.length > 0 && !activeCall.remoteStream) {
          const newRemoteStream = new MediaStream(tracks);
          setActiveCall(prev => prev ? { ...prev, remoteStream: newRemoteStream } : null);
        }
      }
    };

    // Check immediately
    checkRemoteStream();

    // Also listen for new tracks
    const handleTrack = (e: RTCTrackEvent) => {
      if (e.streams && e.streams.length > 0) {
        setActiveCall(prev => prev ? { ...prev, remoteStream: e.streams[0] } : null);
      }
    };

    pc.addEventListener('track', handleTrack);
    
    return () => {
      pc.removeEventListener('track', handleTrack);
    };
  }, [activeCall]);

  const handleAcceptCall = async () => {
    if (!callStore.canAccept()) {
      console.warn('[Dashboard] Cannot accept call from state:', callStore.state);
      return;
    }
    
    const currentRTC = staffRTC || staffRTCRef.current;
    if (!incomingCall || !currentRTC) return;
    
    callStore.acceptCall();
    setToast({ type: 'accepted', message: 'Call accepted!' });
    
    let stream: MediaStream | null = null;
    
    try {
      // First, request camera and microphone permissions
      console.log('[Dashboard] Requesting camera and microphone permissions...');
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('[Dashboard] Permissions granted, proceeding with call acceptance...');
    } catch (error: any) {
      console.error('[Dashboard] Error requesting permissions:', error);
      callStore.setError('Camera/microphone access denied');
      setToast({ type: 'error', message: 'Could not access camera or microphone' });
      // Decline the call if permissions are denied
      await currentRTC.decline(incomingCall.callId, 'Camera/microphone access denied');
      setIncomingCall(null);
      return;
    }
    
    // Now accept the call (pass the stream to avoid requesting again)
    try {
      const result = await currentRTC.accept(incomingCall.callId, stream);
      if (result) {
        setIncomingCall(null);
        callStore.setConnecting();
        
        // Update callStore with streams and peer connection
        callStore.setInCall({
          callId: incomingCall.callId,
          clientInfo: {
            id: incomingCall.clientInfo.clientId,
            name: incomingCall.clientInfo.name,
          },
          peerConnection: result.pc,
          localStream: result.stream,
          remoteStream: result.remoteStream || null,
          startedAt: Date.now(),
        });
        
        // Set active call with peer connection and streams (for backward compatibility)
        setActiveCall({
          callId: incomingCall.callId,
          pc: result.pc,
          stream: result.stream,
          remoteStream: result.remoteStream,
        });
        
        // Handle accepted call - show video UI
        addNotification({
          type: 'meeting',
          title: 'Call Accepted',
          message: `Video call with ${incomingCall.clientInfo.name || incomingCall.clientInfo.clientId} connected`,
        });
      } else {
        // If accept returns null, clean up the stream
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        callStore.setError('Failed to accept call');
        setToast({ type: 'error', message: 'Failed to accept call' });
        alert('Failed to accept call. Please try again.');
      }
    } catch (error: any) {
      console.error('[Dashboard] Error accepting call:', error);
      // Clean up stream if call acceptance failed
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      callStore.setError(error.message || 'Failed to accept call');
      setToast({ type: 'error', message: error.message || 'Failed to accept call' });
      alert(`Failed to accept call: ${error.message || 'Unknown error'}. Please try again.`);
      setIncomingCall(null);
    }
  };

  const handleEndCall = () => {
    callStore.endCall();
    setToast({ type: 'ended', message: 'Call ended' });
    setShowEndSummary(true);
    
    if (activeCall) {
      // Cleanup
      activeCall.stream.getTracks().forEach(track => track.stop());
      if (activeCall.remoteStream) {
        activeCall.remoteStream.getTracks().forEach(track => track.stop());
      }
      activeCall.pc.close();
      const currentRTC = staffRTC || staffRTCRef.current;
      if (currentRTC) {
        currentRTC.endCall(activeCall.callId);
      }
      setActiveCall(null);
      addNotification({
        type: 'system',
        title: 'Call Ended',
        message: 'Video call has been ended',
      });
    }
  };

  const handleDeclineCall = async () => {
    if (!callStore.canDecline()) {
      console.warn('[Dashboard] Cannot decline call from state:', callStore.state);
      return;
    }
    
    const currentRTC = staffRTC || staffRTCRef.current;
    if (!incomingCall || !currentRTC) return;
    
    callStore.declineCall('Declined by staff');
    setToast({ type: 'declined', message: 'Call declined' });
    
    await currentRTC.decline(incomingCall.callId, 'Declined by staff');
    setIncomingCall(null);
  };

  return (
    <UserContext.Provider value={{ user }}>
      <div className="flex min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e1b4b] p-4 lg:p-6 font-sans">
        <Sidebar user={user} activeItem={activeView} setActiveItem={setActiveView} />
        <main className="flex-1 ml-4 lg:ml-[280px] transition-all duration-300">
          <Header activeView={activeView} onLogout={onLogout} user={user} />
          <div className="h-[calc(100vh-120px)] overflow-y-auto pr-2">
              {renderActiveComponent()}
          </div>
        </main>
        {/* Sync notifications from backend */}
        <NotificationSync userId={user.id} isActive={activeView !== 'Team Directory'} />
        {/* Show notifications in all views except Team Directory */}
        {activeView !== 'Team Directory' && <NotificationContainer />}
        {/* Enhanced IncomingCallModal with ringtone */}
        <IncomingCallModal
          visible={callStore.state === 'incoming' || callStore.state === 'popup_visible'}
          call={incomingCall}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
          onAutoDismiss={() => {
            callStore.onCanceled();
            setIncomingCall(null);
          }}
        />
        {/* Use new CallRoom if in call, otherwise use legacy VideoCallView for compatibility */}
        {callStore.state === 'in_call' && callStore.callData.localStream ? (
          <>
            <CallRoom onEndCall={handleEndCall} />
            {toast && (
              <CallToast
                type={toast.type}
                message={toast.message}
                onDismiss={() => setToast(null)}
                duration={3000}
              />
            )}
          </>
        ) : activeCall ? (
          <>
            <VideoCallView
              clientName={incomingCall?.clientInfo.name || incomingCall?.clientInfo.clientId || 'Client'}
              callId={activeCall.callId}
              onEndCall={handleEndCall}
              activeCall={activeCall}
            />
            {toast && (
              <CallToast
                type={toast.type}
                message={toast.message}
                onDismiss={() => setToast(null)}
                duration={3000}
              />
            )}
          </>
        ) : null}
        {/* Call End Summary */}
        <CallEndSummary
          visible={showEndSummary}
          onClose={() => {
            setShowEndSummary(false);
            callStore.reset();
          }}
        />
      </div>
    </UserContext.Provider>
  );
};

export default Dashboard;