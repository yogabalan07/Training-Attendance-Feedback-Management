import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface MenuItem {
  label: string;
  path: string;
  icon: string;
  permission?: string;
  roles?: string[];
}

const menuItems: MenuItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: '📊' },
  { label: 'Users', path: '/users', icon: '👤', permission: 'users.view', roles: ['ADMIN'] },
  { label: 'Students', path: '/students', icon: '🎓', permission: 'students.view', roles: ['ADMIN'] },
  { label: 'Trainers', path: '/trainers', icon: '👨‍🏫', permission: 'trainers.view', roles: ['ADMIN'] },
  { label: 'Departments', path: '/departments', icon: '🏢', permission: 'departments.view', roles: ['ADMIN'] },
  { label: 'Academic Years', path: '/academic-years', icon: '📅', permission: 'academic-years.view', roles: ['ADMIN'] },
  { label: 'Batches', path: '/batches', icon: '📦', permission: 'batches.view', roles: ['ADMIN'] },
  { label: 'Sessions', path: '/sessions', icon: '📋', permission: 'sessions.view', roles: ['ADMIN', 'INTERNAL_TRAINER'] },
  { label: 'My Sessions', path: '/my-sessions', icon: '📋', roles: ['EXTERNAL_TRAINER', 'STUDENT'] },
  { label: 'Assignments', path: '/assignments', icon: '🔗', permission: 'assignments.view', roles: ['ADMIN'] },
  { label: 'My Assignments', path: '/my-assignments', icon: '🔗', roles: ['EXTERNAL_TRAINER', 'INTERNAL_TRAINER'] },
  { label: 'Attendance', path: '/attendance', icon: '✅', permission: 'attendance.view', roles: ['ADMIN', 'INTERNAL_TRAINER'] },
  { label: 'My Attendance', path: '/my-attendance', icon: '✅', roles: ['STUDENT'] },
  { label: 'Feedback', path: '/feedback', icon: '💬', permission: 'feedback.view', roles: ['ADMIN', 'INTERNAL_TRAINER'] },
  { label: 'Give Feedback', path: '/give-feedback', icon: '💬', roles: ['STUDENT'] },
  { label: 'Reports', path: '/reports', icon: '📈', permission: 'reports.view', roles: ['ADMIN', 'INTERNAL_TRAINER'] },
  { label: 'Permissions', path: '/permissions', icon: '🔐', permission: 'permissions.view', roles: ['ADMIN'] },
  { label: 'Audit Logs', path: '/audit-logs', icon: '📝', permission: 'audit-logs.view', roles: ['ADMIN'] },
  { label: 'Settings', path: '/settings', icon: '⚙️', permission: 'settings.view', roles: ['ADMIN'] },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout, hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = menuItems.filter((item) => {
    if (item.roles && !item.roles.some((role) => hasRole(role))) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <div className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">TAMS</h2>
          {sidebarOpen && <span className="sidebar-subtitle">Training Management</span>}
        </div>
        <nav className="sidebar-nav">
          {filteredItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

      <div className={`main-area ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-toggle desktop-only"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              ☰
            </button>
            <button
              className="menu-toggle mobile-only"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              ☰
            </button>
            <h1 className="page-title">Training Attendance & Feedback Management</h1>
          </div>
          <div className="topbar-right">
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role?.name?.replace('_', ' ')}</span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
