import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Save, UserRoundPlus } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';
import { useToast } from '../components/common/ToastContext.jsx';
import { roomAcceptsGender } from '../lib/roomEligibility.js';

const money = (paise = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

export default function TenantProfilePage() {
  const { tenantId } = useParams();
  const { showToast } = useToast();
  const [tenant, setTenant] = useState(null);
  const [stays, setStays] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dues, setDues] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leavingDate, setLeavingDate] = useState('');
  const [leavingReason, setLeavingReason] = useState('');
  const [closingStay, setClosingStay] = useState(false);
  const [showRejoin, setShowRejoin] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get(`/tenants/${tenantId}`); setTenant(data.data.tenant); setStays(data.data.stays); setPayments(data.data.payments); setDues(data.data.dues || []); setDeposits(data.data.deposits); setAudit(data.data.audit); setForm(Object.fromEntries(['name', 'phone', 'email', 'gender', 'emergencyContact', 'notes'].map((key) => [key, data.data.tenant[key] || '']))); }
    catch (e) { setError(getErrorMessage(e)); } finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);
  async function save(event) { event.preventDefault(); setSaving(true); try { const { data } = await api.patch(`/tenants/${tenantId}`, form); setTenant(data.data.tenant); showToast('Tenant profile updated.'); } catch (e) { setError(getErrorMessage(e)); } finally { setSaving(false); } }
  async function closeStay(event) { event.preventDefault(); setClosingStay(true); try { await api.post(`/stays/${activeStay._id}/mark-left`, { leavingDate, reason: leavingReason }); setLeavingDate(''); setLeavingReason(''); await load(); showToast('Stay closed. Tenant and financial history were preserved.'); } catch (e) { setError(getErrorMessage(e)); } finally { setClosingStay(false); } }
  if (loading) return <div className="feature-loading">Loading tenant profile…</div>;
  if (error && !tenant) return <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>;
  const activeStay = stays.find((stay) => stay.status === 'ACTIVE');
  const completedStays = stays.filter((stay) => stay.status === 'LEFT');
  const stayById = new Map(stays.map((stay) => [String(stay._id), stay]));
  const oldOutstandingPaise = dues.filter((due) => stayById.get(String(due.stayId))?.status !== 'ACTIVE' && ['OVERDUE', 'PARTIALLY_PAID', 'PAYMENT_PENDING'].includes(due.status)).reduce((total, due) => total + due.outstandingPaise, 0);
  return <div className="feature-page"><Link className="text-link" to="/tenants"><ArrowLeft size={14} /> Back to tenants</Link><div className="feature-heading"><div><span className="eyebrow">TENANT PROFILE</span><h1>{tenant.name}</h1><p>Update contact details and review their property history.</p></div></div>
    {error && <div className="feature-error" role="alert">{error}</div>}
    <section className="panel"><div className="panel-header"><div><h2>Profile details</h2><p>Changes are recorded in the audit history.</p></div></div><form className="stacked-form" onSubmit={save}><div className="form-columns"><label>Full name<input required minLength="2" maxLength="100" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Phone<input required value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label></div><div className="form-columns"><label>Email<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Gender profile<select value={form.gender || 'PREFER_NOT_TO_SAY'} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="PREFER_NOT_TO_SAY">Not provided</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label></div><div className="form-columns"><label>Emergency contact<input value={form.emergencyContact || ''} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} /></label><label>Notes<input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div><button className="button button-primary" disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save profile'}</button></form></section>
    {activeStay && <><RentEditor stay={activeStay} onUpdated={load} /><section className="panel"><div className="panel-header"><div><h2>End active stay</h2><p>Ending occupancy keeps the tenant profile and financial history.</p></div></div><form className="stacked-form" onSubmit={closeStay}><div className="form-columns"><label>Leaving date<input required type="date" value={leavingDate} onChange={(e) => setLeavingDate(e.target.value)} /></label><label>Reason <span className="optional-label">Optional</span><input maxLength="500" value={leavingReason} onChange={(e) => setLeavingReason(e.target.value)} /></label></div><button className="button button-secondary" disabled={closingStay}>{closingStay ? 'Closing…' : 'Mark tenant as left'}</button></form></section></>}
    {!activeStay && completedStays.length > 0 && <section className="panel"><div className="panel-header"><div><h2>Rejoin tenant</h2><p>Start a new stay using this existing tenant profile.</p></div>{!showRejoin && <button className="button button-primary" onClick={() => setShowRejoin(true)}><UserRoundPlus size={14} />Rejoin Tenant</button>}</div>{showRejoin && <RejoinForm tenant={tenant} stays={stays} oldOutstandingPaise={oldOutstandingPaise} onCancel={() => setShowRejoin(false)} onRejoined={async () => { setShowRejoin(false); await load(); showToast('Tenant rejoined. Previous stay and financial history were preserved.'); }} />}</section>}
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Rent dues</h2><p>Each due remains attached to the stay and billing period it belongs to.</p></div></div>{dues.length ? <div className="table-wrap"><table><thead><tr><th>PERIOD / DUE DATE</th><th>STAY / ROOM</th><th>DUE</th><th>PAID</th><th>OUTSTANDING</th><th>STATUS</th></tr></thead><tbody>{dues.map((item) => { const stay = stayById.get(String(item.stayId)); return <tr key={item._id}><td><b>{item.billingPeriod}</b><small>Due {date(item.dueDate)}</small></td><td>{stay?.hostelId?.name || '—'} · Room {stay?.roomId?.identifier || item.roomId?.identifier || '—'}<small>Joined {date(stay?.moveInDate)}</small></td><td>{money(item.amountDuePaise)}</td><td>{money(item.amountSettledPaise)}</td><td>{money(item.outstandingPaise)}</td><td>{item.status}</td></tr>; })}</tbody></table></div> : <p className="rent-empty">No rent dues recorded.</p>}</section>
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Payment history</h2><p>Payments recorded by management across all stays.</p></div></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>STAY / PERIOD</th><th>PROPERTY</th><th>AMOUNT</th><th>METHOD</th><th>STATUS</th><th>REFERENCE</th></tr></thead><tbody>{payments.map((item) => { const stay = stayById.get(String(item.stayId?._id || item.stayId)); return <tr key={item._id}><td>{date(item.paidOn)}</td><td>{stay ? `Joined ${date(stay.moveInDate)}` : '—'}<small>{item.rentDueId?.billingPeriod || 'Rent payment'}</small></td><td>{item.hostelId?.name || '—'} · Room {stay?.roomId?.identifier || '—'}</td><td>{money(item.amountPaise)}</td><td>{item.method?.replaceAll('_', ' ')}</td><td>{item.status}</td><td>{item.transactionReference || '—'}</td></tr>; })}</tbody></table></div> : <p className="rent-empty">No rent payments recorded.</p>}</section>
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Deposit transactions</h2><p>Receipts, refunds, deductions, and adjustments remain linked to their stay.</p></div></div>{deposits.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>STAY</th><th>TYPE</th><th>AMOUNT</th><th>REASON</th><th>REFERENCE</th></tr></thead><tbody>{deposits.map((item) => { const stay = stayById.get(String(item.stayId)); return <tr key={item._id}><td>{date(item.transactionDate)}</td><td>{stay?.hostelId?.name || '—'} · Room {stay?.roomId?.identifier || '—'}<small>Joined {date(stay?.moveInDate)}</small></td><td>{item.type}</td><td>{money(item.amountPaise)}</td><td>{item.reason}</td><td>{item.reference || '—'}</td></tr>; })}</tbody></table></div> : <p className="rent-empty">No deposit transactions recorded.</p>}</section>
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Profile audit history</h2><p>Recent administrative profile changes.</p></div></div>{audit.length ? <ol className="audit-timeline">{audit.map((item) => <li key={item._id}><b>{item.action.replaceAll('_', ' ')}</b><span>{date(item.occurredAt)} · {item.actorId?.name || 'Management'} · {item.reason}</span></li>)}</ol> : <p className="rent-empty">No profile changes recorded.</p>}</section>
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Stay history</h2><p>Historical rent terms and status events remain attached to each stay.</p></div></div>{stays.map((stay) => <article className="tenant-history" key={stay._id}><h3>{stay.hostelId?.name} · Room {stay.roomId?.identifier} <span className={`status-pill ${stay.status.toLowerCase()}`}><i />{stay.status}</span></h3><p>Joined {date(stay.moveInDate)}{stay.leavingDate ? ` · Left ${date(stay.leavingDate)}` : ''} · Current rent {money(stay.currentRentPaise)} · Deposit balance {money(stay.currentDepositPaise)} · Agreed deposit {money(stay.securityDepositPaise)}</p><details className="history-disclosure"><summary>Rent and stay events</summary><ol>{[...(stay.rentTerms || []).map((term) => ({ at: term.effectiveFrom, title: `${money(term.monthlyRentPaise)} / month`, note: term.reason })), ...(stay.events || []).map((event) => ({ at: event.at, title: `${event.fromStatus || 'Created'} → ${event.toStatus}`, note: event.reason }))].sort((a, b) => new Date(b.at) - new Date(a.at)).map((item, index) => <li key={`${item.at}-${index}`}><b>{item.title}</b><span>{date(item.at)}{item.note ? ` · ${item.note}` : ''}</span></li>)}</ol></details><Link className="text-link" to={`/deposits?stayId=${stay._id}`}>Deposit records</Link></article>)}</section>
  </div>;
}

