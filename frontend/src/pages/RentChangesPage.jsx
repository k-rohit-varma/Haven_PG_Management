import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, RefreshCw, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';

const requestSchema = z.object({ stayId: z.string().min(1), requestedRent: z.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => Number(value) > 0), reason: z.string().trim().min(3).max(1000) });
const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
const date = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
const indiaDay = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const todayIndia = () => indiaDay(new Date());
const label = (value) => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export default function RentChangesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const tenant = user?.role === 'TENANT';
  const [stays, setStays] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(requestSchema), defaultValues: { stayId: '', requestedRent: '', reason: '' } });
  const selectedStay = stays.find((stay) => stay._id === watch('stayId'));
  const currentRentPaise = selectedStay ? [...(selectedStay.rentTerms || [])].filter((term) => indiaDay(term.effectiveFrom) <= todayIndia()).sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom)).at(-1)?.monthlyRentPaise || selectedStay.agreedMonthlyRentPaise : 0;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const stayPath = tenant ? '/stays/my' : '/stays/owner';
      const requestPath = tenant ? '/rent-change-requests/my' : '/rent-change-requests/owner';
      const [stayResponse, requestResponse] = await Promise.all([api.get(stayPath, { params: { status: 'ACTIVE', limit: 100 } }), api.get(requestPath, { params: { limit: 100 } })]);
      const currentStays = stayResponse.data.data.items.filter((stay) => stay.status === 'ACTIVE');
      setStays(currentStays); setRequests(requestResponse.data.data.items);
      if (!watch('stayId') && currentStays[0]) reset({ stayId: currentStays[0]._id, requestedRent: '', reason: '' });
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setLoading(false); }
  }, [tenant, reset, watch]);
  useEffect(() => { load(); }, [load]);

  async function submit(values) {
    setSaving(true);
    try {
      await api.post('/rent-change-requests', { stayId: values.stayId, requestedRentPaise: Math.round(Number(values.requestedRent) * 100), reason: values.reason });
      reset({ stayId: values.stayId, requestedRent: '', reason: '' }); await load(); showToast('Rent change request sent to the owner.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function decide(request, decision) {
    if (decision === 'APPROVED' && !window.confirm(`Approve the new rent of ${money(request.requestedRentPaise)} from ${date(request.effectiveDate)}? Existing rent dues will not change.`)) return;
    const reason = decision === 'REJECTED' ? window.prompt('Add a reason for rejecting this request:') : undefined;
    if (decision === 'REJECTED' && (!reason || reason.trim().length < 3)) return;
    try { await api.patch(`/rent-change-requests/${request._id}/decision`, { decision, ...(reason ? { reason: reason.trim() } : {}) }); await load(); showToast(decision === 'APPROVED' ? `New rent applies from ${date(request.effectiveDate)}.` : 'Rent change request rejected.'); }
    catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  return <div className="feature-page">
    <div className="feature-heading"><div><span className="eyebrow">AGREED RENT HISTORY</span><h1>Rent changes</h1><p>{tenant ? 'Request a new rent amount for a future anchored monthly cycle.' : 'Review tenant requests. Existing rent dues stay unchanged.'}</p></div><button className="button button-secondary" onClick={load}><RefreshCw size={14} />Refresh</button></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {tenant && !loading && stays.length > 0 && <section className="panel rent-change-form"><div className="panel-header"><div><h2>Request a rent change</h2><p>The owner reviews your request. Approved terms begin on the future date shown in the request.</p></div><span className="stat-icon lavender"><TrendingUp size={18} /></span></div><form className="stacked-form" onSubmit={handleSubmit(submit)}><label>Active stay<select {...register('stayId')}>{stays.map((stay) => { const activeRent = [...(stay.rentTerms || [])].filter((term) => indiaDay(term.effectiveFrom) <= todayIndia()).sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom)).at(-1)?.monthlyRentPaise || stay.agreedMonthlyRentPaise; return <option key={stay._id} value={stay._id}>{stay.hostelId?.name} · Room {stay.roomId?.identifier} · current {money(activeRent)}/month</option>; })}</select></label><div className="form-columns"><label>Requested monthly rent (₹)<input type="number" min="0.01" step="0.01" {...register('requestedRent')} />{errors.requestedRent && <small>Enter a valid amount.</small>}</label><label>Current rent<input value={selectedStay ? money(currentRentPaise) : ''} readOnly /></label></div><label>Reason<textarea rows="3" maxLength="1000" placeholder="Explain the requested change" {...register('reason')} />{errors.reason && <small>{errors.reason.message}</small>}</label><div className="dialog-actions"><button className="button button-primary" disabled={saving}>{saving ? 'Sending…' : 'Send request'}</button></div></form></section>}
    {loading ? <div className="feature-loading">Loading rent terms…</div> : requests.length ? <div className="rent-change-list">{requests.map((request) => { const stay = request.stayId || {}; const resident = request.tenantId || {}; const property = request.hostelId || {}; return <article className="rent-change-card" key={request._id}><div className="stay-icon"><TrendingUp size={19} /></div><div className="rent-change-copy"><div className="stay-title"><h2>{tenant ? property.name : resident.name}</h2><span className={`status-pill ${request.status.toLowerCase()}`}><i />{label(request.status)}</span></div><p>{tenant ? `${property.city || ''} · ` : `${resident.email} · ${property.name} · `}Room {stay.roomId?.identifier || '—'}</p><div className="rent-change-amounts"><span>Current <b>{money(request.currentRentPaise)}</b></span><span>Requested <b>{money(request.requestedRentPaise)}</b></span><span>Effective <b>{date(request.effectiveDate)}</b></span></div><div className="rent-change-reason">{request.reason}</div>{request.rejectionReason && <div className="rent-change-reason rejected-note">Owner note: {request.rejectionReason}</div>}<details className="history-disclosure"><summary>Request history ({request.events?.length || 0})</summary><ol>{(request.events || []).map((event, index) => <li key={`${event.at}-${index}`}><b>{label(event.toStatus)}</b><span>{date(event.at)}{event.reason ? ` · ${event.reason}` : ''}</span></li>)}</ol></details></div>{!tenant && request.status === 'PENDING' && <div className="payment-actions"><button className="button button-primary" onClick={() => decide(request, 'APPROVED')}><Check size={13} />Approve</button><button className="button button-secondary" onClick={() => decide(request, 'REJECTED')}>Reject</button></div>}</article>; })}</div> : !error && <div className="feature-empty"><span className="empty-icon"><Clock3 size={19} /></span><h2>{tenant ? 'No rent change requests' : 'No requests to review'}</h2><p>{tenant ? 'Submit a request if you need a different agreed rent.' : 'Tenant requests will appear here for review.'}</p></div>}
  </div>;
}
