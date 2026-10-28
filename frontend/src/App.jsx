import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import { useAuth } from './features/auth/AuthContext.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HostelsPage from './pages/HostelsPage.jsx';
import HostelDetailPage from './pages/HostelDetailPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import DepositsPage from './pages/DepositsPage.jsx';
import TenantsPage from './pages/TenantsPage.jsx';
import TenantProfilePage from './pages/TenantProfilePage.jsx';
import RequireAuth from './routes/RequireAuth.jsx';
import AdminOverviewPage from './pages/AdminOverviewPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AuditLogPage from './pages/AuditLogPage.jsx';

function RootRedirect() {
  const { user } = useAuth();
  return user ? user.role === 'ADMIN' ? <AdminOverviewPage /> : <DashboardPage /> : <Navigate to="/login" replace />;
}

export default function App() {
  return <Routes>
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
  </Routes>;
}
