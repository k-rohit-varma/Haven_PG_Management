import { useEffect, useRef, useState } from 'react';
import { Activity, BedDouble, Building2, CreditCard, Users, WalletCards } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';
import Pagination from '../components/common/Pagination.jsx';

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise || 0) / 100);
const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

export default function AdminOverviewPage() {
  const [summary, setSummary] = useState(null);
  const [hostels, setHostels] = useState([]);
  const [selectedHostelId, setSelectedHostelId] = useState('');
  const [sharingSummary, setSharingSummary] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [payments, setPayments] = useState([]);
  const [overduePagination, setOverduePagination] = useState({ pages: 1, total: 0 });
  const [paymentPagination, setPaymentPagination] = useState({ pages: 1, total: 0 });
  const [overduePage, setOverduePage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [overduePageSize, setOverduePageSize] = useState(10);
  const [paymentPageSize, setPaymentPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/admin/summary'),
      api.get('/admin/hostels', { params: { page: 1, limit: 100 } }),
    ]).then(([summaryResponse, hostelResponse]) => {
      if (!current) return;
      const items = hostelResponse.data.data.items || [];
      setSummary(summaryResponse.data.data.summary);
      setHostels(items);
      setSelectedHostelId((existing) => existing || items[0]?._id || '');
    }).catch((requestError) => { if (current) setError(getErrorMessage(requestError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedHostelId) {
      setSharingSummary([]); setOverdue([]); setPayments([]);
      setOverduePagination({ pages: 1, total: 0 }); setPaymentPagination({ pages: 1, total: 0 });
      setDetailsLoading(false);
      return undefined;
    }
    let current = true;
    const sequence = ++requestSequence.current;
    setDetailsLoading(true);
    setDetailsError('');
    setSharingSummary([]); setOverdue([]); setPayments([]);
    setOverduePagination({ pages: 1, total: 0 }); setPaymentPagination({ pages: 1, total: 0 });
    Promise.all([
      api.get('/admin/rooms', { params: { hostelId: selectedHostelId, isActive: 'true', page: 1, limit: 1 } }),
      api.get('/admin/rent-dues', { params: { hostelId: selectedHostelId, overdueOnly: 'true', page: overduePage, limit: overduePageSize } }),
      api.get('/admin/payments', { params: { hostelId: selectedHostelId, page: paymentPage, limit: paymentPageSize } }),
    ]).then(([roomsResponse, overdueResponse, paymentResponse]) => {
      if (!current || sequence !== requestSequence.current) return;
      setSharingSummary(roomsResponse.data.data.sharingSummary || []);
      setOverdue(overdueResponse.data.data.items || []);
      setOverduePagination(overdueResponse.data.data.pagination);
      setPayments(paymentResponse.data.data.items || []);
      setPaymentPagination(paymentResponse.data.data.pagination);
    }).catch((requestError) => { if (current && sequence === requestSequence.current) setDetailsError(getErrorMessage(requestError)); })
      .finally(() => { if (current && sequence === requestSequence.current) setDetailsLoading(false); });
    return () => { current = false; };
  }, [selectedHostelId, overduePage, overduePageSize, paymentPage, paymentPageSize, refreshKey]);

  if (loading && !summary) return <div className="feature-loading">Loading system overview…</div>;
  if (error && !summary) return <div className="feature-error" role="alert">{error}<button onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>;
  if (!summary) return null;

  const stats = [
    ['Registered users', summary.users, Users], ['Administrators', summary.userRoles.ADMIN, Users], ['Owners', summary.userRoles.OWNER, Users], ['Tenants', summary.userRoles.TENANT, Users],
    ['Hostels', summary.hostels, Building2], ['Rooms', summary.rooms, BedDouble], ['Active stays', summary.activeStays, Activity],
    ['Available rooms', summary.availableRooms, Building2], ['Available beds', summary.vacantCapacity, BedDouble],
    ['Overdue dues', summary.overdueDueCount, CreditCard], ['Overdue balance', money(summary.overduePaise), WalletCards],
  ];
  const selectedHostel = hostels.find((hostel) => hostel._id === selectedHostelId);

  return <div className="feature-page admin-page admin-overview-page">
    <div className="feature-heading"><div><span className="eyebrow">SYSTEM OVERVIEW</span><h1>Overview</h1><p>System totals and hostel-specific operations.</p></div><button className="button button-secondary" onClick={() => setRefreshKey((key) => key + 1)}>Refresh</button></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>}
    <div className="stats-grid admin-stats">{stats.map(([label, value, Icon]) => <article className="stat-card" key={label}><div className="stat-top">{label}<span className="stat-icon lavender"><Icon size={17} /></span></div><div className="stat-value">{value}</div></article>)}</div>
    <div className="feature-toolbar"><label className="filter-select-label">Hostel<select aria-label="Choose hostel overview" value={selectedHostelId} onChange={(event) => { setSelectedHostelId(event.target.value); setOverduePage(1); setPaymentPage(1); }}><option value="">Choose a hostel</option>{hostels.map((hostel) => <option key={hostel._id} value={hostel._id}>{hostel.name} · {hostel.city}</option>)}</select></label>{selectedHostel && <span className="result-count">Showing data for {selectedHostel.name}</span>}</div>
    {!selectedHostelId ? <section className="panel admin-panel"><div className="rent-empty"><Building2 size={18} /><b>No hostels available</b><span>Create a hostel to see its room capacity, overdue rent and payment history here.</span></div></section> : <>
      {detailsError && <div className="feature-error" role="alert">{detailsError}<button onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>}
      <section className="panel admin-panel"><div className="panel-header"><div><h2>{selectedHostel?.name} · Capacity by sharing type</h2><p>Active rooms and occupants in this hostel.</p></div></div>{sharingSummary.length ? <div className="table-wrap"><table><thead><tr><th>SHARING TYPE</th><th>ROOMS</th><th>TOTAL CAPACITY</th><th>OCCUPIED BEDS</th><th>AVAILABLE BEDS</th></tr></thead><tbody>{sharingSummary.map((item) => <tr key={item.sharingType}><td>{item.sharingType}-sharing</td><td>{item.totalRooms}</td><td>{item.totalCapacity}</td><td>{item.occupiedBeds}</td><td>{item.availableBeds}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><BedDouble size={18} /><b>{detailsLoading ? 'Loading room capacity…' : 'No active rooms configured for this hostel'}</b></div>}</section>
      <section className="panel admin-panel"><div className="panel-header"><div><h2>{selectedHostel?.name} · Overdue rent</h2><p>{overduePagination.total} unpaid dues past their due date, including partially paid dues.</p></div></div>{overdue.length ? <div className="table-wrap"><table><thead><tr><th>TENANT</th><th>PROPERTY / ROOM</th><th>PERIOD</th><th>DUE DATE</th><th>OUTSTANDING</th></tr></thead><tbody>{overdue.map((due) => <tr key={due._id}><td>{due.tenantId?.name || '—'}</td><td>{due.hostelId?.name || '—'} · {due.roomId?.identifier || '—'}</td><td>{due.billingPeriod}</td><td>{date(due.dueDate)}</td><td>{money(due.outstandingPaise)}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><CreditCard size={18} /><b>{detailsLoading ? 'Loading overdue rent…' : 'No overdue rent for this hostel'}</b></div>}<Pagination page={overduePage} pages={overduePagination.pages || 1} total={overduePagination.total} pageSize={overduePageSize} pageSizes={[10, 20, 50]} onPageChange={setOverduePage} onPageSizeChange={(size) => { setOverduePage(1); setOverduePageSize(size); }} /></section>
      <section className="panel admin-panel"><div className="panel-header"><div><h2>{selectedHostel?.name} · Recent payment history</h2><p>{paymentPagination.total} payments for this hostel.</p></div></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>TENANT</th><th>PROPERTY</th><th>PAID ON</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment._id}><td>{payment.tenantId?.name || '—'}</td><td>{payment.hostelId?.name || '—'}</td><td>{date(payment.paidOn || payment.decidedAt || payment.submittedAt)}</td><td>{money(payment.amountPaise)}</td><td>{payment.status}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><CreditCard size={18} /><b>{detailsLoading ? 'Loading payment history…' : 'No payments recorded for this hostel'}</b></div>}<Pagination page={paymentPage} pages={paymentPagination.pages || 1} total={paymentPagination.total} pageSize={paymentPageSize} pageSizes={[10, 20, 50]} onPageChange={setPaymentPage} onPageSizeChange={(size) => { setPaymentPage(1); setPaymentPageSize(size); }} /></section>
    </>}
  </div>;
}
