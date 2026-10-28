import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, BedDouble, Building2, CircleDollarSign, Clock3, CreditCard, Users } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise || 0) / 100);
const date = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
const label = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
function Status({ value }) { return <span className={`status-pill ${(value || '').toLowerCase()}`}><i />{label(value)}</span>; }
function Metric({ label: title, value, note, icon: Icon, tone = 'lavender' }) { return <article className="stat-card"><div className="stat-top">{title}<span className={`stat-icon ${tone}`}><Icon size={17} /></span></div><div className="stat-value">{value}</div><div className="stat-foot">{note}</div></article>; }
function Empty({ children }) { return <div className="rent-empty"><Clock3 size={18} /><b>{children}</b></div>; }

export default function DashboardPage() {
  const { firstName } = useOutletContext();
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date()));
  useEffect(() => { setLoading(true); api.get('/dashboards/owner', { params: { month } }).then((response) => setData(response.data.data.dashboard)).catch((requestError) => setError(getErrorMessage(requestError))).finally(() => setLoading(false)); }, [month]);
  if (loading && !data) return <div className="feature-loading">Loading your property dashboard…</div>;
  if (error) return <div className="feature-error" role="alert">{error}<button onClick={() => window.location.reload()}>Try again</button></div>;
  const stats = [
    { label: 'Total rooms', value: data.totalRooms, note: `${data.totalHostels} properties`, icon: Building2, tone: 'lavender' },
    { label: 'Beds occupied', value: `${data.occupiedBeds} / ${data.totalBeds}`, note: `${data.availableBeds} available`, icon: BedDouble, tone: 'green' },
    { label: 'Rent collected', value: money(data.rentCollectedPaise), note: 'Verified payments only', icon: CircleDollarSign, tone: 'yellow' },
    { label: 'Legacy pending payments', value: data.pendingPayments, note: 'Historical tenant requests', icon: CreditCard, tone: 'peach' },
    { label: 'Active tenants', value: data.activeTenants, note: 'Across your properties', icon: Users, tone: 'lavender' },
    { label: 'Outstanding rent', value: money(data.outstandingPaise), note: 'After verified allocations', icon: CircleDollarSign, tone: 'peach' },
  ];
  return <div className="feature-page dashboard-page">
    <div className="welcome-row"><div><div className="eyebrow">PROPERTY OVERVIEW <span className="eyebrow-dot" />LIVE SUMMARY</div><h1>Welcome back, {firstName}</h1><p>Occupancy, rent and payment activity across your properties.</p></div><div className="welcome-actions"><label className="filter-select-label dashboard-month">Rent month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><Link className="button button-secondary" to="/tenants">Manage tenants</Link><Link className="button button-primary" to="/hostels">Manage properties <ArrowRight size={15} /></Link></div></div>
    <div className="stats-grid owner-dashboard-stats">{stats.map((item) => <Metric {...item} key={item.label} />)}</div>
    <div className="content-grid"><section className="panel"><div className="panel-header"><div><h2>Overdue rent</h2><p>{money(data.overduePaise)} outstanding past the due date</p></div><Link className="text-link" to="/payments">View rent <ArrowRight size={13} /></Link></div>{data.overdue.length ? <div className="table-wrap"><table><thead><tr><th>TENANT</th><th>PERIOD</th><th>DUE DATE</th><th>OUTSTANDING</th></tr></thead><tbody>{data.overdue.map((due) => <tr key={due._id}><td><div className="resident-cell"><span className="resident-avatar peach"><Users size={13} /></span><span><b>{due.tenantId?.name}</b><small>Room {due.roomId?.identifier}</small></span></div></td><td>{due.billingPeriod}</td><td>{date(due.dueDate)}</td><td className="amount-cell">{money(due.amountDuePaise - due.amountSettledPaise)}</td></tr>)}</tbody></table></div> : <Empty>No overdue rent</Empty>}</section>
      <section className="panel"><div className="panel-header"><div><h2>Upcoming rent</h2><p>{money(data.upcomingPaise)} remaining on future dues</p></div><Link className="text-link" to="/payments">View all <ArrowRight size={13} /></Link></div>{data.upcoming.length ? <div className="table-wrap"><table><thead><tr><th>TENANT</th><th>DUE DATE</th><th>OUTSTANDING</th></tr></thead><tbody>{data.upcoming.map((due) => <tr key={due._id}><td><div className="resident-cell"><span className="resident-avatar mint"><Users size={13} /></span><span><b>{due.tenantId?.name}</b><small>Room {due.roomId?.identifier}</small></span></div></td><td>{date(due.dueDate)}</td><td className="amount-cell">{money(due.amountDuePaise - due.amountSettledPaise)}</td></tr>)}</tbody></table></div> : <Empty>No upcoming rent</Empty>}</section></div>
    <section className="panel tenant-recent-payments"><div className="panel-header"><div><h2>Recent payment history</h2><p>Recorded and historical payment entries</p></div><Link className="text-link" to="/payments">All payments <ArrowRight size={13} /></Link></div>{data.recentPayments.length ? <div className="table-wrap"><table><thead><tr><th>TENANT</th><th>PROPERTY</th><th>RECORDED</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>{data.recentPayments.map((payment) => <tr key={payment._id}><td>{payment.tenantId?.name}</td><td>{payment.hostelId?.name}</td><td>{payment.decidedAt ? date(payment.decidedAt) : date(payment.submittedAt)}</td><td className="amount-cell">{money(payment.amountPaise)}</td><td><Status value={payment.status} /></td></tr>)}</tbody></table></div> : <Empty>No payments yet</Empty>}</section>
    <div className="dashboard-footer"><span>Rent dues and balances use verified payments only.</span><span className="footer-spacer" /><span>{data.totalHostels} properties · {data.totalRooms} rooms</span></div>
  </div>;
}
