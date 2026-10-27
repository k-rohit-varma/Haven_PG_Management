import { useEffect, useState } from 'react';
import { Activity, ArrowRight, BedDouble, Building2, ClipboardList, CreditCard, Users, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api.js';

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise || 0) / 100);
const date = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));

export default function AdminOverviewPage() {
  const [summary, setSummary] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  async function load() { setLoading(true); setError(''); try { const { data } = await api.get('/admin/summary'); setSummary(data.data.summary); } catch (e) { setError(getErrorMessage(e)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  if (loading) return <div className="feature-loading">Loading system overview…</div>;
  if (error) return <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>;
  const stats = [
    ['Registered users', summary.users, Users], ['Administrators', summary.userRoles.ADMIN, Users], ['Owners', summary.userRoles.OWNER, Users], ['Tenants', summary.userRoles.TENANT, Users],
    ['Hostels', summary.hostels, Building2], ['Rooms', summary.rooms, BedDouble], ['Active stays', summary.activeStays, Activity],
    ['Vacant capacity', summary.vacantCapacity, BedDouble], ['Pending applications', summary.pendingApplications, ClipboardList],
    ['Pending payments', summary.pendingPayments, CreditCard], ['Outstanding rent', money(summary.outstandingPaise), WalletCards],
    ['Overdue dues', summary.overdueDueCount, WalletCards], ['Overdue balance', money(summary.overduePaise), WalletCards],
  ];
  return <div className="feature-page admin-page"><div className="feature-heading"><div><span className="eyebrow">SYSTEM OVERVIEW</span><h1>Overview</h1><p>Live counts and recent activity across the whole service.</p></div><button className="button button-secondary" onClick={load}>Refresh</button></div>
    <div className="stats-grid admin-stats">{stats.map(([label, value, Icon]) => <article className="stat-card" key={label}><div className="stat-top">{label}<span className="stat-icon lavender"><Icon size={17} /></span></div><div className="stat-value">{value}</div></article>)}</div>
    <section className="panel admin-panel"><div className="panel-header"><div><h2>Recent system activity</h2><p>Latest recorded actions from the audit history.</p></div><Link className="text-link" to="/admin/audit">Open audit log <ArrowRight size={13} /></Link></div>{summary.recentActivity.length ? <div className="audit-list">{summary.recentActivity.map((log) => <article className="audit-item" key={log._id}><div className="audit-icon"><Activity size={15} /></div><div className="audit-copy"><b>{log.action.replaceAll('_', ' ')}</b><span>{log.actorId?.name || 'System user'} ({log.actorId?.role || '—'}) · {log.entityType} · {log.entityId}</span><small>{date(log.occurredAt)} · {log.reason}</small></div></article>)}</div> : <div className="rent-empty"><Activity size={18} /><b>No recorded activity yet</b></div>}</section>
  </div>;
}
