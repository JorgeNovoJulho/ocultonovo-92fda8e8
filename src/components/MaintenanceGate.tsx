/**
 * MaintenanceGate — wrapper global.
 * Se manutenção ativa e usuário não é Admin Master, força signOut() uma vez por
 * versão (guard via sessionStorage) e exibe MaintenancePage — exceto em rotas
 * sempre permitidas (auth, legal, manutenção).
 * NÃO faz localStorage.clear() — preserva preferências, LGPD, tema e PWA.
 */
import { ReactNode, useEffect, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useMaintenanceGate } from '@/hooks/useMaintenanceGate';
import { supabase } from '@/lib/supabaseExternal';

const MaintenancePage = lazy(() => import('@/pages/MaintenancePage'));

const ALWAYS_ALLOWED_PREFIXES = [
  '/manutencao',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/legal',
  // Links públicos de compartilhamento — NUNCA podem ser interrompidos
  // por gate de manutenção (nem signOut, nem MaintenancePage). O player
  // tem que rodar para visitantes mesmo durante uma janela de manutenção.
  '/play/p',
  '/play/share',
  '/c',
];

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { maintenanceOn, allowed, ready, forceLogoutVersion } = useMaintenanceGate();
  const location = useLocation();
  const isAllowedPath = ALWAYS_ALLOWED_PREFIXES.some((p) =>
    location.pathname === p || location.pathname.startsWith(p + '/'),
  );

  useEffect(() => {
    // Aguarda auth+master resolverem antes de forçar logout. Sem `ready`,
    // qualquer login normal era deslogado durante os ~150ms em que `isMaster`
    // estava `undefined`, causando o flash "manutenção → login → manutenção".
    if (!ready || !maintenanceOn || allowed) return;
    try {
      const key = 'oculto_forced_logout_v';
      const current = String(forceLogoutVersion);
      if (sessionStorage.getItem(key) !== current) {
        sessionStorage.setItem(key, current);
        supabase.auth.signOut().catch(() => {});
      }
    } catch { /* sessionStorage indisponível: ignorar */ }
  }, [ready, maintenanceOn, allowed, forceLogoutVersion]);

  // Enquanto não sabemos se o usuário é master, NÃO renderiza a página de
  // manutenção — evita a piscada antes da query de papéis resolver.
  if (ready && maintenanceOn && !allowed && !isAllowedPath) {
    return (
      <Suspense fallback={null}>
        <MaintenancePage />
      </Suspense>
    );
  }

  return <>{children}</>;
}

export default MaintenanceGate;
