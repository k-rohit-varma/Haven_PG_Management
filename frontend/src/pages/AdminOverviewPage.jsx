import { useEffect, useState } from 'react';
import { Activity, BedDouble, Building2, CreditCard, Users, WalletCards } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise || 0) / 100);

export default function AdminOverviewPage() {
  const [summary, setSummary] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  async function load() { setLoading(true); setError(''); try { const { data } = await api.get('/admin/summary'); setSummary(data.data.summary); } catch (e) { setError(getErrorMessage(e)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  if (loading) return <div className="feature-loading">Loading system overview…</div>;
  if (error) return <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>;
  const stats = [
    ['Registered users', summary.users, Users], ['Administrators', summary.userRoles.ADMIN, Users], ['Owners', summary.userRoles.OWNER, Users], ['Tenants', summary.userRoles.TENANT, Users],
    ['Hostels', summary.hostels, Building2], ['Rooms', summary.rooms, BedDouble], ['Active stays', summary.activeStays, Activity],
    ['Available rooms', summary.availableRooms, Building2], ['Available beds', summary.vacantCapacity, BedDouble],
    ['Overdue dues', summary.overdueDueCount, CreditCard], ['Overdue balance', money(summary.overduePaise), WalletCards],
  ];
  return <div className="feature-page admin-page admin-overview-page"><div className="feature-heading"><div><span className="eyebrow">SYSTEM OVERVIEW</span><h1>Overview</h1><p>Live counts and room capacity across the whole service.</p></div><button className="button button-secondary" onClick={load}>Refresh</button></div>
    <div className="stats-grid admin-stats">{stats.map(([label, value, Icon]) => <article className="stat-card" key={label}><div className="stat-top">{label}<span className="stat-icon lavender"><Icon size={17} /></span></div><div className="stat-value">{value}</div></article>)}</div>
    <section className="panel admin-panel"><div className="panel-header"><div><h2>Capacity by sharing type</h2><p>Active rooms and occupants with active stays.</p></div></div>{summary.sharingSummary?.length ? <div className="table-wrap"><table><thead><tr><th>SHARING TYPE</th><th>ROOMS</th><th>TOTAL CAPACITY</th><th>OCCUPIED BEDS</th><th>AVAILABLE BEDS</th></tr></thead><tbody>{summary.sharingSummary.map((item) => <tr key={item.sharingType}><td>{item.sharingType}-sharing</td><td>{item.totalRooms}</td><td>{item.totalCapacity}</td><td>{item.occupiedBeds}</td><td>{item.availableBeds}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><BedDouble size={18} /><b>No active rooms configured</b></div>}</section>
  </div>;
}
