import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import { useAuth } from './features/auth/AuthContext.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HostelsPage from './pages/HostelsPage.jsx';
import HostelDetailPage from './pages/HostelDetailPage.jsx';
import ApplicationsPage from './pages/ApplicationsPage.jsx';
import StaysPage from './pages/StaysPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import RentChangesPage from './pages/RentChangesPage.jsx';
import DepositsPage from './pages/DepositsPage.jsx';
import RequireAuth from './routes/RequireAuth.jsx';
import AdminOverviewPage from './pages/AdminOverviewPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AuditLogPage from './pages/AuditLogPage.jsx';
import RoomChangesPage from './pages/RoomChangesPage.jsx';

function RootRedirect() {
  const { user } = useAuth();
  return user ? user.role === 'ADMIN' ? <AdminOverviewPage /> : <DashboardPage /> : <Navigate to="/login" replace />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<LoginPage register />} />
    <Route element={<RequireAuth />}><Route element={<AppLayout />}>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/hostels" element={<HostelsPage />} />
      <Route path="/hostels/:hostelId" element={<HostelDetailPage />} />
      <Route path="/residents" element={<StaysPage />} />
      <Route path="/stays" element={<StaysPage />} />
      <Route path="/applications" element={<ApplicationsPage />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/rent-changes" element={<RentChangesPage />} />
      <Route path="/room-changes" element={<RoomChangesPage />} />
      <Route path="/deposits" element={<DepositsPage />} />
      <Route element={<RequireAuth roles={['ADMIN']} />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/audit" element={<AuditLogPage />} />
      </Route>
    </Route></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
