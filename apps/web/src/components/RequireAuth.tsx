import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { Spinner } from './ui';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted">
        <Spinner className="h-4 w-4" /> Checking your session…
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
