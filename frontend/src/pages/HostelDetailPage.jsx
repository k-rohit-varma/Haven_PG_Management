import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BedDouble, Building2, History, MapPin, Pencil, Plus, Users, Search, ShieldAlert } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import Pagination from '../components/common/Pagination.jsx';

const roomSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter a room number.'),
  sharingType: z.coerce.number().int().min(1).max(20),
  maxCapacity: z.coerce.number().int().min(1).max(20),
  genderEligibility: z.enum(['ANY', 'MALE', 'FEMALE']),
  defaultMonthlyRent: z.coerce.number().min(0).max(1000000),
  notes: z.string().max(500),
  reason: z.string().max(300),
  isActive: z.boolean(),
}).refine((values) => values.sharingType <= values.maxCapacity, { path: ['maxCapacity'], message: 'Capacity cannot be below sharing type.' });
const hostelSchema = z.object({
  name: z.string().trim().min(2).max(120), address: z.string().trim().min(5).max(300), city: z.string().trim().min(2).max(100),
  accommodationPolicy: z.enum(['MIXED', 'MALE_ONLY', 'FEMALE_ONLY']), contactPhone: z.string().trim().max(30),
  description: z.string().trim().max(2000), facilities: z.string().max(1000), isActive: z.boolean(), ownerId: z.string().optional(),
});

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const eligibilityLabel = (value) => ({ MALE: 'Male Only', FEMALE: 'Female Only', ANY: 'Mixed / Any' })[value] || 'Eligibility unconfigured';

