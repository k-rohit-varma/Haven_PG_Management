import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import { useAuth } from './features/auth/AuthContext.jsx';
import RequireAuth from './routes/RequireAuth.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const HostelsPage = lazy(() => import('./pages/HostelsPage.jsx'));
const HostelDetailPage = lazy(() => import('./pages/HostelDetailPage.jsx'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage.jsx'));
const DepositsPage = lazy(() => import('./pages/DepositsPage.jsx'));
const TenantsPage = lazy(() => import('./pages/TenantsPage.jsx'));
const TenantProfilePage = lazy(() => import('./pages/TenantProfilePage.jsx'));
const AdminOverviewPage = lazy(() => import('./pages/AdminOverviewPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage.jsx'));

function RootRedirect() {
  const { user } = useAuth();
  return user ? user.role === 'ADMIN' ? <AdminOverviewPage /> : <DashboardPage /> : <Navigate to="/login" replace />;
}

export default function App() {
  return <Suspense fallback={<div className="loading-screen" role="status" aria-live="polite"><span className="loading-mark">haven.</span><span>Loading page…</span></div>}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth roles={['ADMIN', 'OWNER']} />}><Route element={<AppLayout />}>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/hostels" element={<HostelsPage />} />
      <Route path="/hostels/:hostelId" element={<HostelDetailPage />} />
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="/tenants/:tenantId" element={<TenantProfilePage />} />
      <Route path="/residents" element={<Navigate to="/tenants" replace />} />
      <Route path="/stays" element={<Navigate to="/tenants" replace />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/deposits" element={<DepositsPage />} />
      <Route element={<RequireAuth roles={['ADMIN']} />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/audit" element={<AuditLogPage />} />
      </Route>
    </Route></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;
}
