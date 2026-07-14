/**
 * Persistência local do "ocultar onboarding por 30 dias".
 * Usa localStorage com timestamp (hideUntil em ms) para sobreviver a reloads
 * e reaparecer automaticamente após o vencimento — sem limpar dados manualmente.
 *
 * Chave por usuário (quando disponível) para isolar entre contas no mesmo device.
 */

const REMIND_DAYS = 30;
export const REMIND_MS = REMIND_DAYS * 24 * 60 * 60 * 1000;

const BASE_KEY = 'oculto_onboarding_hide_until';

function keyFor(userId?: string | null) {
  return userId ? `${BASE_KEY}:${userId}` : BASE_KEY;
}

/** Retorna o timestamp (ms) até quando o modal deve ficar oculto, ou 0 se expirado/ausente. */
export function getLocalHideUntil(userId?: string | null): number {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return 0;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) {
      localStorage.removeItem(keyFor(userId));
      return 0;
    }
    if (ts <= Date.now()) {
      // Expirou → limpa automaticamente para reaparecer na próxima abertura
      localStorage.removeItem(keyFor(userId));
      return 0;
    }
    return ts;
  } catch {
    return 0;
  }
}

export function isLocallyHidden(userId?: string | null): boolean {
  return getLocalHideUntil(userId) > Date.now();
}

export function setLocalHideForThirtyDays(userId?: string | null): number {
  const until = Date.now() + REMIND_MS;
  try {
    localStorage.setItem(keyFor(userId), String(until));
  } catch {
    /* quota — silent */
  }
  return until;
}

export function clearLocalHide(userId?: string | null) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
