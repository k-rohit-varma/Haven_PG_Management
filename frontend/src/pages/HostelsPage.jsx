import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, MapPin, Plus, Search, Users } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createHostelFormDefaults, hostelFormSchema, toCreateHostelPayload } from '../features/properties/hostelForm.js';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import Pagination from '../components/common/Pagination.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

export default function HostelsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim().length >= 2 ? searchInput.trim() : '');
  const requestSequence = useRef(0);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const canManage = user?.role === 'ADMIN';
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(hostelFormSchema), defaultValues: createHostelFormDefaults() });

  const load = useCallback(async (requestedPage = page) => {
    setLoading(true);
    setError('');
    const sequence = ++requestSequence.current;
    try {
      const { data } = await api.get('/hostels', { params: { page: requestedPage, limit: pageSize, ...(search ? { search } : {}) } });
      if (sequence !== requestSequence.current) return;
      setItems(data.data.items);
      setPagination(data.data.pagination);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [page, pageSize, search]);

  useEffect(() => { setSearch(debouncedSearch); setPage(1); }, [debouncedSearch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (user?.role === 'ADMIN') api.get('/admin/users', { params: { role: 'OWNER', isActive: true, limit: 100 } }).then(({ data }) => setOwners(data.data.items)).catch(() => setOwners([])); }, [user?.role]);

  async function create(values) {
    setFormError('');
    try {
      await api.post('/hostels', toCreateHostelPayload(values));
      setDialogOpen(false);
      reset(createHostelFormDefaults());
      setPage(1);
      await load(1);
      showToast('Property created. Add rooms to configure its beds.');
    } catch (requestError) { const message = getErrorMessage(requestError); setFormError(message); showToast(message, 'error'); }
  }

  return <div className="feature-page">
    <div className="feature-heading"><div><span className="eyebrow">PROPERTY MANAGEMENT</span><h1>{user?.role === 'TENANT' ? 'Find your next stay' : user?.role === 'ADMIN' ? 'All properties' : 'My properties'}</h1><p>{user?.role === 'TENANT' ? 'Explore properties with beds currently available.' : user?.role === 'ADMIN' ? 'Manage property inventory and owner assignments.' : 'Properties assigned to your account.'}</p></div>{canManage && <button className="button button-primary" onClick={() => { setFormError(''); setDialogOpen(true); }}><Plus size={16} />Add property</button>}</div>
    <div className="feature-toolbar"><form className="search-box" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}><Search size={16} /><input aria-label="Search properties" placeholder="Search by name, city, or address" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><button>Search</button></form><span className="result-count">{pagination.total ?? 0} {pagination.total === 1 ? 'property' : 'properties'}</span></div>
    {error && <div className="feature-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {loading ? <div className="feature-loading">Loading properties…</div> : items.length ? <div className="hostel-grid">{items.map((hostel) => <article className="hostel-card" key={hostel._id}><div className="hostel-art"><span><Building2 size={24} /></span><small>{hostel.accommodationPolicy.replace('_', ' ')}</small></div><div className="hostel-card-body"><div className="hostel-city"><MapPin size={13} />{hostel.city}</div><h2>{hostel.name}</h2><p>{hostel.address}</p>{hostel.description && <p className="hostel-description">{hostel.description}</p>}<div className="hostel-card-footer"><span><Users size={14} />{hostel.availableBeds} beds available</span><Link to={`/hostels/${hostel._id}`} aria-label={`View ${hostel.name}`}><ArrowRight size={17} /></Link></div></div></article>)}</div> : !error && <div className="feature-empty"><span className="empty-icon"><Building2 size={20} /></span><h2>{user?.role === 'TENANT' ? 'No available properties found' : user?.role === 'ADMIN' ? 'No properties yet' : 'No properties assigned'}</h2><p>{user?.role === 'TENANT' ? 'Try another search later, or contact the property owner directly.' : user?.role === 'ADMIN' ? 'Create a property and assign it to an owner to set up inventory.' : 'An administrator must assign a property to your account before it appears here.'}</p>{canManage && <button className="button button-primary" onClick={() => { setFormError(''); setDialogOpen(true); }}><Plus size={16} />Create a property</button>}</div>}
    {!loading && <Pagination page={page} pages={pagination.pages || 1} total={pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />}
    {dialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setDialogOpen(false); setFormError(''); } }}><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="create-hostel-title"><button className="dialog-close" aria-label="Close dialog" onClick={() => { setDialogOpen(false); setFormError(''); }}>×</button><span className="eyebrow">NEW PROPERTY</span><h2 id="create-hostel-title">Add a hostel</h2><p>Set up the public details tenants will see.</p><form onSubmit={handleSubmit(create)} className="stacked-form" noValidate>
      <label>Property name<input {...register('name')} placeholder="e.g. Maple Residency" />{errors.name && <small>{errors.name.message}</small>}</label>
      {user?.role === 'ADMIN' && <label>Assigned owner<select {...register('ownerId')} required><option value="">Choose an active owner</option>{owners.map((owner) => <option key={owner._id} value={owner._id}>{owner.name} · {owner.email || owner.phone}</option>)}</select>{errors.ownerId && <small>{errors.ownerId.message}</small>}</label>}
      <label>Street address<input {...register('address')} placeholder="Street, area, landmark" />{errors.address && <small>{errors.address.message}</small>}</label>
      <div className="form-columns"><label>City<input {...register('city')} placeholder="Pune" />{errors.city && <small>{errors.city.message}</small>}</label><label>Accommodation policy<select {...register('accommodationPolicy')}><option value="MIXED">Mixed</option><option value="MALE_ONLY">Male only</option><option value="FEMALE_ONLY">Female only</option></select></label></div>
      <label>Contact phone <span className="optional-label">Optional</span><input {...register('contactPhone')} placeholder="+91 98765 43210" />{errors.contactPhone && <small>{errors.contactPhone.message}</small>}</label>
      <label>Facilities <span className="optional-label">Comma separated</span><input {...register('facilities')} placeholder="Wi-Fi, laundry, meals" />{errors.facilities && <small>{errors.facilities.message}</small>}</label>
      <label>Description <span className="optional-label">Optional</span><textarea {...register('description')} rows="3" placeholder="A short introduction for prospective residents" />{errors.description && <small>{errors.description.message}</small>}</label>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => { setDialogOpen(false); setFormError(''); }}>Cancel</button><button disabled={isSubmitting} className="button button-primary">{isSubmitting ? 'Creating…' : 'Create property'}</button></div>
    </form></section></div>}
  </div>;
}
