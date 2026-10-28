import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, Building2, ChevronDown, LayoutDashboard, LogOut, Menu, Users, WalletCards, X, Check, Sun, Moon, ClipboardList } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useToast } from '../common/ToastContext.jsx';

const ownerNav = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'My properties', to: '/hostels', icon: Building2 },
  { label: 'Tenants', to: '/tenants', icon: Users },
  { label: 'Payments', to: '/payments', icon: LayoutDashboard },
  { label: 'Deposits', to: '/deposits', icon: WalletCards },
];
const adminNav = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'Admin workspace', to: '/admin', icon: Users },
  { label: 'Hostels', to: '/hostels', icon: Building2 },
  { label: 'Tenants', to: '/tenants', icon: Users },
  { label: 'Payments', to: '/payments', icon: LayoutDashboard },
  { label: 'Deposits', to: '/deposits', icon: WalletCards },
  { label: 'Audit logs', to: '/admin/audit', icon: ClipboardList },
];

export default function AppLayout() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const notificationsRef = useRef(null);
  const [theme, setTheme] = useState(() => globalThis.localStorage?.getItem('pg-theme') === 'dark' ? 'dark' : 'light');
  const firstName = user?.name?.split(' ')[0] || 'there';
  const initials = user?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'PG';
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());
  const navigation = user?.role === 'ADMIN' ? adminNav : ownerNav;
  const workspaceName = user?.role === 'ADMIN' ? 'Admin workspace' : 'Owner workspace';

  useEffect(() => {
    api.get('/notifications').then(({ data }) => setUnreadCount(data.data.unreadCount)).catch(() => setUnreadCount(0));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    globalThis.localStorage?.setItem('pg-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const closeOutside = (event) => { if (!notificationsRef.current?.contains(event.target)) setNotificationsOpen(false); };
    const closeEscape = (event) => { if (event.key === 'Escape') setNotificationsOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [notificationsOpen]);

  async function signOut() {
    try { await api.post('/auth/logout'); } finally { setUser(null); navigate('/login'); showToast('You have been signed out.'); }
  }

  async function loadNotifications() {
    setNotificationsLoading(true); setNotificationsError('');
    try { const { data } = await api.get('/notifications'); setNotifications(data.data.items); setUnreadCount(data.data.unreadCount); }
    catch (error) { setNotificationsError(error.response?.data?.error?.message || 'Could not load notifications.'); }
    finally { setNotificationsLoading(false); }
  }

  async function toggleNotifications() {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening) await loadNotifications();
  }

  async function markNotificationRead(item) {
    try { await api.patch(`/notifications/${item._id}/read`); setNotifications((items) => items.map((notification) => notification._id === item._id ? { ...notification, readAt: new Date().toISOString() } : notification)); setUnreadCount((count) => Math.max(0, count - (item.readAt ? 0 : 1))); if (item.destination) navigate(item.destination); setNotificationsOpen(false); }
    catch (error) { setNotificationsError(error.response?.data?.error?.message || 'Could not update this notification.'); }
  }

  async function markAllRead() {
    try { await api.patch('/notifications/read-all'); setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))); setUnreadCount(0); }
    catch (error) { setNotificationsError(error.response?.data?.error?.message || 'Could not update notifications.'); }
  }

  return <div className="app-frame">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Building2 size={20} strokeWidth={2.2} /></span><span>haven<span className="brand-period">.</span><small>PROPERTY CARE</small></span><button className="mobile-close icon-button" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="workspace-switch"><span className="workspace-emoji">⌂</span><span><b>{user?.role === 'ADMIN' ? 'All properties' : 'My properties'}</b><small>{workspaceName}</small></span><ChevronDown size={15} /></button>
      <div className="nav-label">MANAGE</div>
      <nav className="main-nav">{navigation.map(({ label, to, icon: Icon, count }) => <NavLink key={to} to={to} end={to === '/' || to === '/admin'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{count && <span className="nav-count">{count}</span>}</NavLink>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-bottom"><div className="profile-row"><div className="avatar">{initials}</div><div className="profile-info"><b>{user?.name || 'PG Owner'}</b><small>{user?.phone || user?.email || 'Account'}</small></div><button className="icon-button signout" title="Sign out" onClick={signOut}><LogOut size={17} /></button></div></div>
    </aside>
    {mobileOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="breadcrumbs">Workspace <span>/</span> <b>Overview</b></div><div className="top-actions"><span className="today-label">{today}</span><button className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><div className="notification-wrap" ref={notificationsRef}><button className="icon-button notification-button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen} onClick={toggleNotifications}><Bell size={19} />{unreadCount > 0 && <i />}{unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>{notificationsOpen && <section className="notification-panel" aria-label="Notifications"><div className="notification-panel-heading"><div><b>Notifications</b><small>{unreadCount} unread</small></div><button className="text-link" disabled={!unreadCount} onClick={markAllRead}><Check size={13} />Mark all read</button></div>{notificationsLoading ? <div className="notification-state">Loading notifications…</div> : notificationsError ? <div className="notification-state notification-error" role="alert">{notificationsError}<button onClick={loadNotifications}>Retry</button></div> : notifications.length ? <div className="notification-items">{notifications.map((item) => <button className={`notification-item ${item.readAt ? '' : 'unread'}`} key={item._id} onClick={() => markNotificationRead(item)}><b>{item.title}</b><span>{item.message}</span><small>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(item.createdAt))}</small></button>)}</div> : <div className="notification-state">You’re all caught up. No notifications yet.</div>}</section>}</div><div className="top-avatar">{initials}</div></div></header><section className="page-area"><Outlet context={{ firstName }} /></section></main>
  </div>;
}
