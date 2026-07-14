/**
 * Cache local leve para acelerar o redirecionamento pós-login.
 * Guarda is_admin e flags do perfil por userId com TTL curto (10 min).
 * Evita re-chamadas de RPC `is_admin` e SELECT em `profiles` quando o
 * usuário acabou de logar há pouco tempo (ex.: refresh da página).
 */

const KEY_PREFIX = 'oculto:loginCache:v1:';
const TTL_MS = 10 * 60 * 1000; // 10 minutos

export interface LoginCacheEntry {
  isAdmin: boolean;
  isCreator: boolean;
  isVerified: boolean;
  savedAt: number;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLoginCache(userId: string): LoginCacheEntry | null {
  const s = safeStorage();
  if (!s || !userId) return null;
  try {
    const raw = s.getItem(KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoginCacheEntry;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      s.removeItem(KEY_PREFIX + userId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLoginCache(
  userId: string,
  entry: Omit<LoginCacheEntry, 'savedAt'>
): void {
  const s = safeStorage();
  if (!s || !userId) return;
  try {
    s.setItem(
      KEY_PREFIX + userId,
      JSON.stringify({ ...entry, savedAt: Date.now() } as LoginCacheEntry)
    );
  } catch {
    /* quota / private mode → silencioso */
  }
}

export function clearLoginCache(userId?: string): void {
  const s = safeStorage();
  if (!s) return;
  try {
    if (userId) {
      s.removeItem(KEY_PREFIX + userId);
      return;
    }
    Object.keys(s).forEach((k) => {
      if (k.startsWith(KEY_PREFIX)) s.removeItem(k);
    });
  } catch {
    /* ignore */
  }
}
