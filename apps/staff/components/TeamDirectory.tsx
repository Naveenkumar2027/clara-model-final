import React, { useState, useEffect, useRef } from 'react';
import { StaffProfile, Group, Meeting, ChatMessage } from '../types';
import { STAFF_PROFILES, getStaffRole } from '../constants';

interface TeamDirectoryProps {
    isHod: boolean;
    currentUser: StaffProfile;
    groups: Group[];
    meetings: Meeting[];
    onSetMeeting: (meeting: Omit<Meeting, 'id'>) => void;
    onCreateGroup: (group: Omit<Group, 'id'>) => void;
    onAddMessage: (groupId: string, message: Omit<ChatMessage, 'id'>) => void;
    activeChatGroup: string | null;
    setActiveChatGroup: (id: string | null) => void;
}

const Modal: React.FC<{ children: React.ReactNode, onClose: () => void, title: string }> = ({ children, onClose, title }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="w-full max-w-lg bg-slate-800 border border-white/10 rounded-2xl p-6 text-white shadow-2xl">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">{title}</h2>
                <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            {children}
        </div>
    </div>
);

const CreateGroupModal: React.FC<{ onClose: () => void, onCreateGroup: (group: Omit<Group, 'id'>) => void }> = ({ onClose, onCreateGroup }) => {
    const [groupName, setGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

    const handleToggleMember = (staffId: string) => {
        setSelectedMembers(prev => prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]);
    };

    const handleSubmit = () => {
        if (groupName.trim() && selectedMembers.length > 0) {
            onCreateGroup({ name: groupName, members: selectedMembers, messages: [] });
            onClose();
        } else {
            alert('Please provide a group name and select at least one member.');
        }
    };
    
    return (
        <Modal onClose={onClose} title="Create New Group">
            <div className="space-y-4">
                <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group Name" className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2" />
                <p className="font-semibold">Select Members:</p>
                <div className="max-h-60 overflow-y-auto space-y-2 p-2 bg-slate-900/50 rounded-lg">
                    {STAFF_PROFILES.map(staff => (
                        <div key={staff.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-700/50">
                            <input type="checkbox" id={`member-${staff.id}`} checked={selectedMembers.includes(staff.id)} onChange={() => handleToggleMember(staff.id)} className="form-checkbox h-5 w-5 text-blue-600 bg-slate-700 border-slate-600 rounded" />
                            <label htmlFor={`member-${staff.id}`} className="flex-grow">{staff.name}</label>
                        </div>
                    ))}
                </div>
                 <div className="flex justify-end space-x-4 pt-4">
                    <button onClick={onClose} className="bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">Create Group</button>
                </div>
            </div>
        </Modal>
    );
};

const SetMeetingModal: React.FC<{ onClose: () => void, onSetMeeting: (meeting: Omit<Meeting, 'id'>) => void }> = ({ onClose, onSetMeeting }) => {
    const [formData, setFormData] = useState({ title: '', date: '', time: '', location: '' });
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, [e.target.name]: e.target.value});

    const handleSubmit = () => {
        if (formData.title && formData.date && formData.time && formData.location) {
            onSetMeeting({ ...formData, attendees: STAFF_PROFILES.map(s => s.id) });
            onClose();
        } else {
            alert('Please fill out all fields.');
        }
    }
    return (
         <Modal onClose={onClose} title="Schedule a Meeting">
             <div className="space-y-4">
                <input type="text" name="title" onChange={handleChange} placeholder="Meeting Title" className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2" />
                <input type="date" name="date" onChange={handleChange} className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2" />
                <input type="time" name="time" onChange={handleChange} className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2" />
                <input type="text" name="location" onChange={handleChange} placeholder="Location / Link" className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2" />
                <div className="flex justify-end space-x-4 pt-4">
                    <button onClick={onClose} className="bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">Set Meeting</button>
                </div>
            </div>
        </Modal>
    );
};

