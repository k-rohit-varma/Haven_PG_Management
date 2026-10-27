import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock3, CreditCard, RotateCw } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

const schema = z.object({ amountRupees: z.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => Number(value) > 0, 'Enter an amount greater than zero.'), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER']), transactionReference: z.string().trim().max(100) });
const todayIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const date = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value / 100);
const label = (value) => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

function Status({ value }) { return <span className={`status-pill ${value.toLowerCase()}`}><i />{label(value)}</span>; }

export default function PaymentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isTenant = user?.role === 'TENANT';
  const [dues, setDues] = useState([]);
  const [payments, setPayments] = useState([]);
  const [statusFilter, setStatusFilter] = useState(isTenant ? '' : 'PENDING');
  const [dueStatus, setDueStatus] = useState(''); const [month, setMonth] = useState(''); const [search, setSearch] = useState(''); const searchQuery = useDebouncedValue(search.trim().length >= 2 ? search.trim() : '', 1500); const requestSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { paidOn: todayIndia(), method: 'UPI', transactionReference: '' } });

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      const duePath = isTenant ? '/rent-dues/my' : '/rent-dues';
      const paymentPath = isTenant ? '/payments/my' : '/payments/owner';
      const params = { limit: 100 };
      const [dueResponse, paymentResponse] = await Promise.all([
        api.get(duePath, { params: { ...params, ...(dueStatus ? { status: dueStatus } : {}), ...(month ? { month } : {}), ...(searchQuery ? { search: searchQuery } : {}) } }), api.get(paymentPath, { params: { ...params, ...(statusFilter ? { status: statusFilter } : {}) } }),
      ]);
      if (sequence === requestSequence.current) { setDues(dueResponse.data.data.items); setPayments(paymentResponse.data.data.items); }
    } catch (requestError) { if (sequence === requestSequence.current) setError(getErrorMessage(requestError)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [isTenant, statusFilter, dueStatus, month, searchQuery]);
  useEffect(() => { load(); }, [load]);

  function openPay(due) { setPaying(due); reset({ amountRupees: (due.outstandingPaise / 100).toFixed(2), paidOn: todayIndia(), method: 'UPI', transactionReference: '' }); }

  async function submit(values) {
    setSaving(true);
    try {
      const { amountRupees, ...paymentDetails } = values;
      await api.post('/payments', { ...paymentDetails, amountPaise: Math.round(Number(amountRupees) * 100), rentDueId: paying._id });
      setPaying(null); await load(); showToast('Payment submitted for owner verification.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function decide(payment, decision) {
    if (decision === 'APPROVED' && !window.confirm(`Approve ${money(payment.amountPaise)} for ${payment.tenantId?.name || 'this tenant'}? The verified amount will reduce the rent balance.`)) return;
    const reason = decision === 'REJECTED' ? window.prompt('Add a reason for rejecting this payment:') : undefined;
    if (decision === 'REJECTED' && (!reason || reason.trim().length < 3)) return;
    try { await api.patch(`/payments/${payment._id}/decision`, { decision, ...(reason ? { reason: reason.trim() } : {}) }); await load(); showToast(decision === 'APPROVED' ? 'Payment verified and rent balance updated.' : 'Payment rejected with its history preserved.'); }
    catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  return <div className="feature-page">
    <div className="feature-heading"><div><span className="eyebrow">RENT TRACKING</span><h1>Rent & payments</h1><p>{isTenant ? 'Review rent obligations and submit payments for verification.' : 'Review rent balances and verify tenant-submitted payments.'}</p></div><button className="button button-secondary" onClick={load}><RotateCw size={14} />Refresh</button></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {loading ? <div className="feature-loading">Loading rent records…</div> : <>
      <section className="panel rent-panel"><div className="panel-header"><div><h2>Rent obligations</h2><p>Each due date remains anchored to the confirmed move-in day.</p></div></div><div className="rent-filters"><label>Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><label>Status<select value={dueStatus} onChange={(event) => setDueStatus(event.target.value)}><option value="">All rent statuses</option>{['UPCOMING','PAYMENT_PENDING','PAID','PAID_LATE','OVERDUE','PARTIALLY_PAID'].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>{!isTenant && <label className="rent-search">Tenant or room<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or room" /></label>}</div>
        {dues.length ? <div className="table-wrap"><table><thead><tr><th>RESIDENT / PERIOD</th><th>DUE DATE</th><th>AMOUNT</th><th>SETTLED</th><th>OUTSTANDING</th><th>STATUS</th>{isTenant && <th />}</tr></thead><tbody>{dues.map((due) => <tr key={due._id}><td><div className="resident-cell"><span className="resident-avatar lilac"><CreditCard size={14} /></span><span><b>{isTenant ? due.hostelId?.name : due.tenantId?.name}</b><small>{due.billingPeriod}</small></span></div></td><td>{date(due.dueDate)}</td><td className="amount-cell">{money(due.amountDuePaise)}</td><td>{money(due.amountSettledPaise)}</td><td className="amount-cell">{money(due.outstandingPaise)}</td><td><Status value={due.status} /></td>{isTenant && <td>{due.outstandingPaise > 0 && due.status !== 'PAYMENT_PENDING' && <button className="text-link" onClick={() => openPay(due)}>Submit payment</button>}</td>}</tr>)}</tbody></table></div> : <div className="rent-empty"><Clock3 size={18} /><b>No rent dues yet</b><span>Rent obligations appear when the scheduled rent generation job runs.</span></div>}
      </section>
      <section className="panel rent-panel payment-history-panel"><div className="panel-header"><div><h2>{isTenant ? 'My payment history' : 'Payment requests'}</h2><p>Requests stay in history after approval or rejection.</p></div>{!isTenant && <label className="filter-select-label">Show<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All requests</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label>}</div>
        {payments.length ? <div className="table-wrap"><table><thead><tr><th>RESIDENT / HOSTEL</th><th>SUBMITTED</th><th>PAID ON</th><th>AMOUNT</th><th>METHOD</th><th>STATUS</th>{!isTenant && <th>ACTION</th>}</tr></thead><tbody>{payments.map((payment) => <tr key={payment._id}><td><div className="resident-cell"><span className="resident-avatar mint"><CreditCard size={14} /></span><span><b>{isTenant ? payment.hostelId?.name : payment.tenantId?.name}</b><small>{payment.rentDueId?.billingPeriod || payment.transactionReference || 'Rent payment'}</small></span></div><details className="history-disclosure"><summary>History ({payment.events?.length || 0})</summary><ol>{(payment.events || []).map((event, index) => <li key={`${event.at}-${index}`}><b>{label(event.toStatus)}</b><span>{date(event.at)}{event.note ? ` · ${event.note}` : ''}</span></li>)}</ol></details></td><td>{date(payment.submittedAt)}</td><td>{date(payment.paidOn)}</td><td className="amount-cell">{money(payment.amountPaise)}</td><td>{label(payment.method)}</td><td><Status value={payment.status} /></td>{!isTenant && <td>{payment.status === 'PENDING' && <div className="payment-actions"><button className="button button-primary" onClick={() => decide(payment, 'APPROVED')}><Check size={13} />Approve</button><button className="button button-secondary" onClick={() => decide(payment, 'REJECTED')}>Reject</button></div>}</td>}</tr>)}</tbody></table></div> : <div className="rent-empty"><Clock3 size={18} /><b>No payment requests</b><span>Submitted payments and their decisions will appear here.</span></div>}
      </section>
    </>}
    {paying && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaying(null); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setPaying(null)}>×</button><span className="eyebrow">PAYMENT SUBMISSION</span><h2 id="payment-title">Submit rent payment</h2><p>Outstanding balance: {money(paying.outstandingPaise)}. Your balance changes after owner verification.</p><form className="stacked-form" onSubmit={handleSubmit(submit)}><label>Amount paid (₹)<input type="number" min="0.01" step="0.01" max={paying.outstandingPaise / 100} {...register('amountRupees')} />{errors.amountRupees && <small>Enter a valid amount within the outstanding balance.</small>}</label><div className="form-columns"><label>Payment date<input type="date" max={todayIndia()} {...register('paidOn')} /></label><label>Method<select {...register('method')}><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label></div><label>Transaction reference <span className="optional-label">Optional</span><input {...register('transactionReference')} maxLength="100" /></label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setPaying(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit for verification'}</button></div></form></section></div>}
  </div>;
}
