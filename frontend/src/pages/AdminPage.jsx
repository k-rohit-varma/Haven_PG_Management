import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Check, Eye, EyeOff, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, getErrorMessage } from '../lib/api.js';
import { useToast } from '../components/common/ToastContext.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import Pagination from '../components/common/Pagination.jsx';

const schema = z.object({ stayId: z.string().min(1), moveInDate: z.string(), rentRupees: z.string(), depositAdjustmentRupees: z.string(), reason: z.string().trim().min(5).max(1000) });
const date = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
function normalizeOwnerIdentifier(value) {
  const candidate = value.trim();
  if (candidate.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? { email: candidate.toLowerCase() } : null;
  const compact = candidate.replace(/[\s()-]/g, '');
  const national = /^\+91[6-9]\d{9}$/.test(compact) ? compact.slice(3) : /^91[6-9]\d{9}$/.test(compact) ? compact.slice(2) : /^0[6-9]\d{9}$/.test(compact) ? compact.slice(1) : compact;
  return /^[6-9]\d{9}$/.test(national) ? { phone: `+91${national}` } : null;
}
const tabs = ['Users', 'Properties', 'Corrections'];

export default function AdminPage() {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState('Users');
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchInput, setUserSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [draftRoleFilter, setDraftRoleFilter] = useState('');
  const [draftStatusFilter, setDraftStatusFilter] = useState('');
  const debouncedUserSearch = useDebouncedValue(userSearchInput.trim());
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [userPagination, setUserPagination] = useState({ pages: 1, total: 0 });
  const [hostels, setHostels] = useState([]);
  const [hostelItems, setHostelItems] = useState([]);
  const [hostelPage, setHostelPage] = useState(1);
  const [hostelPageSize, setHostelPageSize] = useState(20);
  const [hostelPagination, setHostelPagination] = useState({ pages: 1, total: 0 });
  const [owners, setOwners] = useState([]);
  const requestSequence = useRef(0);
  const [rooms, setRooms] = useState([]);
  const [roomPage, setRoomPage] = useState(1);
  const [roomPagination, setRoomPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [roomSearchInput, setRoomSearchInput] = useState('');
  const debouncedRoomSearch = useDebouncedValue(roomSearchInput.trim());
  const [roomFilters, setRoomFilters] = useState({ hostelId: '', genderEligibility: '', sharingType: '', minCapacity: '', maxCapacity: '', minRent: '', maxRent: '', minAvailableBeds: '', availability: '', active: '' });
  const [appliedRoomFilters, setAppliedRoomFilters] = useState({ hostelId: '', genderEligibility: '', sharingType: '', minCapacity: '', maxCapacity: '', minRent: '', maxRent: '', minAvailableBeds: '', availability: '', active: '' });
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingOwner, setCreatingOwner] = useState(false);
  const [ownerPasswordVisible, setOwnerPasswordVisible] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ name: '', identifier: '', temporaryPassword: '', reason: '' });
  const [roleTarget, setRoleTarget] = useState(null);
  const [proposedRole, setProposedRole] = useState('TENANT');
  const [roleReason, setRoleReason] = useState('');
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '', reason: '' });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { stayId: '', moveInDate: '', rentRupees: '', depositAdjustmentRupees: '', reason: '' } });

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      const [userResponse, hostelResponse, hostelPageResponse, roomResponse, stayResponse, ownerResponse] = await Promise.all([
        api.get('/admin/users', { params: { page: userPage, limit: userPageSize, includeDeleted: 'true', ...(userSearch ? { search: userSearch } : {}), ...(roleFilter ? { role: roleFilter } : {}), ...(statusFilter === 'deleted' ? { isDeleted: 'true' } : statusFilter ? { isDeleted: 'false', isActive: statusFilter } : {}) } }),
        api.get('/admin/hostels', { params: { limit: 100, includeDeleted: 'true' } }),
        api.get('/admin/hostels', { params: { page: hostelPage, limit: hostelPageSize, includeDeleted: 'true' } }),
        api.get('/admin/rooms', { params: { page: roomPage, limit: 20, includeDeleted: 'true', ...(debouncedRoomSearch ? { search: debouncedRoomSearch } : {}), ...Object.fromEntries(Object.entries(appliedRoomFilters).filter(([key, value]) => value !== '' && key !== 'minRent' && key !== 'maxRent')), ...(appliedRoomFilters.minRent !== '' ? { minRentPaise: Math.round(Number(appliedRoomFilters.minRent) * 100) } : {}), ...(appliedRoomFilters.maxRent !== '' ? { maxRentPaise: Math.round(Number(appliedRoomFilters.maxRent) * 100) } : {}) } }),
        api.get('/stays/owner', { params: { limit: 100 } }),
        api.get('/admin/users', { params: { page: 1, limit: 100, role: 'OWNER', isActive: true } }),
      ]);
      if (sequence === requestSequence.current) { setUsers(userResponse.data.data.items); setUserPagination(userResponse.data.data.pagination); setHostels(hostelResponse.data.data.items); setHostelItems(hostelPageResponse.data.data.items); setHostelPagination(hostelPageResponse.data.data.pagination); setRooms(roomResponse.data.data.items); setRoomPagination(roomResponse.data.data.pagination); setStays(stayResponse.data.data.items); setOwners(ownerResponse.data.data.items); }
    } catch (requestError) { if (sequence === requestSequence.current) setError(getErrorMessage(requestError)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [userPage, userPageSize, userSearch, roleFilter, statusFilter, hostelPage, hostelPageSize, roomPage, appliedRoomFilters, debouncedRoomSearch]);
  useEffect(() => { setUserPage(1); setUserSearch(debouncedUserSearch); }, [debouncedUserSearch]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(user) {
    const next = !user.isActive;
    if (!window.confirm(`${next ? 'Activate' : 'Deactivate'} ${user.name}'s account?`)) return;
    const reason = window.prompt('Enter the reason for this account status change:');
    if (!reason || reason.trim().length < 3) return;
    try { await api.patch(`/admin/users/${user._id}/status`, { isActive: next, reason: reason.trim() }); await load(); showToast(`Account ${next ? 'activated' : 'deactivated'}.`); }
    catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  async function createOwner(event) {
    event.preventDefault(); setSaving(true);
    try {
      const identifier = normalizeOwnerIdentifier(ownerForm.identifier);
      if (!identifier) { showToast('Enter a valid email address or Indian mobile number.', 'error'); return; }
      await api.post('/admin/users/owners', { ...ownerForm, identifier: Object.values(identifier)[0] });
      setCreatingOwner(false); setOwnerPasswordVisible(false); setOwnerForm({ name: '', identifier: '', temporaryPassword: '', reason: '' });
      await load(); showToast('Owner account created and audit logged.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function changeRole() {
    if (!roleTarget) return;
    setSaving(true);
    try {
      await api.patch(`/admin/users/${roleTarget._id}/role`, { role: proposedRole, reason: roleReason.trim() });
      setRoleTarget(null); setRoleReason(''); await load(); showToast('User role updated and recorded in the audit log.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function changeOwnerPassword(event) {
    event.preventDefault();
    if (!passwordTarget) return;
    if (passwordForm.password !== passwordForm.confirmPassword) { showToast('Passwords do not match.', 'error'); return; }
    setSaving(true);
    try {
      await api.patch(`/admin/users/${passwordTarget._id}/password`, { password: passwordForm.password, reason: passwordForm.reason.trim() });
      setPasswordTarget(null); setPasswordForm({ password: '', confirmPassword: '', reason: '' });
      showToast('Owner password changed and recorded in the audit log.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  async function restore(type, record) {
    const name = record.name || record.identifier || record.email || type;
    if (!window.confirm(`Restore ${name}? It will remain inactive until explicitly reactivated.`)) return;
    const reason = window.prompt('Enter the reason for restoring this record:');
    if (!reason || reason.trim().length < 3) return;
    try { await api.post(`/admin/records/${type}/${record._id}/restore`, { reason: reason.trim() }); await load(); showToast('Record restored and audit logged.'); }
    catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  async function assignOwner(hostel, ownerId) {
    if (!ownerId || String(hostel.ownerId?._id || hostel.ownerId) === ownerId) return;
    const owner = owners.find((item) => item._id === ownerId);
    if (!window.confirm(`Assign ${hostel.name} to ${owner?.name || 'this owner'}? Access for the previous owner will be revoked immediately.`)) return;
    try { await api.patch(`/hostels/${hostel._id}/owner`, { ownerId }); await load(); showToast('Hostel owner updated and notified.'); }
    catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  function updateRoomFilter(name, value) { setRoomFilters((current) => ({ ...current, [name]: value })); }
  function applyRoomFilters() { setAppliedRoomFilters(roomFilters); setRoomPage(1); }
  function clearRoomFilters() { const cleared = { hostelId: '', genderEligibility: '', sharingType: '', minCapacity: '', maxCapacity: '', minRent: '', maxRent: '', minAvailableBeds: '', availability: '', active: '' }; setRoomPage(1); setRoomSearchInput(''); setRoomFilters(cleared); setAppliedRoomFilters(cleared); }

  async function correct(values) {
    if (values.moveInDate && values.rentRupees) { showToast('Correct move-in date and rent in separate audit entries.', 'error'); return; }
    const payload = { reason: values.reason };
    if (values.moveInDate) payload.moveInDate = values.moveInDate;
    if (values.rentRupees) payload.agreedMonthlyRentPaise = Math.round(Number(values.rentRupees) * 100);
    if (values.depositAdjustmentRupees) payload.depositAdjustmentPaise = Math.round(Number(values.depositAdjustmentRupees) * 100);
    if (Object.keys(payload).length === 1) { showToast('Enter at least one correction value.', 'error'); return; }
    if (!window.confirm('Apply this audited financial correction? Existing rent dues and payment records remain unchanged.')) return;
    setSaving(true);
    try { await api.patch(`/admin/stays/${values.stayId}/financial-terms`, payload); reset({ stayId: values.stayId, moveInDate: '', rentRupees: '', depositAdjustmentRupees: '', reason: '' }); await load(); showToast('Financial correction applied and audit logged.'); }
    catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSaving(false); }
  }

  return <div className="feature-page admin-page">
    <div className="feature-heading"><div><span className="eyebrow">SYSTEM ADMINISTRATION</span><h1>Admin workspace</h1><p>Manage accounts, properties, and elevated administrative corrections.</p></div><button className="button button-secondary" onClick={load}><RefreshCw size={14} />Refresh</button></div>
    <div className="admin-tabs" role="tablist" aria-label="Admin sections">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {loading ? <div className="feature-loading">Loading system records…</div> : <>
      {tab === 'Users' && <section className="panel admin-panel"><div className="panel-header"><div><h2>Accounts</h2><p>{userPagination.total} accounts · status and role changes are audited.</p></div><button className="button button-primary" onClick={() => setCreatingOwner(true)}>Create owner account</button></div><div className="feature-toolbar"><form className="search-box" onSubmit={(event) => { event.preventDefault(); setUserPage(1); setUserSearch(userSearchInput.trim()); }}><input aria-label="Search users" placeholder="Search name, phone, or email" value={userSearchInput} onChange={(event) => setUserSearchInput(event.target.value)} /><button>Search</button></form><label className="filter-select-label">Role<select value={draftRoleFilter} onChange={(event) => setDraftRoleFilter(event.target.value)}><option value="">All roles</option><option value="ADMIN">Admin</option><option value="OWNER">Owner</option><option value="TENANT">Tenant</option></select></label><label className="filter-select-label">Status<select value={draftStatusFilter} onChange={(event) => setDraftStatusFilter(event.target.value)}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option><option value="deleted">Deleted</option></select></label><button className="button button-primary" onClick={() => { setRoleFilter(draftRoleFilter); setStatusFilter(draftStatusFilter); setUserPage(1); }}>Apply Filters</button><button className="button button-secondary" onClick={() => { setRoleFilter(''); setStatusFilter(''); setDraftRoleFilter(''); setDraftStatusFilter(''); setUserPage(1); }}>Clear Filters</button></div><div className="table-wrap"><table><thead><tr><th>USER</th><th>PHONE</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th>ACTION</th></tr></thead><tbody>{users.map((item) => { const protectedSelf = item.isProtectedAdmin || String(item._id) === String(currentUser?._id); return <tr key={item._id}><td>{item.name}</td><td>{item.phone || '—'}</td><td>{item.email || '—'}</td><td><span className={`role-badge role-${item.role.toLowerCase()}`}>{item.role}</span></td><td><span className={`account-status ${item.isDeleted ? 'deleted' : item.isActive ? 'active' : 'inactive'}`}>{item.isDeleted ? 'Deleted' : item.isActive ? 'Active' : 'Inactive'}</span></td><td>{date(item.createdAt)}</td><td><div className="admin-user-actions">{item.isDeleted ? <button className="text-link" onClick={() => restore('USER', item)}>Restore</button> : <>{item.role === 'OWNER' && <button className="text-link" onClick={() => { setPasswordTarget(item); setPasswordForm({ password: '', confirmPassword: '', reason: '' }); }}>Change password</button>}<button className="text-link" disabled={protectedSelf} title={item.isProtectedAdmin ? 'The configured system administrator is protected.' : String(item._id) === String(currentUser?._id) ? 'You cannot change your own role.' : 'Change role'} onClick={() => { setRoleTarget(item); setProposedRole(item.role); }}>Change role</button><button className="text-link" disabled={protectedSelf || (item.role === 'ADMIN' && item.isActive && users.filter((u) => u.role === 'ADMIN' && u.isActive && !u.isDeleted).length <= 1)} title={item.isProtectedAdmin ? 'The configured system administrator is protected.' : 'Change account active status'} onClick={() => setStatus(item)}>{item.isActive ? 'Deactivate' : 'Activate'}</button></>}</div>{item.isProtectedAdmin && <small className="field-hint">Protected system administrator</small>}</td></tr>; })}</tbody></table></div><Pagination page={userPage} pages={userPagination.pages || 1} total={userPagination.total} pageSize={userPageSize} pageSizes={[10, 20, 50]} onPageChange={setUserPage} onPageSizeChange={(size) => { setUserPage(1); setUserPageSize(size); }} /></section>}
      {tab === 'Properties' && <><section className="panel admin-panel"><div className="panel-header"><div><h2>Hostels</h2><p>{hostelPagination.total} properties · system-wide inventory and soft-deleted records.</p></div></div><div className="table-wrap"><table><thead><tr><th>HOSTEL</th><th>OWNER</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{hostelItems.map((item) => <tr key={item._id}><td><div className="resident-cell"><span className="resident-avatar mint"><Building2 size={14} /></span><span><b>{item.name}</b><small>{item.city}</small></span></div></td><td>{item.ownerId?.name}</td><td>{item.isDeleted ? 'Deleted' : item.isActive ? 'Active' : 'Inactive'}</td><td>{item.isDeleted ? <button className="text-link" onClick={() => restore('HOSTEL', item)}>Restore</button> : <select aria-label={"Assign owner for " + item.name} value={item.ownerId?._id || ''} onChange={(event) => assignOwner(item, event.target.value)}><option value="">Owner unavailable</option>{owners.map((owner) => <option key={owner._id} value={owner._id}>{owner.name}</option>)}</select>}</td></tr>)}</tbody></table></div><Pagination page={hostelPage} pages={hostelPagination.pages || 1} total={hostelPagination.total} pageSize={hostelPageSize} pageSizes={[10, 20, 50]} onPageChange={setHostelPage} onPageSizeChange={(size) => { setHostelPage(1); setHostelPageSize(size); }} /></section><section className="panel admin-panel"><div className="panel-header"><div><h2>Rooms</h2><p>Deleted rooms can be restored after their parent hostel.</p></div></div><div className="admin-room-filters room-filter-panel"><div className="room-filter-row"><label className="room-search">Search room<div><Building2 size={14} /><input aria-label="Search rooms" value={roomSearchInput} onChange={(event) => setRoomSearchInput(event.target.value)} placeholder="Room number" /></div></label><label>Property<select value={roomFilters.hostelId} onChange={(event) => updateRoomFilter('hostelId', event.target.value)}><option value="">All properties</option>{hostels.filter((hostel) => !hostel.isDeleted).map((hostel) => <option key={hostel._id} value={hostel._id}>{hostel.name} · {hostel.city}</option>)}</select></label><label>Gender<select value={roomFilters.genderEligibility} onChange={(event) => updateRoomFilter('genderEligibility', event.target.value)}><option value="">All</option><option value="MALE">Male only</option><option value="FEMALE">Female only</option><option value="ANY">Mixed / any</option></select></label><label>Sharing<select value={roomFilters.sharingType} onChange={(event) => updateRoomFilter('sharingType', event.target.value)}><option value="">Any</option>{Array.from({ length: 20 }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n}-sharing</option>)}</select></label><label>Availability<select value={roomFilters.availability} onChange={(event) => updateRoomFilter('availability', event.target.value)}><option value="">Any</option><option value="AVAILABLE">Available</option><option value="PARTIAL">Partially occupied</option><option value="FULL">Full</option><option value="INACTIVE">Inactive</option></select></label><label>Status<select value={roomFilters.active} onChange={(event) => updateRoomFilter('active', event.target.value)}><option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></select></label></div><div className="room-filter-row"><label>Min capacity<input type="number" min="1" max="20" value={roomFilters.minCapacity} onChange={(event) => updateRoomFilter('minCapacity', event.target.value)} /></label><label>Max capacity<input type="number" min="1" max="20" value={roomFilters.maxCapacity} onChange={(event) => updateRoomFilter('maxCapacity', event.target.value)} /></label><label>Min rent (₹)<input type="number" min="0" value={roomFilters.minRent} onChange={(event) => updateRoomFilter('minRent', event.target.value)} /></label><label>Max rent (₹)<input type="number" min="0" value={roomFilters.maxRent} onChange={(event) => updateRoomFilter('maxRent', event.target.value)} /></label><label>Min free beds<input type="number" min="0" max="20" value={roomFilters.minAvailableBeds} onChange={(event) => updateRoomFilter('minAvailableBeds', event.target.value)} /></label><button className="button button-primary" onClick={applyRoomFilters}>Apply Filters</button><button className="button button-secondary" onClick={clearRoomFilters}>Clear filters</button></div><span className="room-results-count">{roomPagination.total} matching rooms</span></div><div className="table-wrap"><table><thead><tr><th>ROOM</th><th>HOSTEL</th><th>ELIGIBILITY</th><th>CAPACITY</th><th>DEFAULT RENT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rooms.length ? rooms.map((item) => <tr key={item._id}><td>{item.identifier}</td><td>{item.hostelId?.name}</td><td><span className={`room-eligibility eligibility-${item.genderEligibility || 'unknown'}`}>{({ MALE: 'Male Only', FEMALE: 'Female Only', ANY: 'Mixed / Any' })[item.genderEligibility] || 'Eligibility unconfigured'}</span></td><td>{item.occupancy} / {item.maxCapacity} · {item.availableBeds} free</td><td>₹{(item.defaultRentPaise / 100).toLocaleString('en-IN')}</td><td>{item.isDeleted ? 'Deleted' : item.isActive ? 'Active' : 'Inactive'}</td><td>{item.isDeleted && <button className="text-link" onClick={() => restore('ROOM', item)}>Restore</button>}</td></tr>) : <tr><td colSpan={7}>No rooms match the selected filters.</td></tr>}</tbody></table></div><Pagination page={roomPage} pages={roomPagination.pages || 1} total={roomPagination.total} onPageChange={setRoomPage} /></section></>}
      {tab === 'Corrections' && <section className="panel admin-correction"><div className="panel-header"><div><h2>Correct stay financial terms</h2><p>Each correction records before and after values. Existing dues and payments remain preserved.</p></div></div><form className="stacked-form" onSubmit={handleSubmit(correct)}><label>Stay<select {...register('stayId')}><option value="">Choose a stay</option>{stays.map((stay) => <option key={stay._id} value={stay._id}>{stay.tenantId?.name} · {stay.hostelId?.name} · {stay.status}</option>)}</select>{errors.stayId && <small>Select a stay.</small>}</label><div className="form-columns"><label>Correct move-in date <span className="optional-label">Optional</span><input type="date" {...register('moveInDate')} /></label><label>Correct future rent (₹)<span className="optional-label">Effective on next ungenerated cycle</span><input type="number" min="0.01" step="0.01" {...register('rentRupees')} /></label></div><div className="form-columns"><label>Deposit balance adjustment (₹)<span className="optional-label">Positive credit, negative debit</span><input type="number" step="0.01" {...register('depositAdjustmentRupees')} /></label><label>Reason<textarea rows="2" maxLength="1000" {...register('reason')} /></label></div><div className="dialog-actions"><button className="button button-primary" disabled={saving}>{saving ? 'Applying…' : <><Check size={14} />Apply audited correction</>}</button></div></form></section>}
    </>}
    {creatingOwner && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatingOwner(false); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setCreatingOwner(false)}>×</button><span className="eyebrow">CONTROLLED ONBOARDING</span><h2 id="owner-title">Create an owner account</h2><p>Share the temporary password securely with the owner. This action is recorded in the audit log.</p><form className="stacked-form" onSubmit={createOwner}><label>Full name<input required minLength="2" maxLength="100" value={ownerForm.name} onChange={(event) => setOwnerForm({ ...ownerForm, name: event.target.value })} /></label><label>Email address or phone number<input required value={ownerForm.identifier} onChange={(event) => setOwnerForm({ ...ownerForm, identifier: event.target.value })} placeholder="owner@example.com or +91 98765 43210" /></label><label>Temporary password<div className="password-field"><input required type={ownerPasswordVisible ? 'text' : 'password'} minLength="10" value={ownerForm.temporaryPassword} onChange={(event) => setOwnerForm({ ...ownerForm, temporaryPassword: event.target.value })} /><button type="button" aria-label={ownerPasswordVisible ? 'Hide password' : 'Show password'} onClick={() => setOwnerPasswordVisible((visible) => !visible)}>{ownerPasswordVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><small>10+ characters with uppercase, lowercase, and a number.</small></label><label>Reason for onboarding<textarea required minLength="3" maxLength="500" value={ownerForm.reason} onChange={(event) => setOwnerForm({ ...ownerForm, reason: event.target.value })} /></label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setCreatingOwner(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Creating…' : 'Create owner'}</button></div></form></section></div>}
    {roleTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoleTarget(null); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="role-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setRoleTarget(null)}>×</button><span className="eyebrow">ROLE MANAGEMENT</span><h2 id="role-title">Change {roleTarget.name}'s role</h2><p>{roleTarget.email || roleTarget.phone || 'Account'} · Current role: <b className={`role-badge role-${roleTarget.role.toLowerCase()}`}>{roleTarget.role}</b></p><p>Changing a role updates which properties and records this account can access. The change is audited and cannot be applied to your own account.</p><label>Proposed role<select value={proposedRole} onChange={(event) => setProposedRole(event.target.value)}>{['ADMIN','OWNER','TENANT'].map((role) => <option key={role}>{role}</option>)}</select></label><label>Administrative note <span className="optional-label">Optional</span><textarea rows="3" maxLength="500" value={roleReason} onChange={(event) => setRoleReason(event.target.value)} /></label><p>Current: <b className={`role-badge role-${roleTarget.role.toLowerCase()}`}>{roleTarget.role}</b> · Proposed: <b className={`role-badge role-${proposedRole.toLowerCase()}`}>{proposedRole}</b></p><div className="dialog-actions"><button className="button button-secondary" onClick={() => setRoleTarget(null)}>Cancel</button><button className="button button-primary" disabled={saving || proposedRole === roleTarget.role} onClick={changeRole}>{saving ? 'Saving…' : 'Confirm role change'}</button></div></section></div>}
    {passwordTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordTarget(null); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-password-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setPasswordTarget(null)}>×</button><span className="eyebrow">OWNER ACCOUNT SECURITY</span><h2 id="owner-password-title">Change {passwordTarget.name}'s password</h2><p>This resets the owner's login password. The change is recorded in the audit log without storing the password there.</p><form className="stacked-form" onSubmit={changeOwnerPassword}><label>New password<input required type="password" minLength="10" maxLength="72" autoComplete="new-password" value={passwordForm.password} onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })} /><small>10+ characters with uppercase, lowercase, and a number.</small></label><label>Confirm new password<input required type="password" minLength="10" maxLength="72" autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} /></label><label>Reason for password reset<textarea required minLength="3" maxLength="500" value={passwordForm.reason} onChange={(event) => setPasswordForm({ ...passwordForm, reason: event.target.value })} /></label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setPasswordTarget(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button></div></form></section></div>}
  </div>;
}
