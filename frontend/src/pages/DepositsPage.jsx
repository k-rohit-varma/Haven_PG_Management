import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, WalletCards } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, getErrorMessage } from '../lib/api.js';
import { useToast } from '../components/common/ToastContext.jsx';

const schema = z.object({ type: z.enum(['RECEIVED', 'REFUND', 'DEDUCTION', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT']), amountRupees: z.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => Number(value) > 0), transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reference: z.string().trim().max(100), reason: z.string().trim().min(3).max(500) });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
const date = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
const label = (value) => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export default function DepositsPage() {
  const { showToast } = useToast();
  const [stays, setStays] = useState([]);
  const [stayId, setStayId] = useState('');
  const [deposit, setDeposit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { type: 'RECEIVED', amountRupees: '', transactionDate: today(), reference: '', reason: '' } });

  const load = useCallback(async (requestedStayId = stayId) => {
    setLoading(true); setError('');
    try {
      const { data: staysResponse } = await api.get('/stays/owner', { params: { limit: 100 } });
      const availableStays = staysResponse.data.items;
      setStays(availableStays);
      const chosen = availableStays.find((stay) => stay._id === requestedStayId) || availableStays[0];
      setStayId(chosen?._id || '');
      if (chosen) {
        const { data } = await api.get(`/stays/${chosen._id}/deposit`);
        setDeposit(data.data.deposit);
      } else setDeposit(null);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setLoading(false); }
  }, [stayId]);
  useEffect(() => { load(); }, [load]);

  async function submit(values) {
    setSaving(true);
    try {
      const { amountRupees, ...rest } = values;
      await api.post(`/stays/${stayId}/deposit/transactions`, { ...rest, amountPaise: Math.round(Number(amountRupees) * 100) });
      reset({ type: values.type, amountRupees: '', transactionDate: today(), reference: '', reason: '' }); setShowForm(false); await load(stayId); showToast('Deposit transaction recorded and retained in history.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  const selected = stays.find((stay) => stay._id === stayId);
  return <div className="feature-page">
    <div className="feature-heading"><div><span className="eyebrow">SEPARATE FROM RENT</span><h1>Security deposits</h1><p>Each stay keeps its own deposit record. Deposits are never applied to rent automatically.</p></div><button className="button button-secondary" onClick={() => load(stayId)}><RefreshCw size={14} />Refresh</button></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={() => load(stayId)}>Try again</button></div>}
    {!loading && stays.length > 0 && <div className="deposit-toolbar"><label className="filter-select-label">Stay<select value={stayId} onChange={(event) => load(event.target.value)}>{stays.map((stay) => <option key={stay._id} value={stay._id}>{stay.tenantId?.name} · {stay.hostelId?.name} · {stay.status} · {date(stay.moveInDate)}</option>)}</select></label><button className="button button-primary" onClick={() => setShowForm(true)}><WalletCards size={15} />Record transaction</button></div>}
    {loading ? <div className="feature-loading">Loading deposit records…</div> : deposit ? <>
      <div className="stats-grid deposit-stats"><article className="stat-card"><div className="stat-top">Agreed initial deposit<span className="stat-icon lavender"><WalletCards size={17} /></span></div><div className="stat-value">{money(deposit.initialDepositPaise)}</div><div className="stat-foot">Locked in the stay agreement</div></article><article className="stat-card"><div className="stat-top">Received<span className="stat-icon green"><ArrowDownLeft size={17} /></span></div><div className="stat-value">{money(deposit.receivedPaise)}</div><div className="stat-foot">Deposit receipts recorded</div></article><article className="stat-card"><div className="stat-top">Available balance<span className="stat-icon yellow"><ArrowUpRight size={17} /></span></div><div className="stat-value">{money(deposit.balancePaise)}</div><div className="stat-foot">After explicit refunds and deductions</div></article></div>
      <section className="panel rent-panel"><div className="panel-header"><div><h2>Deposit transaction history</h2><p>{selected?.hostelId?.name}{selected?.roomId?.identifier ? ` · Room ${selected.roomId.identifier}` : ''}{selected?.tenantId?.name ? ` · ${selected.tenantId.name}` : ''}</p></div></div>
        {deposit.transactions.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>TRANSACTION</th><th>AMOUNT</th><th>REFERENCE</th><th>REASON</th><th>RECORDED BY</th></tr></thead><tbody>{deposit.transactions.map((entry) => <tr key={entry._id}><td>{date(entry.transactionDate)}</td><td><span className={`status-pill ${entry.type === 'RECEIVED' || entry.type === 'ADJUSTMENT_CREDIT' ? 'approved' : 'rejected'}`}><i />{label(entry.type)}</span></td><td className="amount-cell">{money(entry.amountPaise)}</td><td>{entry.reference || '—'}</td><td>{entry.reason}</td><td>{entry.actorId?.name || 'Owner'}</td></tr>)}</tbody></table></div> : <div className="rent-empty"><WalletCards size={18} /><b>No deposit transactions</b><span>Recorded receipts, refunds, and deductions appear here.</span></div>}
      </section>
    </> : !error && <div className="feature-empty"><span className="empty-icon"><WalletCards size={19} /></span><h2>No stay deposit records</h2><p>A deposit history will appear when a stay is confirmed.</p></div>}
    {showForm && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="deposit-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setShowForm(false)}>×</button><span className="eyebrow">APPEND DEPOSIT RECORD</span><h2 id="deposit-title">Record a transaction</h2><p>Transactions are permanent. Confirm the amount, date, and reason before saving.</p><form className="stacked-form" onSubmit={handleSubmit(submit)}><div className="form-columns"><label>Type<select {...register('type')}><option value="RECEIVED">Deposit received</option><option value="REFUND">Refund</option><option value="DEDUCTION">Deduction</option><option value="ADJUSTMENT_CREDIT">Adjustment credit</option><option value="ADJUSTMENT_DEBIT">Adjustment debit</option></select></label><label>Amount (₹)<input type="number" min="0.01" step="0.01" {...register('amountRupees')} />{errors.amountRupees && <small>Enter a valid amount.</small>}</label></div><div className="form-columns"><label>Transaction date<input type="date" max={today()} {...register('transactionDate')} /></label><label>Reference <span className="optional-label">Optional</span><input maxLength="100" {...register('reference')} /></label></div><label>Reason<textarea rows="3" maxLength="500" placeholder="Record the deposit transaction purpose" {...register('reason')} />{errors.reason && <small>{errors.reason.message}</small>}</label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Record transaction'}</button></div></form></section></div>}
  </div>;
}
