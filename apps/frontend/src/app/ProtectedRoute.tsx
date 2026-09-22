import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { hasPermission, type Permission } from '@/lib/permissions';

interface Props {
  children: React.ReactNode;
  /**
   * Optional permission required to view this route. When set, an
   * authenticated user lacking the permission is redirected to /dashboard
   * with a toast — they keep their session but the page stays out of reach.
   *
   * Authoritative enforcement lives in the backend `PermissionsGuard`; this
   * is purely a UX layer to avoid showing forbidden screens.
   */
  permission?: Permission;
}

export function ProtectedRoute({ children, permission }: Props) {
  const isAuth = useAuthStore((s) => !!s.accessToken);
  const role = useAuthStore((s) => s.user?.role ?? null);
  const location = useLocation();

  const denied = isAuth && permission ? !hasPermission(role, permission) : false;

  useEffect(() => {
    if (denied) {
      toast.error('Accès refusé : permission insuffisante.');
    }
  }, [denied]);

  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (denied) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
