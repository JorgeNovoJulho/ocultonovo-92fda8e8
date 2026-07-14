/**
 * authorScopeCache — persistência leve em sessionStorage para os escopos
 * de autor resolvidos (postAuthorResolver) e usernames canônicos.
 *
 * Objetivos:
 *  - Sobreviver a navegações dentro da mesma aba (evita refetch).
 *  - Servir como "stale-while-error" quando a rede falha: melhor devolver
 *    um valor antigo do que travar o feed ou cair em fallback básico.
 *  - Evitar o flicker do modal de username quando a query é abortada.
 *
 * É puramente client-side. Nunca contém dado sensível além do par
 * (authUserId → ids/username canônicos), todos já visíveis ao próprio
 * usuário logado.
 */

const SCOPE_KEY = 'oculto:authorScope:v1';
const USERNAME_KEY = 'oculto:resolvedUsername:v1';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 min — dados de identidade mudam raramente

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readAll<T extends Record<string, any>>(key: string): T {
  const s = safeStorage();
  if (!s) return {} as T;
  try {
    const raw = s.getItem(key);
    if (!raw) return {} as T;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}

function writeAll(key: string, value: Record<string, any>) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privado */
  }
}

/* ---------- Author Scope (postAuthorResolver) ---------- */

export interface CachedAuthorScopeEntry {
  storedAt: number;
  value: unknown; // ResolvedAuthorScope serializável
}

export function loadAuthorScope(cacheKey: string): unknown | null {
  const map = readAll<Record<string, CachedAuthorScopeEntry>>(SCOPE_KEY);
  const entry = map[cacheKey];
  if (!entry) return null;
  if (Date.now() - entry.storedAt > MAX_AGE_MS) return null;
  return entry.value;
}

/** Retorna mesmo se expirado — usado em modo "stale" quando a rede falha. */
export function loadAuthorScopeStale(cacheKey: string): unknown | null {
  const map = readAll<Record<string, CachedAuthorScopeEntry>>(SCOPE_KEY);
  return map[cacheKey]?.value ?? null;
}

export function saveAuthorScope(cacheKey: string, value: unknown) {
  const map = readAll<Record<string, CachedAuthorScopeEntry>>(SCOPE_KEY);
  map[cacheKey] = { storedAt: Date.now(), value };
  // Limita o tamanho — mantém só as 50 entradas mais recentes
  const keys = Object.keys(map);
  if (keys.length > 50) {
    const sorted = keys.sort((a, b) => (map[b].storedAt || 0) - (map[a].storedAt || 0));
    const trimmed: Record<string, CachedAuthorScopeEntry> = {};
    for (const k of sorted.slice(0, 50)) trimmed[k] = map[k];
    writeAll(SCOPE_KEY, trimmed);
    return;
  }
  writeAll(SCOPE_KEY, map);
}

export function clearAuthorScopeCache() {
  const s = safeStorage();
  if (!s) return;
  try { s.removeItem(SCOPE_KEY); } catch { /* */ }
}

/* ---------- Resolved Username (UsernameRequiredGate) ---------- */

interface CachedUsername {
  storedAt: number;
  username: string;
}

export function loadResolvedUsername(authUserId: string): string | null {
  if (!authUserId) return null;
  const map = readAll<Record<string, CachedUsername>>(USERNAME_KEY);
  const entry = map[authUserId];
  if (!entry) return null;
  if (Date.now() - entry.storedAt > MAX_AGE_MS) return null;
  return entry.username || null;
}

export function saveResolvedUsername(authUserId: string, username: string) {
  if (!authUserId || !username) return;
  const map = readAll<Record<string, CachedUsername>>(USERNAME_KEY);
  map[authUserId] = { storedAt: Date.now(), username: username.trim().toLowerCase() };
  writeAll(USERNAME_KEY, map);
}

export function clearResolvedUsername(authUserId?: string) {
  const s = safeStorage();
  if (!s) return;
  if (!authUserId) { try { s.removeItem(USERNAME_KEY); } catch { /* */ } return; }
  const map = readAll<Record<string, CachedUsername>>(USERNAME_KEY);
  delete map[authUserId];
  writeAll(USERNAME_KEY, map);
}

/* ---------- Network State (offline / timeout) ---------- */

export type NetworkState = 'online' | 'offline' | 'degraded';

let lastFailureAt = 0;
const FAILURE_COOLDOWN_MS = 15_000;

export function markNetworkFailure() {
  lastFailureAt = Date.now();
}

export function getNetworkState(): NetworkState {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (lastFailureAt && Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) return 'degraded';
  return 'online';
}

export function isAbortLikeError(err: any): boolean {
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  return (
    name === 'AbortError' ||
    /aborted|signal is aborted|timeout|network|failed to fetch|load failed/i.test(msg)
  );
}

/** Promise.race com timeout — rejeita se demorar demais. */
export function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
