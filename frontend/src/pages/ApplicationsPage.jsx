import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Building2, CalendarDays, Check, Clock3, MapPin, X } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import Pagination from '../components/common/Pagination.jsx';

const assignmentSchema = z.object({
  roomId: z.string().regex(/^[a-f\d]{24}$/i, 'Select an available room.'),
  moveInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a move-in date.'),
  monthlyRent: z.coerce.number().positive('Enter a positive monthly rent.'),
  deposit: z.coerce.number().min(0, 'Deposit cannot be negative.'),
});
const rejectionSchema = z.object({ reason: z.string().trim().min(3, 'Add a short reason for the tenant.').max(500) });
const dateInIndia = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
const formatDate = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));

function Status({ value }) { return <span className={`status-pill ${value.toLowerCase()}`}><i />{value}</span>; }

export default function ApplicationsPage() {
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isTenant = user?.role === 'TENANT';
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, pages: 1, total: 0 });
  const requestSequence = useRef(0);
  const [statusFilter, setStatusFilter] = useState(isTenant ? '' : location.state?.hostelId ? '' : 'PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignApp, setAssignApp] = useState(null);
  const [roomOptions, setRoomOptions] = useState([]);
  const [rejectApp, setRejectApp] = useState(null);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(assignmentSchema), defaultValues: { moveInDate: dateInIndia(new Date()), monthlyRent: '', deposit: 0 } });
  const rejectionForm = useForm({ resolver: zodResolver(rejectionSchema) });
  const roomId = watch('roomId');
  const selectedRoom = roomOptions.find((room) => room._id === roomId);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const path = isTenant ? '/tenant-applications/my' : '/tenant-applications/owner';
      const { data } = await api.get(path, { params: { page, limit: 20, ...(!isTenant && location.state?.hostelId ? { hostelId: location.state.hostelId } : {}), ...(statusFilter ? { status: statusFilter } : {}) } });
      if (sequence === requestSequence.current) { setItems(data.data.items); setPagination(data.data.pagination); }
    } catch (requestError) { if (sequence === requestSequence.current) setError(getErrorMessage(requestError)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [isTenant, location.state?.hostelId, page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function openAssignment(application) {
    setSaving(true);
    try {
      const { data } = await api.get(`/hostels/${application.hostelId._id}/rooms`, { params: { limit: 100, active: 'true' } });
      const available = data.data.items.filter((room) => room.availableBeds > 0 && room.isActive !== false);
      if (!available.length) { showToast('No rooms currently have an available bed.', 'error'); return; }
      setRoomOptions(available);
      setAssignApp(application);
      const selectedRoom = available.find((room) => room._id === location.state?.roomId) || available[0];
      reset({ roomId: selectedRoom._id, moveInDate: dateInIndia(new Date()), monthlyRent: selectedRoom.defaultRentPaise / 100, deposit: 0 });
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function approve(values) {
    setSaving(true);
    try {
      await api.post(`/tenant-applications/${assignApp._id}/approve-and-assign`, {
        roomId: values.roomId,
        moveInDate: values.moveInDate,
        agreedMonthlyRentPaise: Math.round(values.monthlyRent * 100),
        securityDepositPaise: Math.round(values.deposit * 100),
      });
      setAssignApp(null);
      await load();
      showToast('Application approved and stay confirmed.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function reject(values) {
    setSaving(true);
    try {
      await api.patch(`/tenant-applications/${rejectApp._id}/decision`, { decision: 'REJECTED', reason: values.reason });
      setRejectApp(null);
      rejectionForm.reset();
      await load();
      showToast('Application rejected. The decision is saved in its history.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function approveOnly(application) {
    setSaving(true);
    try {
      await api.post(`/tenant-applications/${application._id}/approve`);
      await load();
      showToast('Application approved. The tenant is eligible for room assignment.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function cancel(application) {
    try {
      await api.post(`/tenant-applications/${application._id}/cancel`);
      await load();
      showToast('Application cancelled.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  return <div className="feature-page">
    <div className="feature-heading"><div><span className="eyebrow">{isTenant ? 'YOUR REQUESTS' : 'TENANT INTAKE'}</span><h1>{isTenant ? 'My applications' : 'Applications'}</h1><p>{isTenant ? 'Follow each hostel application and its decision.' : 'Review and respond to applications for your properties.'}</p></div></div>
    <div className="feature-toolbar">{!isTenant && <label className="filter-select-label">Show<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All decisions</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option></select></label>}<span className="result-count">{pagination.total} applications</span></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {loading ? <div className="feature-loading">Loading applications…</div> : items.length ? <div className="application-list">{items.map((application) => {
      const hostel = application.hostelId || {};
      const tenant = application.tenantId || {};
      return <article className="application-card" key={application._id}><span className="application-avatar">{(isTenant ? user.name : tenant.name || 'T').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div className="application-main"><div className="application-title"><h2>{isTenant ? hostel.name || 'Hostel' : tenant.name || 'Tenant'}</h2><Status value={application.status} /></div><div className="application-subtitle">{isTenant ? <><MapPin size={13} />{hostel.city} · {hostel.address}</> : <><Building2 size={13} />{hostel.name} · {hostel.city}</>}</div>{!isTenant && <div className="application-personal">{tenant.email} · {tenant.gender?.replaceAll('_', ' ').toLowerCase()}</div>}<div className="application-date"><CalendarDays size={13} />Applied {formatDate(application.submittedAt)}</div>{application.rejectionReason && <p className="decision-reason">Reason: {application.rejectionReason}</p>}<details className="history-disclosure"><summary>Application history ({application.events.length})</summary><ol>{application.events.map((event, index) => <li key={`${event.at}-${index}`}><b>{event.toStatus}</b><span>{formatDate(event.at)}{event.reason ? ` · ${event.reason}` : ''}</span></li>)}</ol></details></div><div className="application-actions">{!isTenant && application.status === 'PENDING' && <><button className="button button-secondary" onClick={() => { setRejectApp(application); rejectionForm.reset({ reason: '' }); }}><X size={14} />Reject</button><button disabled={saving} className="button button-secondary" onClick={() => approveOnly(application)}><Check size={14} />Approve</button><button disabled={saving} className="button button-primary" onClick={() => openAssignment(application)}><Check size={14} />Approve & assign</button></>}{!isTenant && application.status === 'APPROVED' && !application.stayAssigned && <button disabled={saving} className="button button-primary" onClick={() => openAssignment(application)}><Check size={14} />Assign tenant</button>}{isTenant && application.status === 'PENDING' && <button className="button button-secondary" onClick={() => cancel(application)}>Cancel application</button>}{isTenant && application.status === 'APPROVED' && (application.stayAssigned ? <Link className="text-link" to="/residents">View your stay <ArrowRight size={14} /></Link> : <span className="optional-label">Approved · awaiting room assignment</span>)}</div></article>;
    })}</div> : !error && <div className="feature-empty"><span className="empty-icon"><Clock3 size={19} /></span><h2>{isTenant ? 'No applications yet' : statusFilter === 'PENDING' ? 'No pending applications' : 'No applications found'}</h2><p>{isTenant ? 'Browse available hostels to start an application.' : 'New tenant applications will appear here.'}</p>{isTenant && <Link className="button button-primary" to="/hostels">Browse hostels <ArrowRight size={15} /></Link>}</div>}
    {!loading && <Pagination page={page} pages={pagination.pages || 1} total={pagination.total} onPageChange={setPage} />}

    {assignApp && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssignApp(null); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="assign-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setAssignApp(null)}>×</button><span className="eyebrow">CONFIRM STAY</span><h2 id="assign-title">Approve {assignApp.tenantId.name}</h2><p>This creates a new stay and locks the agreed financial terms.</p><div className="assignment-summary"><span>Tenant: <b>{assignApp.tenantId.name}</b></span><span>Property: <b>{assignApp.hostelId.name} · {assignApp.hostelId.city}</b></span></div><form className="stacked-form" onSubmit={handleSubmit(approve)}>
      <label>Room<select {...register('roomId')} onChange={(event) => { register('roomId').onChange(event); const room = roomOptions.find((option) => option._id === event.target.value); if (room) reset({ ...watch(), roomId: room._id, monthlyRent: room.defaultRentPaise / 100 }); }}>{roomOptions.map((room) => <option value={room._id} key={room._id}>Room {room.identifier} · {room.availableBeds} bed(s) free · {({ MALE: 'Male only', FEMALE: 'Female only', ANY: 'Mixed / any' })[room.genderEligibility] || 'Eligibility unconfigured'}</option>)}</select>{errors.roomId && <small>{errors.roomId.message}</small>}</label>
      {selectedRoom && <div className="assignment-room-note">{selectedRoom.sharingType}-sharing · {selectedRoom.occupancy} occupied · {selectedRoom.availableBeds} available · {selectedRoom.genderEligibility ? ({ MALE: 'Male Only', FEMALE: 'Female Only', ANY: 'Mixed / Any' })[selectedRoom.genderEligibility] : 'Eligibility unconfigured'} · Room default rent: ₹{selectedRoom.defaultRentPaise / 100} per bed</div>}
      <div className="form-columns"><label>Move-in date<input type="date" {...register('moveInDate')} />{errors.moveInDate && <small>{errors.moveInDate.message}</small>}</label><label>Agreed monthly rent (₹)<input type="number" min="0.01" step="0.01" {...register('monthlyRent')} />{errors.monthlyRent && <small>{errors.monthlyRent.message}</small>}</label></div>
      <label>Security deposit (₹)<input type="number" min="0" step="0.01" {...register('deposit')} />{errors.deposit && <small>{errors.deposit.message}</small>}</label>
      <div className="assignment-confirmation"><b>Assignment summary</b><span>{assignApp.tenantId.name} · {assignApp.hostelId.name} · Room {selectedRoom?.identifier || '—'}</span><span>Agreed rent: ₹{Number(watch('monthlyRent') || 0).toLocaleString('en-IN')} / month · Deposit: ₹{Number(watch('deposit') || 0).toLocaleString('en-IN')}</span><span>Move-in: {watch('moveInDate') || 'Choose a date'}</span></div>
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setAssignApp(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Confirming…' : 'Approve and assign'}</button></div>
    </form></section></div>}

    {rejectApp && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRejectApp(null); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setRejectApp(null)}>×</button><span className="eyebrow">APPLICATION DECISION</span><h2 id="reject-title">Reject {rejectApp.tenantId.name}?</h2><p>The decision and reason will remain in the application history.</p><form className="stacked-form" onSubmit={rejectionForm.handleSubmit(reject)}><label>Reason<textarea {...rejectionForm.register('reason')} rows="3" placeholder="Share a brief explanation" />{rejectionForm.formState.errors.reason && <small>{rejectionForm.formState.errors.reason.message}</small>}</label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setRejectApp(null)}>Keep pending</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Confirm rejection'}</button></div></form></section></div>}
  </div>;
}
