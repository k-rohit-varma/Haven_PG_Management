import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';
import { useToast } from '../components/common/ToastContext.jsx';

const money = (paise = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

export default function TenantProfilePage() {
  const { tenantId } = useParams();
  const { showToast } = useToast();
  const [tenant, setTenant] = useState(null);
  const [stays, setStays] = useState([]);
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leavingDate, setLeavingDate] = useState('');
  const [leavingReason, setLeavingReason] = useState('');
  const [closingStay, setClosingStay] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get(`/tenants/${tenantId}`); setTenant(data.data.tenant); setStays(data.data.stays); setPayments(data.data.payments); setDeposits(data.data.deposits); setAudit(data.data.audit); setForm(Object.fromEntries(['name', 'phone', 'email', 'gender', 'emergencyContact', 'notes'].map((key) => [key, data.data.tenant[key] || '']))); }
    catch (e) { setError(getErrorMessage(e)); } finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);
  async function save(event) { event.preventDefault(); setSaving(true); try { const { data } = await api.patch(`/tenants/${tenantId}`, form); setTenant(data.data.tenant); showToast('Tenant profile updated.'); } catch (e) { setError(getErrorMessage(e)); } finally { setSaving(false); } }
  async function closeStay(event) { event.preventDefault(); setClosingStay(true); try { await api.post(`/stays/${activeStay._id}/mark-left`, { leavingDate, reason: leavingReason }); setLeavingDate(''); setLeavingReason(''); await load(); showToast('Stay closed. Tenant and financial history were preserved.'); } catch (e) { setError(getErrorMessage(e)); } finally { setClosingStay(false); } }
  if (loading) return <div className="feature-loading">Loading tenant profile…</div>;
  if (error && !tenant) return <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>;
  const activeStay = stays.find((stay) => stay.status === 'ACTIVE');
  return <div className="feature-page"><Link className="text-link" to="/tenants"><ArrowLeft size={14} /> Back to tenants</Link><div className="feature-heading"><div><span className="eyebrow">TENANT PROFILE</span><h1>{tenant.name}</h1><p>Update contact details and review their property history.</p></div></div>
    {error && <div className="feature-error" role="alert">{error}</div>}
    <section className="panel"><div className="panel-header"><div><h2>Profile details</h2><p>Changes are recorded in the audit history.</p></div></div><form className="stacked-form" onSubmit={save}><div className="form-columns"><label>Full name<input required minLength="2" maxLength="100" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Phone<input required value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label></div><div className="form-columns"><label>Email<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Gender profile<select value={form.gender || 'PREFER_NOT_TO_SAY'} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="PREFER_NOT_TO_SAY">Not provided</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label></div><div className="form-columns"><label>Emergency contact<input value={form.emergencyContact || ''} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} /></label><label>Notes<input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div><button className="button button-primary" disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save profile'}</button></form></section>
    {activeStay && <><RentEditor stay={activeStay} onUpdated={load} /><section className="panel"><div className="panel-header"><div><h2>End active stay</h2><p>Ending occupancy keeps the tenant profile and financial history.</p></div></div><form className="stacked-form" onSubmit={closeStay}><div className="form-columns"><label>Leaving date<input required type="date" value={leavingDate} onChange={(e) => setLeavingDate(e.target.value)} /></label><label>Reason <span className="optional-label">Optional</span><input maxLength="500" value={leavingReason} onChange={(e) => setLeavingReason(e.target.value)} /></label></div><button className="button button-secondary" disabled={closingStay}>{closingStay ? 'Closing…' : 'Mark tenant as left'}</button></form></section></>}
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Payment history</h2><p>Payments recorded by management across all stays.</p></div></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>PROPERTY</th><th>AMOUNT</th><th>METHOD</th><th>STATUS</th><th>REFERENCE</th></tr></thead><tbody>{payments.map((item) => <tr key={item._id}><td>{date(item.paidOn)}</td><td>{item.hostelId?.name || '—'}</td><td>{money(item.amountPaise)}</td><td>{item.method?.replaceAll('_', ' ')}</td><td>{item.status}</td><td>{item.transactionReference || '—'}</td></tr>)}</tbody></table></div> : <p className="rent-empty">No rent payments recorded.</p>}</section>
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Deposit transactions</h2><p>Receipts, refunds, deductions, and adjustments remain in the ledger.</p></div></div>{deposits.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>TYPE</th><th>AMOUNT</th><th>REASON</th><th>REFERENCE</th></tr></thead><tbody>{deposits.map((item) => <tr key={item._id}><td>{date(item.transactionDate)}</td><td>{item.type}</td><td>{money(item.amountPaise)}</td><td>{item.reason}</td><td>{item.reference || '—'}</td></tr>)}</tbody></table></div> : <p className="rent-empty">No deposit transactions recorded.</p>}</section>
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Profile audit history</h2><p>Recent administrative profile changes.</p></div></div>{audit.length ? <ol className="audit-timeline">{audit.map((item) => <li key={item._id}><b>{item.action.replaceAll('_', ' ')}</b><span>{date(item.occurredAt)} · {item.actorId?.name || 'Management'} · {item.reason}</span></li>)}</ol> : <p className="rent-empty">No profile changes recorded.</p>}</section>
    <section className="panel rent-panel"><div className="panel-header"><div><h2>Stay history</h2><p>Historical rent terms and status events remain attached to each stay.</p></div></div>{stays.map((stay) => <article className="tenant-history" key={stay._id}><h3>{stay.hostelId?.name} · Room {stay.roomId?.identifier} <span className={`status-pill ${stay.status.toLowerCase()}`}><i />{stay.status}</span></h3><p>Joined {date(stay.moveInDate)}{stay.leavingDate ? ` · Left ${date(stay.leavingDate)}` : ''} · Current rent {money(stay.currentRentPaise)} · Deposit balance {money(stay.currentDepositPaise)} · Agreed deposit {money(stay.securityDepositPaise)}</p><details className="history-disclosure"><summary>Rent and stay events</summary><ol>{[...(stay.rentTerms || []).map((term) => ({ at: term.effectiveFrom, title: `${money(term.monthlyRentPaise)} / month`, note: term.reason })), ...(stay.events || []).map((event) => ({ at: event.at, title: `${event.fromStatus || 'Created'} → ${event.toStatus}`, note: event.reason }))].sort((a, b) => new Date(b.at) - new Date(a.at)).map((item, index) => <li key={`${item.at}-${index}`}><b>{item.title}</b><span>{date(item.at)}{item.note ? ` · ${item.note}` : ''}</span></li>)}</ol></details><Link className="text-link" to={`/deposits?stayId=${stay._id}`}>Deposit records</Link></article>)}</section>
  </div>;
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
