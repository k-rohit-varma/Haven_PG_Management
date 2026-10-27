import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';

export default function RequireAuth({ roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><span className="loading-mark">h.</span><span>Getting your workspace ready…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
