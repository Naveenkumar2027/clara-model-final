import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StaffProfile, NavItem } from '../types';
import { getStaffRole } from '../constants';

interface SidebarProps {
  user: StaffProfile;
  activeItem: NavItem;
  setActiveItem: (item: NavItem) => void;
}

const navItems: { name: NavItem; icon: string }[] = [
  { name: 'Dashboard', icon: 'fa-solid fa-table-columns' },
  { name: 'Timetable', icon: 'fa-solid fa-calendar-days' },
  { name: 'Appointments', icon: 'fa-solid fa-handshake' },
  { name: 'Task Management', icon: 'fa-solid fa-list-check' },
  { name: 'AI Assistant', icon: 'fa-solid fa-robot' },
  { name: 'Meeting Summarizer', icon: 'fa-solid fa-file-lines' },
  { name: 'Team Directory', icon: 'fa-solid fa-users' },
  { name: 'Settings', icon: 'fa-solid fa-cog' },
];

const Sidebar: React.FC<SidebarProps> = ({ user, activeItem, setActiveItem }) => {
  const navigate = useNavigate();
  const { username } = useParams<{ username: string }>();

  const handleNavClick = (item: NavItem) => {
    setActiveItem(item);
    if (item === 'Settings' && username) {
      navigate(`/${username}/settings`);
    } else if (username && item !== 'Settings') {
      navigate(`/${username}`);
    }
  };

  // Extract initials from user name or use avatar if it's already initials
  const getInitials = (name: string): string => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Check if avatar is a URL or already initials
  const isUrl = (str: string): boolean => {
    try {
      return str.startsWith('http://') || str.startsWith('https://') || str.includes('?');
    } catch {
      return false;
    }
  };

  const displayAvatar = isUrl(user.avatar) ? getInitials(user.name) : user.avatar;

  return (
    <aside className="fixed top-0 left-0 h-full w-[260px] bg-slate-900/50 backdrop-blur-lg border-r border-white/10 p-6 flex flex-col text-white transition-transform transform -translate-x-full lg:translate-x-0">
      <div className="flex items-center space-x-4 mb-10">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-xl font-bold">
            {displayAvatar}
        </div>
        <div>
          <h3 className="font-bold">{user.name}</h3>
          <p className="text-sm text-slate-400">{getStaffRole(user)}</p>
        </div>
      </div>

      <nav className="flex flex-col space-y-2">
        {navItems.map((item) => (
          <button
            key={item.name}
            onClick={() => handleNavClick(item.name)}
            className={`flex items-center space-x-4 p-3 rounded-lg transition-all duration-200 ${
              activeItem === item.name
                ? 'bg-blue-600/50 text-white'
                : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <i className={`${item.icon} w-6 text-center`}></i>
            <span className="font-semibold">{item.name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;