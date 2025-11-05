import React, { useState, createContext, useEffect } from 'react';
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
import { StaffRTC, type CallIncomingEvent } from '../services/StaffRTC';

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

  const isHod = user.email === HOD_EMAIL;

  useEffect(() => {
    if (user) {
      const savedTimetable = localStorage.getItem(`timetable_${user.id}`);
      setTimetable(savedTimetable ? JSON.parse(savedTimetable) : []);
    }
    const savedMeetings = localStorage.getItem('meetings');
    setMeetings(savedMeetings ? JSON.parse(savedMeetings) : []);
    const savedGroups = localStorage.getItem('groups');
    setGroups(savedGroups ? JSON.parse(savedGroups) : []);

    // Initialize unified RTC if enabled
    const enableUnified = import.meta.env.VITE_ENABLE_UNIFIED_MODE === 'true';
    if (enableUnified && user) {
      let token = localStorage.getItem('clara-jwt-token');
      if (!token) {
        // Auto-login for demo
        fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.email,
            role: 'staff',
            staffId: user.id,
            dept: user.department || 'general',
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            token = data.token;
            if (token) {
              localStorage.setItem('clara-jwt-token', token);
              const rtc = new StaffRTC({
                token,
                staffId: user.id,
              });
              rtc.attachHandlers({
                onIncoming: (call) => {
                  setIncomingCall(call);
                },
                onUpdate: (update) => {
                  console.log('Call update:', update);
                },
              });
              setStaffRTC(rtc);
            }
          })
          .catch(console.error);
      } else {
        const rtc = new StaffRTC({
          token,
          staffId: user.id,
        });
        rtc.attachHandlers({
          onIncoming: (call) => {
            setIncomingCall(call);
          },
          onUpdate: (update) => {
            console.log('Call update:', update);
          },
        });
        setStaffRTC(rtc);
      }
    }

    return () => {
      if (staffRTC) {
        staffRTC.disconnect();
      }
    };
  }, [user]);
  
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
        return <Timetable initialTimetable={timetable} onTimetableUpdate={handleTimetableUpdate} />;
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

  const handleAcceptCall = async () => {
    if (!incomingCall || !staffRTC) return;
    const result = await staffRTC.accept(incomingCall.callId);
    if (result) {
      setIncomingCall(null);
      // Handle accepted call - could show video UI
      addNotification({
        type: 'meeting',
        title: 'Call Accepted',
        message: `Video call with ${incomingCall.clientInfo.name || incomingCall.clientInfo.clientId} connected`,
      });
    }
  };

  const handleDeclineCall = async () => {
    if (!incomingCall || !staffRTC) return;
    await staffRTC.decline(incomingCall.callId, 'Declined by staff');
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
        {/* Incoming call modal */}
        <IncomingCallModal
          visible={!!incomingCall}
          call={incomingCall}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      </div>
    </UserContext.Provider>
  );
};

export default Dashboard;