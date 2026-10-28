import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BedDouble, Plus, Search, Users } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api.js';
import { useToast } from '../components/common/ToastContext.jsx';
import Pagination from '../components/common/Pagination.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { roomAcceptsGender } from '../lib/roomEligibility.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const money = (paise = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';
const blankForm = () => ({ name: '', phone: '', email: '', emergencyContact: '', notes: '', gender: '', hostelId: '', roomId: '', moveInDate: today(), agreedMonthlyRent: '', deposit: '0' });

export default function TenantsPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const initialHostel = searchParams.get('hostelId') || '';
  const initialRoom = searchParams.get('roomId') || '';
  const [items, setItems] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [filterRooms, setFilterRooms] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim());
  const [search, setSearch] = useState('');
  const [draftFilters, setDraftFilters] = useState({ hostelId: '', roomId: '', status: '' });
  const [filters, setFilters] = useState({ hostelId: '', roomId: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(() => ({ ...blankForm(), hostelId: initialHostel, roomId: initialRoom }));
  const sequence = useRef(0);
  const selectedHostel = hostels.find((hostel) => hostel._id === form.hostelId);
  const eligibleRooms = rooms.filter((room) => room.isActive !== false && room.availableBeds > 0 && roomAcceptsGender(room, form.gender, selectedHostel?.accommodationPolicy));
  const selectedRoom = rooms.find((room) => room._id === form.roomId);
  const roomGenderMismatch = selectedRoom && !roomAcceptsGender(selectedRoom, form.gender, selectedHostel?.accommodationPolicy);
  const roomIsSelectable = eligibleRooms.some((room) => room._id === form.roomId);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/tenants', { params: { page, limit: pageSize, ...(search ? { search } : {}), ...(filters.hostelId ? { hostelId: filters.hostelId } : {}), ...(filters.roomId ? { roomId: filters.roomId } : {}), ...(filters.status ? { status: filters.status } : {}) } });
      if (current === sequence.current) { setItems(data.data.items); setPagination(data.data.pagination); }
    } catch (requestError) { if (current === sequence.current) setError(getErrorMessage(requestError)); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page, pageSize, search, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSearch(debouncedSearch); setPage(1); }, [debouncedSearch]);
  useEffect(() => { if (initialHostel && initialRoom) setCreating(true); }, [initialHostel, initialRoom]);
  useEffect(() => { api.get('/hostels', { params: { page: 1, limit: 100 } }).then(({ data }) => setHostels(data.data.items)).catch(() => setHostels([])); }, []);
  useEffect(() => {
    if (!draftFilters.hostelId) { setFilterRooms([]); return undefined; }
    let active = true;
    api.get(`/hostels/${draftFilters.hostelId}/rooms`, { params: { page: 1, limit: 100 } }).then(({ data }) => { if (active) setFilterRooms(data.data.items); }).catch(() => { if (active) setFilterRooms([]); });
    return () => { active = false; };
  }, [draftFilters.hostelId]);
  useEffect(() => {
    if (!form.hostelId || !form.gender) { setRooms([]); setRoomsLoading(false); return undefined; }
    let active = true;
    setRoomsLoading(true);
    api.get(`/hostels/${form.hostelId}/rooms`, { params: { page: 1, limit: 100, active: 'true', availability: 'AVAILABLE', minAvailableBeds: 1 } }).then(({ data }) => { if (active) setRooms(data.data.items); }).catch(() => { if (active) setRooms([]); }).finally(() => { if (active) setRoomsLoading(false); });
    return () => { active = false; };
  }, [form.hostelId, form.gender]);
  useEffect(() => {
    if (!form.roomId || form.agreedMonthlyRent || !rooms.length) return;
    const room = rooms.find((item) => item._id === form.roomId);
    if (room) setForm((current) => ({ ...current, agreedMonthlyRent: String(room.defaultRentPaise / 100) }));
  }, [form.roomId, form.agreedMonthlyRent, rooms]);

  function chooseRoom(roomId) {
    const room = eligibleRooms.find((item) => item._id === roomId);
    setForm((current) => ({ ...current, roomId, agreedMonthlyRent: room ? String(room.defaultRentPaise / 100) : '' }));
  }

  function chooseGender(gender) {
    setForm((current) => {
      const room = rooms.find((item) => item._id === current.roomId);
      const keepRoom = room && roomAcceptsGender(room, gender, selectedHostel?.accommodationPolicy);
      return { ...current, gender, ...(keepRoom ? {} : { roomId: '', agreedMonthlyRent: '' }) };
    });
  }

  async function create(event) {
    event.preventDefault(); setFormError('');
    if (!roomIsSelectable) { setFormError('Choose a currently available room that matches this gender and property policy.'); return; }
    setSaving(true);
    try {
      await api.post('/tenants', {
        name: form.name, phone: form.phone, ...(form.email ? { email: form.email } : {}), emergencyContact: form.emergencyContact, notes: form.notes, gender: form.gender,
        hostelId: form.hostelId, roomId: form.roomId, moveInDate: form.moveInDate,
        agreedMonthlyRentPaise: Math.round(Number(form.agreedMonthlyRent) * 100), securityDepositPaise: Math.round(Number(form.deposit || 0) * 100),
      });
      setCreating(false); setForm(blankForm()); setPage(1); await load(); showToast('Tenant created and assigned.');
    } catch (requestError) { const message = getErrorMessage(requestError); setFormError(message); }
    finally { setSaving(false); }
  }

  return <div className="feature-page">
    <div className="feature-heading"><div><span className="eyebrow">PEOPLE & OCCUPANCY</span><h1>Tenants</h1><p>Manage tenant profiles, room assignments, rent, and stay history.</p></div><button className="button button-primary" onClick={() => { setFormError(''); setForm({ ...blankForm(), ...(initialHostel ? { hostelId: initialHostel } : {}), ...(initialRoom ? { roomId: initialRoom } : {}) }); setCreating(true); }}><Plus size={15} />Create tenant</button></div>
    <div className="feature-toolbar"><label className="search-box"><Search size={15} /><input aria-label="Search tenants" placeholder="Search tenant name or phone" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><label className="filter-select-label">Property<select value={draftFilters.hostelId} onChange={(event) => setDraftFilters((current) => ({ ...current, hostelId: event.target.value, roomId: '' }))}><option value="">All properties</option>{hostels.map((hostel) => <option key={hostel._id} value={hostel._id}>{hostel.name}</option>)}</select></label><label className="filter-select-label">Room<select disabled={!draftFilters.hostelId} value={draftFilters.roomId} onChange={(event) => setDraftFilters((current) => ({ ...current, roomId: event.target.value }))}><option value="">All rooms</option>{filterRooms.map((room) => <option key={room._id} value={room._id}>{room.identifier}</option>)}</select></label><label className="filter-select-label">Stay status<select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All tenants</option><option value="ACTIVE">Active stay</option><option value="LEFT">Previous stay</option><option value="NO_STAY">No active stay</option></select></label><button className="button button-primary" onClick={() => { setFilters(draftFilters); setPage(1); }}>Apply Filters</button><button className="button button-secondary" onClick={() => { const cleared = { hostelId: '', roomId: '', status: '' }; setDraftFilters(cleared); setFilters(cleared); setPage(1); }}>Clear Filters</button><span className="result-count">{pagination.total} tenants</span></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {loading ? <div className="feature-loading">Loading tenants…</div> : items.length ? <div className="table-wrap tenants-table-wrap"><table><thead><tr><th>TENANT</th><th>PHONE</th><th>PROPERTY / ROOM</th><th>JOINED</th><th>MONTHLY RENT</th><th>AGREED DEPOSIT</th><th>STAY</th><th /></tr></thead><tbody>{items.map((tenant) => <tr key={tenant._id}><td><b>{tenant.name}</b></td><td>{tenant.phone || '—'}</td><td>{tenant.stay ? `${tenant.stay.hostelId?.name || '—'} · Room ${tenant.stay.roomId?.identifier || '—'}` : 'Not assigned'}</td><td>{date(tenant.stay?.moveInDate)}</td><td>{tenant.stay ? money(tenant.stay.currentRentPaise) : '—'}</td><td>{tenant.stay ? money(tenant.stay.securityDepositPaise) : '—'}</td><td>{tenant.stay?.status || 'NO STAY'}</td><td><Link className="text-link" to={`/tenants/${tenant._id}`}>Open profile</Link></td></tr>)}</tbody></table></div> : !error && <div className="feature-empty"><span className="empty-icon"><Users size={19} /></span><h2>No tenants found</h2><p>Create a tenant and assign a room to start managing occupancy.</p><button className="button button-primary" onClick={() => setCreating(true)}><Plus size={15} />Create tenant</button></div>}
    {!loading && <Pagination page={page} pages={pagination.pages || 1} total={pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />}
    {creating && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="create-tenant-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setCreating(false)}>×</button><span className="eyebrow">NEW TENANT</span><h2 id="create-tenant-title">Create tenant and assign room</h2><p>Rent and deposit are recorded on this stay. Later room default rent changes do not affect this agreement.</p><form className="stacked-form" onSubmit={create}>
      <label>Full name<input required minLength="2" maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><div className="form-columns"><label>Phone number<input required type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+91 98765 43210" /></label><label>Email <span className="optional-label">Optional</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label></div>
      <div className="form-columns"><label>Gender profile<select required value={form.gender} onChange={(event) => chooseGender(event.target.value)}><option value="">Choose gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option><option value="PREFER_NOT_TO_SAY">Prefer not to say</option></select></label><label>Joining date<input required type="date" value={form.moveInDate} onChange={(event) => setForm((current) => ({ ...current, moveInDate: event.target.value }))} /></label></div>
      <div className="form-columns"><label>Property<select required value={form.hostelId} onChange={(event) => setForm((current) => ({ ...current, hostelId: event.target.value, roomId: '', agreedMonthlyRent: '' }))}><option value="">Choose property</option>{hostels.map((hostel) => <option key={hostel._id} value={hostel._id}>{hostel.name}</option>)}</select></label><label>Eligible room<select required disabled={!form.gender || !form.hostelId || roomsLoading} value={form.roomId} onChange={(event) => chooseRoom(event.target.value)}><option value="">{roomsLoading ? 'Loading eligible rooms…' : 'Choose an available room'}</option>{eligibleRooms.map((room) => <option key={room._id} value={room._id}>Room {room.identifier} · {selectedHostel?.name} · {room.genderEligibility === 'ANY' ? 'Any gender' : `${room.genderEligibility === 'MALE' ? 'Male' : 'Female'} only`} · capacity {room.maxCapacity}, occupants {room.occupancy}, available {room.availableBeds} · {money(room.defaultRentPaise)}/month</option>)}</select></label></div>
      {form.gender && form.hostelId && !roomsLoading && eligibleRooms.length === 0 && <p className="optional-label" role="status">No active rooms with available beds match this gender and property.</p>}
      {roomGenderMismatch && <div className="form-error" role="alert">The selected room is not eligible for this gender or property policy. Choose another room.</div>}
      <div className="form-columns"><label>Agreed monthly rent (₹)<input required type="number" min="0.01" step="0.01" value={form.agreedMonthlyRent} onChange={(event) => setForm((current) => ({ ...current, agreedMonthlyRent: event.target.value }))} /></label><label>Initial deposit (₹)<input required type="number" min="0" step="0.01" value={form.deposit} onChange={(event) => setForm((current) => ({ ...current, deposit: event.target.value }))} /></label></div>
      <div className="form-columns"><label>Emergency contact <span className="optional-label">Optional</span><input value={form.emergencyContact} onChange={(event) => setForm((current) => ({ ...current, emergencyContact: event.target.value }))} /></label><label>Notes <span className="optional-label">Optional</span><input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label></div>
      {formError && <div className="form-error" role="alert">{formError}</div>}<div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setCreating(false)}>Cancel</button><button className="button button-primary" disabled={saving || roomsLoading || !form.gender || !roomIsSelectable || roomGenderMismatch}>{saving ? 'Creating…' : <><BedDouble size={14} />Create and assign</>}</button></div>
    </form></section></div>}
  </div>;
}
