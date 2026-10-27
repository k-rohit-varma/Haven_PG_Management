import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BedDouble, Building2, CalendarDays, Check, Clock3, LogOut, MapPin, Users, RefreshCw } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import Pagination from '../components/common/Pagination.jsx';

const leaveSchema = z.object({ leavingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(500) });
const todayIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dayInIndia = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const formatDate = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
const formatMoney = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

function Status({ value }) { return <span className={`status-pill ${value.toLowerCase()}`}><i />{value}</span>; }

export default function StaysPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isTenant = user?.role === 'TENANT';
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, pages: 1, total: 0 });
  const requestSequence = useRef(0);
  const [statusFilter, setStatusFilter] = useState(isTenant ? '' : 'ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leavingStay, setLeavingStay] = useState(null);
  const [saving, setSaving] = useState(false);
  const [roomChangeStay, setRoomChangeStay] = useState(null);
  const [roomOptions, setRoomOptions] = useState([]);
  const [roomChangeId, setRoomChangeId] = useState('');
  const [roomChangeReason, setRoomChangeReason] = useState('');
  const [roomChangeRequests, setRoomChangeRequests] = useState([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(leaveSchema), defaultValues: { leavingDate: todayIndia(), reason: '' } });

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const path = isTenant ? '/stays/my' : '/stays/owner';
      const { data } = await api.get(path, { params: { page, limit: 20, ...(statusFilter ? { status: statusFilter } : {}) } });
      if (sequence === requestSequence.current) { setItems(data.data.items); setPagination(data.data.pagination); }
    } catch (requestError) { if (sequence === requestSequence.current) setError(getErrorMessage(requestError)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [isTenant, page, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isTenant) api.get('/room-change-requests/my', { params: { limit: 100 } }).then(({ data }) => setRoomChangeRequests(data.data.items)).catch(() => setRoomChangeRequests([])); }, [isTenant]);

  function openLeave(stay) {
    setLeavingStay(stay);
    reset({ leavingDate: todayIndia(), reason: '' });
  }

  async function markLeft(values) {
    setSaving(true);
    try {
      await api.post(`/stays/${leavingStay._id}/mark-left`, values);
      setLeavingStay(null);
      await load();
      showToast('Stay closed. Earlier rent and payment records remain attached to it.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function openRoomChange(stay) {
    setSaving(true);
    try {
      const [roomsResponse, requestsResponse] = await Promise.all([
        api.get(`/hostels/${stay.hostelId._id}/rooms`, { params: { page: 1, limit: 100, active: 'true' } }),
        api.get('/room-change-requests/my', { params: { limit: 100 } }),
      ]);
      const available = roomsResponse.data.data.items.filter((room) => room._id !== stay.roomId?._id && room.availableBeds > 0 && room.isActive !== false);
      setRoomOptions(available);
      setRoomChangeRequests(requestsResponse.data.data.items);
      setRoomChangeId(available[0]?._id || '');
      setRoomChangeReason('');
      setRoomChangeStay(stay);
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function submitRoomChange(event) {
    event.preventDefault();
    if (!roomChangeId || roomChangeReason.trim().length < 3) return;
    setSaving(true);
    try {
      await api.post('/room-change-requests', { stayId: roomChangeStay._id, requestedRoomId: roomChangeId, reason: roomChangeReason.trim() });
      const { data } = await api.get('/room-change-requests/my', { params: { limit: 100 } });
      setRoomChangeRequests(data.data.items);
      setRoomChangeStay(null);
      showToast('Room-change request submitted for owner review. Your current room is unchanged.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  return <div className="feature-page">
    <div className="feature-heading"><div><span className="eyebrow">OCCUPANCY HISTORY</span><h1>{isTenant ? 'My stays' : 'Residents'}</h1><p>{isTenant ? 'Your current and previous room agreements.' : 'Active residents and completed stays across your properties.'}</p></div></div>
    <div className="feature-toolbar">{!isTenant && <label className="filter-select-label">Show<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All stays</option><option value="ACTIVE">Active</option><option value="LEFT">Previous</option></select></label>}<span className="result-count">{pagination.total} stays</span></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {loading ? <div className="feature-loading">Loading stays…</div> : items.length ? <div className="stay-list">{items.map((stay) => {
      const hostel = stay.hostelId || {};
      const room = stay.roomId || {};
      const tenant = stay.tenantId || {};
      const currentRentPaise = [...(stay.rentTerms || [])].filter((term) => dayInIndia(term.effectiveFrom) <= todayIndia()).sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom)).at(-1)?.monthlyRentPaise || stay.agreedMonthlyRentPaise;
      const pendingRoomChange = roomChangeRequests.find((request) => request.stayId?._id === stay._id && request.status === 'PENDING');
      return <article className="stay-card" key={stay._id}><div className="stay-icon"><BedDouble size={20} /></div><div className="stay-main"><div className="stay-title"><h2>{isTenant ? hostel.name || 'Hostel' : tenant.name || 'Resident'}</h2><Status value={stay.status} /></div><div className="stay-place"><Building2 size={13} />{hostel.name}{hostel.city ? ` · ${hostel.city}` : ''}</div>{!isTenant && <div className="stay-personal"><Users size={13} />{tenant.email} · {tenant.gender?.replaceAll('_', ' ').toLowerCase()}</div>}<div className="stay-room"><MapPin size={13} />Room {room.identifier} · {room.sharingType}-sharing</div><div className="stay-dates"><CalendarDays size={13} />Moved in {formatDate(stay.moveInDate)}{stay.leavingDate && ` · Left ${formatDate(stay.leavingDate)}`}</div><details className="history-disclosure"><summary>Stay history ({stay.events.length})</summary><ol>{stay.events.map((event, index) => <li key={`${event.at}-${index}`}><b>{event.toStatus}</b><span>{formatDate(event.at)}{event.reason ? ` · ${event.reason}` : ''}</span></li>)}</ol></details>{stay.roomTransfers?.length > 0 && <details className="history-disclosure"><summary>Room transfer history ({stay.roomTransfers.length})</summary><ol>{stay.roomTransfers.map((transfer) => <li key={transfer.requestId}><b>Room {transfer.fromRoomId?.identifier || '—'} → {transfer.toRoomId?.identifier || '—'}</b><span>{formatDate(transfer.effectiveAt)}</span></li>)}</ol></details>}{stay.rentTerms?.length > 0 && <details className="history-disclosure"><summary>Rent terms ({stay.rentTerms.length})</summary><ol>{[...stay.rentTerms].sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom)).map((term, index) => <li key={`${term.effectiveFrom}-${index}`}><b>{formatMoney(term.monthlyRentPaise)} / month</b><span>Effective {formatDate(term.effectiveFrom)}{term.reason ? ` · ${term.reason}` : ''}</span></li>)}</ol></details>}</div><div className="stay-terms"><b>{formatMoney(currentRentPaise)}<small> / month</small></b><span>Deposit {formatMoney(stay.securityDepositPaise)}</span><span>Due day {stay.rentCycleAnchorDay} each month</span><Link to="/deposits" className="text-link">Deposit history <ArrowRight size={13} /></Link>{isTenant && stay.status === 'ACTIVE' && <Link to="/rent-changes" className="text-link">Request rent change <ArrowRight size={13} /></Link>}{isTenant && stay.status === 'ACTIVE' && (pendingRoomChange ? <span className="optional-label">Room change pending</span> : <button type="button" className="text-link request-link" onClick={() => openRoomChange(stay)}><RefreshCw size={13} />Request room change</button>)}{isTenant && <Link to="/payments" className="text-link">View rent <ArrowRight size={13} /></Link>}</div>{!isTenant && stay.status === 'ACTIVE' && <button className="button button-secondary leave-button" onClick={() => openLeave(stay)}><LogOut size={14} />Mark as left</button>}</article>;
    })}</div> : !error && <div className="feature-empty"><span className="empty-icon"><Clock3 size={19} /></span><h2>{isTenant ? 'No stays yet' : 'No residents found'}</h2><p>{isTenant ? 'When an owner confirms a room assignment, your stay details will appear here.' : 'Approved room assignments will show as active stays.'}</p>{isTenant && <Link className="button button-primary" to="/hostels">Browse hostels <ArrowRight size={15} /></Link>}</div>}
    {!loading && <Pagination page={page} pages={pagination.pages || 1} total={pagination.total} onPageChange={setPage} />}

    {roomChangeStay && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoomChangeStay(null); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="room-change-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setRoomChangeStay(null)}>×</button><span className="eyebrow">TENANT REQUEST</span><h2 id="room-change-title">Request a room change</h2><p>Your current stay remains unchanged until the assigned owner or admin approves this request.</p><form className="stacked-form" onSubmit={submitRoomChange}><label>Current room<input value={`Room ${roomChangeStay.roomId?.identifier || ''}`} readOnly /></label><label>Requested room<select required value={roomChangeId} onChange={(event) => setRoomChangeId(event.target.value)}><option value="">Choose an available room</option>{roomOptions.map((room) => <option key={room._id} value={room._id}>Room {room.identifier} · {room.availableBeds} available · {room.genderEligibility}</option>)}</select>{!roomOptions.length && <small>No other eligible room currently has availability.</small>}</label><label>Reason<textarea required minLength="3" maxLength="1000" rows="3" value={roomChangeReason} onChange={(event) => setRoomChangeReason(event.target.value)} placeholder="Explain why you are requesting a room change" /></label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setRoomChangeStay(null)}>Cancel</button><button className="button button-primary" disabled={saving || !roomChangeId || roomChangeReason.trim().length < 3}>{saving ? 'Submitting…' : 'Submit request'}</button></div></form></section></div>}

    {leavingStay && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeavingStay(null); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setLeavingStay(null)}>×</button><span className="eyebrow">CLOSE ACTIVE STAY</span><h2 id="leave-title">Mark {leavingStay.tenantId.name} as left?</h2><p>This ends future occupancy and rent generation. Existing dues, payments, and deposit history stay preserved.</p><form className="stacked-form" onSubmit={handleSubmit(markLeft)}><label>Leaving date<input type="date" max={todayIndia()} {...register('leavingDate')} />{errors.leavingDate && <small>{errors.leavingDate.message}</small>}</label><label>Note <span className="optional-label">Optional, preserved in stay history</span><textarea {...register('reason')} rows="3" placeholder="Add a handover or closure note" /></label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setLeavingStay(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Closing…' : <><Check size={14} />Confirm leaving date</>}</button></div></form></section></div>}
  </div>;
}
