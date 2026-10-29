import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, BedDouble, Building2, CreditCard, Users, WalletCards } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';
import Pagination from '../components/common/Pagination.jsx';

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise || 0) / 100);
const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

export default function AdminOverviewPage() {
  const [summary, setSummary] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [payments, setPayments] = useState([]);
  const [overduePagination, setOverduePagination] = useState({ pages: 1, total: 0 });
  const [paymentPagination, setPaymentPagination] = useState({ pages: 1, total: 0 });
  const [overduePage, setOverduePage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [overduePageSize, setOverduePageSize] = useState(10);
  const [paymentPageSize, setPaymentPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const [summaryResponse, overdueResponse, paymentResponse] = await Promise.all([
        api.get('/admin/summary'),
        api.get('/admin/rent-dues', { params: { overdueOnly: 'true', page: overduePage, limit: overduePageSize } }),
        api.get('/admin/payments', { params: { page: paymentPage, limit: paymentPageSize } }),
      ]);
      if (sequence === requestSequence.current) {
        setSummary(summaryResponse.data.data.summary);
        setOverdue(overdueResponse.data.data.items);
        setOverduePagination(overdueResponse.data.data.pagination);
        setPayments(paymentResponse.data.data.items);
        setPaymentPagination(paymentResponse.data.data.pagination);
      }
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(getErrorMessage(requestError));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [overduePage, overduePageSize, paymentPage, paymentPageSize]);

  useEffect(() => { load(); }, [load]);

  if (loading && !summary) return <div className="feature-loading">Loading system overview…</div>;
  if (error && !summary) return <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>;
  if (!summary) return null;

  const stats = [
    ['Registered users', summary.users, Users], ['Administrators', summary.userRoles.ADMIN, Users], ['Owners', summary.userRoles.OWNER, Users], ['Tenants', summary.userRoles.TENANT, Users],
    ['Hostels', summary.hostels, Building2], ['Rooms', summary.rooms, BedDouble], ['Active stays', summary.activeStays, Activity],
    ['Available rooms', summary.availableRooms, Building2], ['Available beds', summary.vacantCapacity, BedDouble],
    ['Overdue dues', summary.overdueDueCount, CreditCard], ['Overdue balance', money(summary.overduePaise), WalletCards],
  ];

  return <div className="feature-page admin-page admin-overview-page">
    <div className="feature-heading"><div><span className="eyebrow">SYSTEM OVERVIEW</span><h1>Overview</h1><p>Live counts and room capacity across the whole service.</p></div><button className="button button-secondary" onClick={load}>Refresh</button></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    <div className="stats-grid admin-stats">{stats.map(([label, value, Icon]) => <article className="stat-card" key={label}><div className="stat-top">{label}<span className="stat-icon lavender"><Icon size={17} /></span></div><div className="stat-value">{value}</div></article>)}</div>
    <section className="panel admin-panel"><div className="panel-header"><div><h2>Capacity by sharing type</h2><p>Active rooms and occupants with active stays.</p></div></div>{summary.sharingSummary?.length ? <div className="table-wrap"><table><thead><tr><th>SHARING TYPE</th><th>ROOMS</th><th>TOTAL CAPACITY</th><th>OCCUPIED BEDS</th><th>AVAILABLE BEDS</th></tr></thead><tbody>{summary.sharingSummary.map((item) => <tr key={item.sharingType}><td>{item.sharingType}-sharing</td><td>{item.totalRooms}</td><td>{item.totalCapacity}</td><td>{item.occupiedBeds}</td><td>{item.availableBeds}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><BedDouble size={18} /><b>No active rooms configured</b></div>}</section>
    <section className="panel admin-panel"><div className="panel-header"><div><h2>Overdue rent</h2><p>{overduePagination.total} unpaid dues past their due date, including partially paid dues.</p></div></div>{overdue.length ? <div className="table-wrap"><table><thead><tr><th>TENANT</th><th>PROPERTY / ROOM</th><th>PERIOD</th><th>DUE DATE</th><th>OUTSTANDING</th></tr></thead><tbody>{overdue.map((due) => <tr key={due._id}><td>{due.tenantId?.name || '—'}</td><td>{due.hostelId?.name || '—'} · {due.roomId?.identifier || '—'}</td><td>{due.billingPeriod}</td><td>{date(due.dueDate)}</td><td>{money(due.outstandingPaise)}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><CreditCard size={18} /><b>No overdue rent</b></div>}<Pagination page={overduePage} pages={overduePagination.pages || 1} total={overduePagination.total} pageSize={overduePageSize} pageSizes={[10, 20, 50]} onPageChange={setOverduePage} onPageSizeChange={(size) => { setOverduePage(1); setOverduePageSize(size); }} /></section>
    <section className="panel admin-panel"><div className="panel-header"><div><h2>Recent payment history</h2><p>{paymentPagination.total} payments across active stays.</p></div></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>TENANT</th><th>PROPERTY</th><th>PAID ON</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment._id}><td>{payment.tenantId?.name || '—'}</td><td>{payment.hostelId?.name || '—'}</td><td>{date(payment.paidOn || payment.decidedAt || payment.submittedAt)}</td><td>{money(payment.amountPaise)}</td><td>{payment.status}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><CreditCard size={18} /><b>No payments yet</b></div>}<Pagination page={paymentPage} pages={paymentPagination.pages || 1} total={paymentPagination.total} pageSize={paymentPageSize} pageSizes={[10, 20, 50]} onPageChange={setPaymentPage} onPageSizeChange={(size) => { setPaymentPage(1); setPaymentPageSize(size); }} /></section>
  </div>;
}