function RejoinForm({ tenant, stays, oldOutstandingPaise, onCancel, onRejoined }) {
  const getJoiningDateToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [hostels, setHostels] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(() => ({ hostelId: '', roomId: '', moveInDate: getJoiningDateToday(), agreedMonthlyRent: '', deposit: '0' }));
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/hostels', { params: { page: 1, limit: 100 } }).then(({ data }) => setHostels(data.data.items)).catch((e) => setError(getErrorMessage(e))); }, []);
  useEffect(() => {
    if (!form.hostelId) { setRooms([]); return undefined; }
    let active = true;
    setLoadingRooms(true);
    api.get(`/hostels/${form.hostelId}/rooms`, { params: { page: 1, limit: 100, active: 'true', availability: 'AVAILABLE', minAvailableBeds: 1 } }).then(({ data }) => { if (active) setRooms(data.data.items); }).catch((e) => { if (active) { setRooms([]); setError(getErrorMessage(e)); } }).finally(() => { if (active) setLoadingRooms(false); });
    return () => { active = false; };
  }, [form.hostelId]);
  const hostel = hostels.find((item) => item._id === form.hostelId);
  const eligibleRooms = rooms.filter((room) => room.availableBeds > 0 && roomAcceptsGender(room, tenant.gender, hostel?.accommodationPolicy));
  const room = eligibleRooms.find((item) => item._id === form.roomId);
  const oldDepositBalance = stays.reduce((total, stay) => total + (stay.currentDepositPaise || 0), 0);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!room) { setError('Select an available room eligible for this tenant.'); return; }
    const rentPaise = Math.round(Number(form.agreedMonthlyRent) * 100);
    const depositPaise = Math.round(Number(form.deposit || 0) * 100);
    if (!Number.isSafeInteger(rentPaise) || rentPaise < 1 || !Number.isSafeInteger(depositPaise) || depositPaise < 0) { setError('Enter a valid rent and deposit amount.'); return; }
    setSaving(true);
    try {
      await api.post(`/tenants/${tenant._id}/rejoin`, { hostelId: form.hostelId, roomId: form.roomId, moveInDate: form.moveInDate, agreedMonthlyRentPaise: rentPaise, securityDepositPaise: depositPaise });
      await onRejoined();
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setSaving(false); }
  }
  return <form className="stacked-form" onSubmit={submit}>
    <p><b>{tenant.name}</b> · {tenant.phone} · {tenant.gender}</p>
    {(oldDepositBalance > 0 || oldOutstandingPaise > 0) && <div className="assignment-room-note">Previous stays remain financially separate. Old deposit balance: {money(oldDepositBalance)}; old rent outstanding: {money(oldOutstandingPaise)}. Neither is transferred to the new stay.</div>}
    <div className="form-columns"><label>Property<select required value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value, roomId: '', agreedMonthlyRent: '' })}><option value="">Select a property</option>{hostels.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.city}</option>)}</select></label><label>Available eligible room<select required disabled={!form.hostelId || loadingRooms} value={form.roomId} onChange={(e) => { const selected = eligibleRooms.find((item) => item._id === e.target.value); setForm({ ...form, roomId: e.target.value, agreedMonthlyRent: selected ? String(selected.defaultRentPaise / 100) : '' }); }}><option value="">{loadingRooms ? 'Loading rooms…' : 'Select a room'}</option>{eligibleRooms.map((item) => <option key={item._id} value={item._id}>{item.identifier} · {item.availableBeds} bed(s) · {money(item.defaultRentPaise)}/month</option>)}</select></label></div>
    <div className="form-columns"><label>New joining date<input type="date" required value={form.moveInDate} onChange={(e) => setForm({ ...form, moveInDate: e.target.value })} /></label><label>Agreed monthly rent (₹)<input type="number" required min="0.01" step="0.01" value={form.agreedMonthlyRent} onChange={(e) => setForm({ ...form, agreedMonthlyRent: e.target.value })} /></label></div>
    <label>New stay's required deposit (₹)<input type="number" min="0" step="0.01" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /><small>Requirement only. Record money received separately in this stay's deposit ledger; old deposit funds are not transferred.</small></label>
    {room && <div className="assignment-room-note"><b>Review:</b> {tenant.name} will join {hostel?.name}, room {room.identifier}, on {form.moveInDate}; agreed rent {money(Math.round(Number(form.agreedMonthlyRent) * 100))}/month; required deposit {money(Math.round(Number(form.deposit || 0) * 100))}.</div>}
    {error && <div className="feature-error" role="alert">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button className="button button-primary" disabled={saving || !room}>{saving ? 'Rejoining…' : 'Confirm rejoin'}</button></div>
  </form>;
}

