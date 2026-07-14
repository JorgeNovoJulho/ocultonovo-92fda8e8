import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { useAuth } from '@/hooks/useAuth';

interface PaymentRequiredGuardProps {
  children: ReactNode;
}

// Routes that are allowed even with overdue payment
const ALLOWED_ROUTES = [
  '/checkout',
  '/checkout/retry',
  '/settings',
  '/support',
  '/legal',
];

/**
 * Guard component that forces redirection to payment recovery page
 * when user has overdue or suspended payment status.
 * Does NOT redirect unauthenticated users — ProtectedRoute handles that.
 */
export function PaymentRequiredGuard({ children }: PaymentRequiredGuardProps) {
  const { shouldBlockAccess, isLoading } = usePaymentStatus();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if current route is allowed
  const isAllowedRoute = ALLOWED_ROUTES.some(route =>
    location.pathname.startsWith(route)
  );

  useEffect(() => {
    // Wait until auth and profile have resolved, and only redirect logged-in users
    if (!authLoading && !isLoading && user && shouldBlockAccess && !isAllowedRoute) {
      navigate('/checkout/retry', { replace: true });
    }
  }, [authLoading, isLoading, user, shouldBlockAccess, isAllowedRoute, navigate]);

  // While still loading, render nothing (ProtectedRoute spinner handles UX)
  if (authLoading || isLoading) {
    return <>{children}</>;
  }

  // If blocked and not on allowed route, show nothing while redirecting
  if (user && shouldBlockAccess && !isAllowedRoute) {
    return null;
  }

  return <>{children}</>;
}

