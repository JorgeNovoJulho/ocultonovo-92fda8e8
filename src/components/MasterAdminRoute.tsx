import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

/**
 * Restringe acesso à rota apenas para o Master Admin (ocultomaster).
 * Mostra tela de "Acesso restrito" antes de redirecionar.
 */
const MASTER_CHECK_TIMEOUT_MS = 6000;

export function MasterAdminRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: isMaster, isLoading } = useIsMasterAdmin();
  const [countdown, setCountdown] = useState(4);

  // Fail-closed timeout: redes instáveis NUNCA podem prender o usuário
  // numa tela de spinner para uma rota master. Após o timeout tratamos
  // como NEGADO (default-deny) e seguimos o fluxo de redirecionamento.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) { setTimedOut(false); return; }
    const t = window.setTimeout(() => setTimedOut(true), MASTER_CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  const resolved = !authLoading && (!isLoading || timedOut);
  const denied = resolved && !!user && isMaster !== true;

  useEffect(() => {
    if (!denied) return;
    const tick = window.setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    const t = window.setTimeout(() => navigate('/', { replace: true }), 4000);
    return () => { window.clearInterval(tick); window.clearTimeout(t); };
  }, [denied, navigate]);

  if (authLoading || (isLoading && !timedOut)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (denied) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-destructive/15">
            <ShieldAlert className="h-7 w-7 text-destructive" aria-hidden />
          </div>
          <h1 className="text-lg font-bold text-foreground">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta área é exclusiva do <strong>Administrador Master</strong>. Sua conta não tem
            permissão para acessá-la.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Você será redirecionado em <span className="font-bold text-foreground">{countdown}s</span>…
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
            <Button size="sm" onClick={() => navigate('/', { replace: true })}>Ir para o início</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default MasterAdminRoute;