export default function HostelDetailPage() {
  const { hostelId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [hostel, setHostel] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomSummary, setRoomSummary] = useState({ count: 0, occupied: 0, capacity: 0, available: 0 });
  const [roomPagination, setRoomPagination] = useState({ page: 1, limit: 12, pages: 1, total: 0 });
  const [roomPage, setRoomPage] = useState(1);
  const [roomSearch, setRoomSearch] = useState('');
  const debouncedRoomSearch = useDebouncedValue(roomSearch.trim());
  const [roomFilters, setRoomFilters] = useState({ genderEligibility: '', sharingType: '', minCapacity: '', maxCapacity: '', availability: '', active: '', minRent: '', maxRent: '', minAvailableBeds: '', sortBy: 'identifier_asc', limit: '12' });
  const [draftRoomFilters, setDraftRoomFilters] = useState({ genderEligibility: '', sharingType: '', minCapacity: '', maxCapacity: '', availability: '', active: '', minRent: '', maxRent: '', minAvailableBeds: '', sortBy: 'identifier_asc', limit: '12' });
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const roomRequestSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hostelDialogOpen, setHostelDialogOpen] = useState(false);
  const [activeOwners, setActiveOwners] = useState([]);
  const [savingHostel, setSavingHostel] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [historyRoom, setHistoryRoom] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [roomDetails, setRoomDetails] = useState(null);
  const [roomDetailsError, setRoomDetailsError] = useState('');
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const defaults = { sharingType: 2, maxCapacity: 2, genderEligibility: 'ANY', defaultMonthlyRent: 8000, notes: '', reason: '', isActive: true };
  const { register, handleSubmit, reset, setValue, getValues, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(roomSchema), defaultValues: defaults });
  const hostelForm = useForm({ resolver: zodResolver(hostelSchema) });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/hostels/${hostelId}`);
      setHostel(data.data.hostel);
      setRoomSummary(data.data.roomSummary || { count: 0, occupied: 0, capacity: 0, available: 0 });
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setLoading(false); }
  }, [hostelId]);

  useEffect(() => { load(); }, [load]);

  const loadRooms = useCallback(async () => {
    const sequence = ++roomRequestSequence.current;
    setRoomsLoading(true); setRoomsError('');
    const params = { page: roomPage, limit: Number(roomFilters.limit), sortBy: roomFilters.sortBy };
    if (debouncedRoomSearch) params.search = debouncedRoomSearch;
    for (const key of ['genderEligibility', 'sharingType', 'minCapacity', 'maxCapacity', 'minAvailableBeds', 'availability', 'active']) if (roomFilters[key] !== '') params[key] = roomFilters[key];
    if (roomFilters.minRent !== '') params.minRentPaise = Math.round(Number(roomFilters.minRent) * 100);
    if (roomFilters.maxRent !== '') params.maxRentPaise = Math.round(Number(roomFilters.maxRent) * 100);
    try {
      const { data } = await api.get(`/hostels/${hostelId}/rooms`, { params });
      if (sequence === roomRequestSequence.current) { setRooms(data.data.items); setRoomPagination(data.data.pagination); }
    } catch (requestError) { if (sequence === roomRequestSequence.current) setRoomsError(getErrorMessage(requestError)); }
    finally { if (sequence === roomRequestSequence.current) setRoomsLoading(false); }
  }, [debouncedRoomSearch, hostelId, roomFilters, roomPage]);
  useEffect(() => { loadRooms(); }, [loadRooms]);

  function openNewRoom() {
    setEditingRoom(null);
    reset(defaults);
    setDialogOpen(true);
  }

  function openEditRoom(room) {
    setEditingRoom(room);
    reset({ ...defaults, identifier: room.identifier, sharingType: room.sharingType, maxCapacity: room.maxCapacity, genderEligibility: room.genderEligibility, defaultMonthlyRent: room.defaultRentPaise / 100, notes: room.notes || '', isActive: room.isActive });
    setDialogOpen(true);
  }

  async function openEditHostel() {
    const ownerId = hostel.ownerId?._id || hostel.ownerId || '';
    if (user?.role === 'ADMIN') {
      try {
        const { data } = await api.get('/admin/users', { params: { page: 1, limit: 100, role: 'OWNER', isActive: true } });
        setActiveOwners(data.data.items || []);
      } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); return; }
    }
    hostelForm.reset({ name: hostel.name, address: hostel.address, city: hostel.city, accommodationPolicy: hostel.accommodationPolicy, contactPhone: hostel.contactPhone || '', description: hostel.description || '', facilities: (hostel.facilities || []).join(', '), isActive: hostel.isActive, ownerId });
    setHostelDialogOpen(true);
  }

  async function saveHostel(values) {
    setSavingHostel(true);
    try {
      const currentOwnerId = hostel.ownerId?._id || hostel.ownerId || '';
      if (user?.role === 'ADMIN' && values.ownerId && values.ownerId !== currentOwnerId) {
        await api.patch(`/hostels/${hostelId}/owner`, { ownerId: values.ownerId });
      }
      const details = { ...values };
      delete details.ownerId;
      await api.patch(`/hostels/${hostelId}`, { ...details, facilities: values.facilities.split(',').map((item) => item.trim()).filter(Boolean) });
      setHostelDialogOpen(false);
      await Promise.all([load(), loadRooms()]);
      showToast(user?.role === 'ADMIN' && values.ownerId !== currentOwnerId ? 'Property details and owner updated.' : 'Property details updated.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
    finally { setSavingHostel(false); }
  }

  async function toggleBlock() {
    const blocked = !hostel.isBlocked;
    const reason = blocked ? globalThis.prompt('Reason for blocking this hostel (optional):') : '';
    if (blocked && reason === null) return;
    if (!globalThis.confirm(blocked ? 'Blocking prevents the owner and tenants from accessing this hostel. Existing stays and financial history will be preserved. Continue?' : 'Unblock this hostel and restore owner and tenant access?')) return;
    try {
      await api.patch(`/hostels/${hostelId}/block`, { blocked, reason: reason || '' });
      await load();
      showToast(blocked ? 'Hostel blocked. Existing records were preserved.' : 'Hostel unblocked.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  async function showHistory(room) {
    try {
      const { data } = await api.get(`/rooms/${room._id}/history`);
      setHistoryRoom(room);
      setHistoryItems(data.data.items);
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  async function showRoomDetails(room) {
    setRoomDetailsError('');
    try {
      const { data } = await api.get(`/rooms/${room._id}`);
      setRoomDetails(data.data);
    } catch (requestError) { setRoomDetailsError(getErrorMessage(requestError)); }
  }

  async function saveRoom(values) {
    try {
      const roomValues = {
        identifier: values.identifier,
        sharingType: values.sharingType,
        maxCapacity: values.maxCapacity,
        genderEligibility: values.genderEligibility,
        defaultRentPaise: Math.round(values.defaultMonthlyRent * 100),
        facilities: [],
        notes: values.notes,
      };
      if (editingRoom) await api.patch(`/rooms/${editingRoom._id}`, { ...roomValues, isActive: values.isActive, reason: values.reason });
      else await api.post(`/hostels/${hostelId}/rooms`, roomValues);
      setDialogOpen(false);
      setEditingRoom(null);
      reset(defaults);
      await Promise.all([load(), loadRooms()]);
      showToast(editingRoom ? 'Room configuration updated and recorded.' : 'Room added and configuration history recorded.');
    } catch (requestError) { showToast(getErrorMessage(requestError), 'error'); }
  }

  if (loading) return <div className="feature-loading">Loading property…</div>;
  if (error || !hostel) return <div className="feature-error" role="alert">{error || 'Property not found.'}<button onClick={load}>Try again</button><Link to="/hostels">Back to properties</Link></div>;

  const available = roomSummary.available;
  const capacity = roomSummary.capacity;
  const occupied = roomSummary.occupied;
  function updateRoomFilter(name, value) {
    setDraftRoomFilters((current) => ({ ...current, [name]: value }));
    if (name === 'sortBy' || name === 'limit') {
      setRoomPage(1);
      setRoomFilters((current) => ({ ...current, [name]: value }));
    }
  }
  function applyRoomFilters() { setRoomPage(1); setRoomFilters((current) => ({ ...current, ...draftRoomFilters })); }
  function clearRoomFilters() { const empty = { genderEligibility: '', sharingType: '', minCapacity: '', maxCapacity: '', availability: '', active: '', minRent: '', maxRent: '', minAvailableBeds: '', sortBy: 'identifier_asc', limit: '12' }; setRoomSearch(''); setRoomPage(1); setDraftRoomFilters(empty); setRoomFilters(empty); }
  return <div className="feature-page"><Link to="/hostels" className="back-link"><ArrowLeft size={15} />Properties</Link>
    <div className="detail-hero"><span className="detail-icon"><Building2 size={23} /></span><div className="detail-title"><span className="eyebrow">{hostel.accommodationPolicy.replaceAll('_', ' ')} · {hostel.isBlocked ? 'BLOCKED' : hostel.isActive ? 'ACTIVE LISTING' : 'INACTIVE LISTING'}</span><h1>{hostel.name}</h1><p><MapPin size={14} />{hostel.address}, {hostel.city}</p>{hostel.isBlocked && <p className="feature-error">Blocked: {hostel.blockReason || 'Access is disabled for the owner and tenants.'}</p>}</div>{canManage && <div className="detail-actions"><button className="button button-secondary" onClick={openEditHostel}><Pencil size={15} />Edit property</button>{user?.role === 'ADMIN' && <button className={hostel.isBlocked ? 'button button-primary' : 'button button-danger'} onClick={toggleBlock}><ShieldAlert size={15} />{hostel.isBlocked ? 'Unblock hostel' : 'Block hostel'}</button>}</div>}</div>
    {hostel.facilities?.length > 0 && <div className="facility-chips">{hostel.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>}
    {hostel.description && <p className="detail-description">{hostel.description}</p>}
    <div className="detail-metrics"><article><BedDouble size={17} /><div><b>{roomSummary.count}</b><span>Active rooms</span></div></article><article><Users size={17} /><div><b>{occupied} / {capacity}</b><span>Beds occupied</span></div></article><article><Building2 size={17} /><div><b>{available}</b><span>Beds available</span></div></article></div>
    <div className="section-heading"><div><h2>Rooms</h2><p>Room capacity and default rent for future stays</p></div>{canManage && <button className="button button-secondary" onClick={openNewRoom}><Plus size={15} />Add room</button>}</div>
    <div className="room-filter-panel" aria-label="Room filters">
      <p className="room-filter-hint">Search, sorting and page size update independently. Other filter changes apply when you select Apply Filters.</p>
      <div className="room-filter-row"><label className="room-search"><span>Search room</span><div><Search size={15} /><input type="search" value={roomSearch} onChange={(event) => { setRoomPage(1); setRoomSearch(event.target.value); }} placeholder="Room number or name" /></div></label>
        <label>Gender eligibility<select value={draftRoomFilters.genderEligibility} onChange={(event) => updateRoomFilter('genderEligibility', event.target.value)}><option value="">All eligibility</option><option value="MALE">Male only</option><option value="FEMALE">Female only</option><option value="ANY">Mixed / any</option></select></label>
        <label>Sharing<select value={draftRoomFilters.sharingType} onChange={(event) => updateRoomFilter('sharingType', event.target.value)}><option value="">Any sharing</option>{Array.from({ length: 20 }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Single' : `${n}-sharing`}</option>)}</select></label>
        <label>Availability<select value={draftRoomFilters.availability} onChange={(event) => updateRoomFilter('availability', event.target.value)}><option value="">Any availability</option><option value="AVAILABLE">Available beds</option><option value="PARTIAL">Partially occupied</option><option value="FULL">Full</option><option value="INACTIVE">Inactive</option></select></label>
        {canManage && <label>Active status<select value={draftRoomFilters.active} onChange={(event) => updateRoomFilter('active', event.target.value)}><option value="">Active and inactive</option><option value="true">Active</option><option value="false">Inactive</option></select></label>}
      </div>
      <div className="room-filter-row"><label>Min capacity<input type="number" min="1" max="20" value={draftRoomFilters.minCapacity} onChange={(event) => updateRoomFilter('minCapacity', event.target.value)} /></label><label>Max capacity<input type="number" min="1" max="20" value={draftRoomFilters.maxCapacity} onChange={(event) => updateRoomFilter('maxCapacity', event.target.value)} /></label><label>Min rent (₹)<input type="number" min="0" step="1" value={draftRoomFilters.minRent} onChange={(event) => updateRoomFilter('minRent', event.target.value)} /></label><label>Max rent (₹)<input type="number" min="0" step="1" value={draftRoomFilters.maxRent} onChange={(event) => updateRoomFilter('maxRent', event.target.value)} /></label><label>Min free beds<input type="number" min="0" max="20" value={draftRoomFilters.minAvailableBeds} onChange={(event) => updateRoomFilter('minAvailableBeds', event.target.value)} /></label>
        <label>Sort by<select value={roomFilters.sortBy} onChange={(event) => updateRoomFilter('sortBy', event.target.value)}><option value="identifier_asc">Room number ↑</option><option value="identifier_desc">Room number ↓</option><option value="rent_asc">Rent: low to high</option><option value="rent_desc">Rent: high to low</option><option value="available_desc">Most free beds</option><option value="occupancy_desc">Most occupied</option><option value="created_desc">Recently created</option></select></label><label>Page size<select value={roomFilters.limit} onChange={(event) => updateRoomFilter('limit', event.target.value)}><option value="12">12</option><option value="24">24</option><option value="48">48</option></select></label><button className="button button-primary" onClick={applyRoomFilters}>Apply Filters</button><button className="button button-secondary clear-filter-button" onClick={clearRoomFilters}>Clear filters</button>
      </div>
    </div>
    <div className="room-results-count">{roomPagination.total} matching {roomPagination.total === 1 ? 'room' : 'rooms'}</div>
    {roomsError && <div className="feature-error" role="alert">{roomsError}<button onClick={loadRooms}>Try again</button></div>}
    {roomsLoading ? <div className="feature-loading">Loading rooms…</div> : rooms.length ? <div className="room-grid">{rooms.map((room) => <article className="room-card" key={room._id}><div className="room-card-head"><span className="room-icon"><BedDouble size={18} /></span><span className={`room-eligibility eligibility-${room.genderEligibility || 'unknown'}`}>{eligibilityLabel(room.genderEligibility)}</span>{room.isActive === false && <span className="room-eligibility room-inactive">Inactive</span>}{canManage && <span className="room-card-actions"><button aria-label={`Edit room ${room.identifier}`} onClick={() => openEditRoom(room)}><Pencil size={14} /></button><button aria-label={`View room ${room.identifier} history`} onClick={() => showHistory(room)}><History size={14} /></button></span>}</div><h3>Room {room.identifier}</h3><p>{room.sharingType}-sharing · {room.maxCapacity} bed capacity</p><div className="room-card-foot"><span>{room.occupancy} occupied · {room.availableBeds} available</span><b>{money(room.defaultRentPaise)}<small> / bed / month</small></b></div><div className="room-actions"><button className="button button-secondary" onClick={() => showRoomDetails(room)}>Room details</button>{canManage && <button className="button button-secondary" disabled={room.availableBeds < 1 || room.isActive === false} onClick={() => navigate('/applications', { state: { hostelId, roomId: room._id } })}>Assign Tenant</button>}</div></article>)}</div> : <div className="feature-empty compact-empty"><span className="empty-icon"><BedDouble size={19} /></span><h2>{roomPagination.total ? 'No rooms match these filters' : 'No rooms configured'}</h2><p>{roomPagination.total ? 'Adjust or clear the selected filters.' : 'Add rooms to track capacity and default monthly rent.'}</p>{roomPagination.total > 0 && <button className="button button-secondary" onClick={clearRoomFilters}>Clear filters</button>}</div>}
    {!roomsLoading && <Pagination page={roomPage} pages={roomPagination.pages || 1} total={roomPagination.total} onPageChange={setRoomPage} />}
    {dialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="create-room-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setDialogOpen(false)}>×</button><span className="eyebrow">ROOM INVENTORY</span><h2 id="create-room-title">{editingRoom ? `Edit room ${editingRoom.identifier}` : 'Add a room'}</h2><p>Default rent applies to future stays. Existing agreements are unchanged.</p><form onSubmit={handleSubmit(saveRoom)} className="stacked-form">
      <label>Room number<input {...register('identifier')} placeholder="e.g. 101" />{errors.identifier && <small>{errors.identifier.message}</small>}</label>
      <div className="form-columns"><label>Sharing type<select {...register('sharingType', { onChange: (event) => { const selectedSharing = Number(event.target.value); if (Number(getValues('maxCapacity')) < selectedSharing) setValue('maxCapacity', selectedSharing, { shouldDirty: true, shouldValidate: true }); } })}>{Array.from({ length: 20 }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Single' : `${n}-sharing`}</option>)}</select></label><label>Bed capacity<input {...register('maxCapacity')} type="number" min="1" max="20" />{errors.maxCapacity && <small>{errors.maxCapacity.message}</small>}</label></div>
      <div className="form-columns"><label>Gender eligibility<select {...register('genderEligibility')}><option value="ANY">Any gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label><label>Monthly rent per bed<input {...register('defaultMonthlyRent')} type="number" min="0" step="0.01" />{errors.defaultMonthlyRent && <small>{errors.defaultMonthlyRent.message}</small>}</label></div>
      {editingRoom && <label>Room status<select {...register('isActive', { setValueAs: (value) => value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></label>}
      {editingRoom && <label>Change reason <span className="optional-label">Optional, recorded in history</span><input {...register('reason')} placeholder="e.g. Converted for additional sharing" /></label>}
      <label>Notes <span className="optional-label">Optional</span><textarea {...register('notes')} rows="2" placeholder="Room details or facilities" /></label>
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setDialogOpen(false)}>Cancel</button><button disabled={isSubmitting} className="button button-primary">{isSubmitting ? 'Saving…' : editingRoom ? 'Save room' : 'Add room'}</button></div>
    </form></section></div>}
    {historyRoom && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryRoom(null); }}><section className="form-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title"><button className="dialog-close" aria-label="Close history" onClick={() => setHistoryRoom(null)}>×</button><span className="eyebrow">AUDIT TRAIL</span><h2 id="history-title">Room {historyRoom.identifier} configuration</h2><p>Changes are preserved with the actor, timestamp, and previous values.</p><div className="history-list">{historyItems.map((entry) => <article key={`${entry.changedAt}-${entry._id}`}><div><b>{entry.actorId?.name || 'Account'} · {entry.actorId?.role || ''}</b><time>{entry.changedAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(entry.changedAt)) : 'Date unavailable'}</time></div><span>{entry.reason || 'Configuration updated'}</span><small>{entry.previous?.maxCapacity ?? '—'} → {entry.next?.maxCapacity ?? '—'} beds · {money(entry.previous?.defaultRentPaise || 0)} → {money(entry.next?.defaultRentPaise || 0)} per bed</small></article>)}</div></section></div>}
    {(roomDetails || roomDetailsError) && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRoomDetails(null); setRoomDetailsError(''); } }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="room-details-title"><button className="dialog-close" aria-label="Close room details" onClick={() => { setRoomDetails(null); setRoomDetailsError(''); }}>×</button>{roomDetailsError ? <div className="feature-error" role="alert">{roomDetailsError}</div> : roomDetails && <><span className="eyebrow">{roomDetails.hostel.name}</span><h2 id="room-details-title">Room {roomDetails.room.identifier}</h2><p>{eligibilityLabel(roomDetails.room.genderEligibility)} · {roomDetails.room.occupancy} occupied · {roomDetails.room.availableBeds} available</p><h3>Current occupants</h3>{roomDetails.occupants.length ? <div className="history-list">{roomDetails.occupants.map((occupant, index) => <article key={`${occupant.name}-${index}`}><b>{occupant.name}</b>{user?.role !== 'TENANT' && <><span>{occupant.email} · {occupant.phone}</span><small>Moved in {occupant.moveInDate ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(occupant.moveInDate)) : '—'} · Agreed rent {money(occupant.currentRentPaise || 0)} · Deposit {money(occupant.securityDepositPaise || 0)}</small></>}</article>)}</div> : <p>No active occupants.</p>}</>}</section></div>}
    {hostelDialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHostelDialogOpen(false); }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-hostel-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => setHostelDialogOpen(false)}>×</button><span className="eyebrow">PROPERTY DETAILS</span><h2 id="edit-hostel-title">Edit {hostel.name}</h2><p>Policy changes are checked against all room configurations.</p><form onSubmit={hostelForm.handleSubmit(saveHostel)} className="stacked-form">
      <label>Property name<input {...hostelForm.register('name')} />{hostelForm.formState.errors.name && <small>{hostelForm.formState.errors.name.message}</small>}</label>
      <label>Street address<input {...hostelForm.register('address')} />{hostelForm.formState.errors.address && <small>{hostelForm.formState.errors.address.message}</small>}</label>
      <div className="form-columns"><label>City<input {...hostelForm.register('city')} /></label><label>Accommodation policy<select {...hostelForm.register('accommodationPolicy')}><option value="MIXED">Mixed</option><option value="MALE_ONLY">Male only</option><option value="FEMALE_ONLY">Female only</option></select></label></div>
      <label>Contact phone<input {...hostelForm.register('contactPhone')} /></label>
      <label>Facilities <span className="optional-label">Comma separated</span><input {...hostelForm.register('facilities')} placeholder="Wi-Fi, laundry, meals" /></label>
      <label>Description<textarea {...hostelForm.register('description')} rows="3" /></label>
      {user?.role === 'ADMIN' && <label>Assigned owner<select {...hostelForm.register('ownerId')} required><option value="">Choose an active owner</option>{hostel.ownerId?._id && !activeOwners.some((owner) => owner._id === hostel.ownerId._id) && <option value={hostel.ownerId._id}>{hostel.ownerId.name} · current owner (inactive)</option>}{activeOwners.map((owner) => <option key={owner._id} value={owner._id}>{owner.name} · {owner.email || owner.phone}</option>)}</select></label>}
      <label>Listing status<select {...hostelForm.register('isActive', { setValueAs: (value) => value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></label>
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setHostelDialogOpen(false)}>Cancel</button><button className="button button-primary" disabled={hostelForm.formState.isSubmitting || savingHostel}>{hostelForm.formState.isSubmitting || savingHostel ? 'Saving…' : 'Save property'}</button></div>
    </form></section></div>}
  </div>;
}