const ChatView: React.FC<{ group: Group, currentUser: StaffProfile, onAddMessage: (groupId: string, message: Omit<ChatMessage, 'id'>) => void, onBack: () => void }> = ({ group, currentUser, onAddMessage, onBack }) => {
    const [message, setMessage] = useState('');
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Auto-scroll to the bottom when new messages arrive
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [group.messages]);

    const handleSend = () => {
        if (message.trim()) {
            onAddMessage(group.id, {
                senderId: currentUser.id,
                senderName: currentUser.shortName,
                text: message,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            setMessage('');
        }
    };
    
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onAddMessage(group.id, {
                senderId: currentUser.id,
                senderName: currentUser.shortName,
                text: `Shared a file`,
                fileName: file.name,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    };

    return (
        <div className="bg-slate-900/50 backdrop-blur-lg rounded-2xl border border-white/10 text-white h-full flex flex-col p-4 md:p-6">
            <div className="flex items-center mb-4">
                 <button onClick={onBack} className="mr-4 text-slate-400 hover:text-white"><i className="fa-solid fa-arrow-left"></i></button>
                <h2 className="text-xl font-bold">{group.name}</h2>
            </div>
            <div ref={chatContainerRef} className="flex-grow bg-slate-900/80 rounded-lg p-4 space-y-4 overflow-y-auto mb-4">
                {group.messages.map(msg => (
                     <div key={msg.id} className={`flex ${msg.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-md p-3 rounded-lg ${msg.senderId === currentUser.id ? 'bg-blue-600/70' : 'bg-slate-700/70'}`}>
                            <p className="font-bold text-sm">{msg.senderName}</p>
                            <p>{msg.text}</p>
                            {msg.fileName && (
                                <div className="mt-2 bg-slate-800/80 p-2 rounded-lg flex items-center space-x-2">
                                    <i className="fa-solid fa-file-alt"></i>
                                    <span className="text-sm italic">{msg.fileName}</span>
                                </div>
                            )}
                            <p className="text-xs text-slate-400 text-right mt-1">{msg.timestamp}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex-shrink-0 flex space-x-2">
                <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg"><i className="fa-solid fa-paperclip"></i></button>
                <input value={message} onChange={e => setMessage(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Type a message..." className="w-full bg-slate-700 border-slate-600 rounded-lg px-4 py-2" />
                <button onClick={handleSend} className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg">Send</button>
            </div>
        </div>
    );
};


const TeamDirectory: React.FC<TeamDirectoryProps> = ({ isHod, currentUser, groups, meetings, onSetMeeting, onCreateGroup, onAddMessage, activeChatGroup, setActiveChatGroup }) => {
    const [modal, setModal] = useState<'group' | 'meeting' | null>(null);

    const selectedGroup = activeChatGroup ? groups.find(g => g.id === activeChatGroup) : null;

    if (selectedGroup) {
        return <ChatView group={selectedGroup} currentUser={currentUser} onAddMessage={onAddMessage} onBack={() => setActiveChatGroup(null)} />
    }

    return (
        <div className="text-white h-full grid grid-cols-1 md:grid-cols-3 gap-6">
            {modal === 'group' && <CreateGroupModal onClose={() => setModal(null)} onCreateGroup={onCreateGroup} />}
            {modal === 'meeting' && <SetMeetingModal onClose={() => setModal(null)} onSetMeeting={onSetMeeting} />}
            
            {/* Column 1: Staff Members */}
            <div className="bg-slate-900/50 backdrop-blur-lg rounded-2xl border border-white/10 p-4 md:p-6 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Staff Members</h2>
                    {isHod && (
                        <div className="flex space-x-2">
                            <button onClick={() => setModal('group')} className="bg-blue-600/50 hover:bg-blue-600/80 w-8 h-8 rounded-full flex items-center justify-center" title="Create Group"><i className="fa-solid fa-users-medical"></i></button>
                            <button onClick={() => setModal('meeting')} className="bg-purple-600/50 hover:bg-purple-600/80 w-8 h-8 rounded-full flex items-center justify-center" title="Set Meeting"><i className="fa-solid fa-calendar-plus"></i></button>
                        </div>
                    )}
                </div>
                <div className="space-y-3 overflow-y-auto">
                    {STAFF_PROFILES.map(staff => (
                        <div key={staff.id} className="bg-slate-800/50 p-3 rounded-lg flex items-center space-x-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center font-bold">{staff.avatar}</div>
                            <div>
                                <p className="font-semibold">{staff.name}</p>
                                <p className="text-sm text-slate-400">{getStaffRole(staff)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Column 2: Groups */}
             <div className="bg-slate-900/50 backdrop-blur-lg rounded-2xl border border-white/10 p-4 md:p-6 flex flex-col">
                <h2 className="text-xl font-bold mb-4">Groups</h2>
                 <div className="space-y-3 overflow-y--auto">
                    {groups.length === 0 ? <p className="text-slate-400">No groups created yet.</p> :
                     groups.map(group => (
                        <div key={group.id} onClick={() => setActiveChatGroup(group.id)} className="bg-slate-800/50 p-3 rounded-lg cursor-pointer hover:bg-slate-700/50">
                            <p className="font-semibold">{group.name}</p>
                            <p className="text-sm text-slate-400">{group.members.length} members</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Column 3: Meetings */}
            <div className="bg-slate-900/50 backdrop-blur-lg rounded-2xl border border-white/10 p-4 md:p-6 flex flex-col">
                <h2 className="text-xl font-bold mb-4">Upcoming Meetings</h2>
                <div className="space-y-3 overflow-y-auto">
                     {meetings.length === 0 ? <p className="text-slate-400">No meetings scheduled.</p> :
                     meetings.map(meeting => (
                        <div key={meeting.id} className="bg-slate-800/50 p-3 rounded-lg">
                            <p className="font-semibold">{meeting.title}</p>
                            <p className="text-sm text-slate-400">{new Date(meeting.date).toDateString()} at {meeting.time}</p>
                            <p className="text-sm text-slate-400">@{meeting.location}</p>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
};

export default TeamDirectory;