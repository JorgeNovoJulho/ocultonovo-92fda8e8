import { ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyRoles, UserRole } from "@/hooks/useUserRoles";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";

const MASTER_EMAIL = 'oculto_master@gmail.com';
const ROLES_TIMEOUT_MS = 6000;

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

/** Fire-and-forget: logs unauthorized access silently */
function logUnauthorizedAccess(userId: string, email: string) {
  (supabase as any)
    .from('audit_logs')
    .insert({
      admin_id: userId,
      action: 'UNAUTHORIZED_ADMIN_ACCESS',
      action_type: 'UNAUTHORIZED_ADMIN_ACCESS',
      target_resource: '/admin-dashboard',
      details: { email, timestamp: new Date().toISOString() },
      user_agent: navigator.userAgent,
    })
    .then(() => {})
    .catch(() => {});
}

interface AdminProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

/**
 * Default = SOMENTE admin_master (least privilege).
 * Para liberar moderator/admin_regional, passe `allowedRoles` explicitamente
 * (ex.: na rota wrapper do AdminLayout que precisa abrir o painel inteiro).
 */
export function AdminProtectedRoute({ 
  children, 
  allowedRoles = ['admin_master'] 
}: AdminProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const loggedRef = useRef(false);

  // Instant bypass for master admin — case-insensitive
  const isMasterEmail = normalizeEmail(user?.email) === MASTER_EMAIL;

  // Hooks MUST run unconditionally (Rules of Hooks). Roles fetch is gated via `enabled`.
  const { data: userRoles, isLoading: rolesLoading, error: rolesError } = useMyRoles();

  // Timeout de segurança: se a checagem de roles passar de ROLES_TIMEOUT_MS
  // sem resolver (mobile/rede flaky), tratamos como SEM acesso e mandamos
  // pro /feed em vez de manter o usuário preso num spinner indefinido.
  const [rolesTimedOut, setRolesTimedOut] = useState(false);
  useEffect(() => {
    if (!rolesLoading) { setRolesTimedOut(false); return; }
    const t = window.setTimeout(() => setRolesTimedOut(true), ROLES_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [rolesLoading]);

  useEffect(() => {
    if (rolesError && !isMasterEmail) {
      console.error('[AdminRoute] Role check failed:', rolesError);
      toast({
        title: "Acesso negado",
        description: "Sem permissão para acessar esta área.",
        variant: "destructive",
      });
    }
  }, [rolesError, isMasterEmail]);

  // Master bypasses everything as soon as auth is resolved
  if (!authLoading && isMasterEmail) {
    return <>{children}</>;
  }

  const hasAccess = userRoles?.some(role => allowedRoles.includes(role)) ?? false;
  const isLoading = authLoading || (rolesLoading && !rolesTimedOut);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasAccess || rolesError) {
    if (!loggedRef.current && user) {
      loggedRef.current = true;
      logUnauthorizedAccess(user.id, user.email || 'unknown');
    }
    return <Navigate to="/feed" replace />;
  }

  return <>{children}</>;
}

// HOC version for wrapping components
export function withAdminProtection<P extends object>(
  Component: React.ComponentType<P>,
  allowedRoles?: UserRole[]
) {
  return function ProtectedComponent(props: P) {
    return (
      <AdminProtectedRoute allowedRoles={allowedRoles}>
        <Component {...props} />
      </AdminProtectedRoute>
    );
  };
}
