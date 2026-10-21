import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../ui';
import { useAuth } from '../../hooks/useAuth';

/** Renders its children only when signed in; otherwise sends the visitor to /login and back after. */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner className="py-12" />;
  if (!session) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
};