function RentEditor({ stay, onUpdated }) {
  const { showToast } = useToast();
  const [monthlyRent, setMonthlyRent] = useState((stay.currentRentPaise / 100).toFixed(2));
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const upcoming = (stay.rentTerms || []).filter((term) => new Date(term.effectiveFrom) > new Date()).sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom))[0];
  async function submit(event) { event.preventDefault(); setSaving(true); try { await api.patch(`/tenants/stays/${stay._id}/rent`, { monthlyRentPaise: Math.round(Number(monthlyRent) * 100), effectiveDate, reason }); await onUpdated(); showToast('Rent change scheduled.'); } catch (e) { showToast(getErrorMessage(e), 'error'); } finally { setSaving(false); } }
  return <section className="panel"><div className="panel-header"><div><h2>Change active rent</h2><p>Choose a future monthly cycle date. Existing dues are preserved. Rent changes apply at the start of a rent cycle.</p>{upcoming && <p>Upcoming: {money(upcoming.monthlyRentPaise)} from {date(upcoming.effectiveFrom)}; current rent remains {money(stay.currentRentPaise)}.</p>}</div></div><form className="stacked-form" onSubmit={submit}><div className="form-columns"><label>New monthly rent (₹)<input required type="number" min="0.01" step="0.01" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} /></label><label>Effective cycle date<input required type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label></div><label>Reason <span className="optional-label">Optional</span><input maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Schedule rent change'}</button></form></section>;
}
