/**
 * Helper para validar se um usuário está REALMENTE online.
 * Considera online apenas se: is_online=true E last_seen nos últimos 2 minutos.
 *
 * Threshold de 2 min (era 5 min) — combinado com o heartbeat de 45s que só
 * dispara em aba visível, garante que background tabs / PWA dormindo somem
 * da lista em poucos minutos sem precisar marcar offline explicitamente.
 */
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos

export function isReallyOnline(user?: {
  is_online?: boolean | null;
  last_seen?: string | null;
  show_online_status?: boolean | null;
} | null): boolean {
  if (!user?.is_online) return false;
  if (user.show_online_status === false) return false;
  if (!user.last_seen) return false;
  const lastSeenMs = new Date(user.last_seen).getTime();
  if (isNaN(lastSeenMs)) return false;
  return Date.now() - lastSeenMs < ONLINE_THRESHOLD_MS;
}

export const ONLINE_THRESHOLD_SECONDS = ONLINE_THRESHOLD_MS / 1000;
