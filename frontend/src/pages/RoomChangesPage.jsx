import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import Pagination from '../components/common/Pagination.jsx';

const displayDate = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

export default function RoomChangesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isTenant = user?.role === 'TENANT';
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const { data } = await api.get(isTenant ? '/room-change-requests/my' : '/room-change-requests/owner', { params: { page, limit: 20, ...(status ? { status } : {}) } });
      if (current === sequence.current) { setItems(data.data.items); setTotal(data.data.pagination.total); setPages(data.data.pagination.pages || 1); }
    } catch (requestError) { if (current === sequence.current) setError(getErrorMessage(requestError)); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [isTenant, page, status]);

  useEffect(() => { load(); }, [load]);

  async function decide(request, decision) {
    const reason = decision === 'REJECTED' ? globalThis.prompt('Reason for rejecting this room-change request:') : '';
    if (decision === 'REJECTED' && (reason === null || reason.trim().length < 3)) return;
    setSaving(request._id);
    try {
      await api.patch(`/room-change-requests/${request._id}/decision`, decision === 'REJECTED' ? { decision, reason: reason.trim() } : { decision });
      await load();
      showToast(decision === 'APPROVED' ? 'Room transfer approved and recorded.' : 'Room-change request rejected.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(''); }
  }

  return <div className="feature-page"><div className="feature-heading"><div><span className="eyebrow">STAY REQUESTS</span><h1>{isTenant ? 'My room-change requests' : 'Room-change requests'}</h1><p>{isTenant ? 'A room transfer takes effect only after approval.' : 'Review room transfer requests for your assigned properties.'}</p></div></div><div className="feature-toolbar"><label className="filter-select-label">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All requests</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label><span className="result-count">{total} requests</span></div>{error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}{loading ? <div className="feature-loading">Loading requests…</div> : items.length ? <div className="application-list">{items.map((request) => <article className="application-card" key={request._id}><span className="application-avatar"><RefreshCw size={18} /></span><div className="application-main"><div className="application-title"><h2>{isTenant ? request.hostelId?.name : request.tenantId?.name}</h2><span className={`status-pill ${request.status.toLowerCase()}`}>{request.status}</span></div><div className="application-subtitle">{request.hostelId?.city} · Room {request.currentRoomId?.identifier || '—'} → Room {request.requestedRoomId?.identifier || '—'}</div>{!isTenant && <div className="application-personal">{request.tenantId?.email || request.tenantId?.phone} · {request.tenantId?.gender?.toLowerCase()}</div>}<p>{request.reason}</p><small>Submitted {displayDate(request.createdAt)}{request.rejectionReason ? ` · Rejected: ${request.rejectionReason}` : ''}</small></div>{!isTenant && request.status === 'PENDING' && <div className="application-actions"><button disabled={saving === request._id} className="button button-secondary" onClick={() => decide(request, 'REJECTED')}><X size={14} />Reject</button><button disabled={saving === request._id} className="button button-primary" onClick={() => decide(request, 'APPROVED')}><Check size={14} />Approve</button></div>}</article>)}</div> : !error && <div className="feature-empty"><h2>No room-change requests</h2><p>New requests will appear here.</p></div>}<Pagination page={page} pages={pages} total={total} onPageChange={setPage} /></div>;
}
