/**
 * persistentQueryCache — Cache leve em localStorage para acelerar
 * carregamento inicial em mobile com CPU/RAM limitados.
 *
 * Uso típico com React Query:
 *   const cached = loadCache<MyType>('my-key');
 *   useQuery({
 *     queryKey: [...],
 *     queryFn: async () => { const data = ...; saveCache('my-key', data); return data; },
 *     initialData: cached?.data,
 *     initialDataUpdatedAt: cached?.updatedAt,
 *   });
 */

const PREFIX = 'oculto:cache:v1:';

export interface CachedEntry<T> {
  data: T;
  updatedAt: number;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadCache<T>(key: string, maxAgeMs = 24 * 60 * 60 * 1000): CachedEntry<T> | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry<T>;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    if (Date.now() - parsed.updatedAt > maxAgeMs) {
      ls.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Escrita assíncrona para não bloquear a thread principal em mobile fraco.
export function saveCache<T>(key: string, data: T): void {
  const ls = safeStorage();
  if (!ls) return;
  const payload: CachedEntry<T> = { data, updatedAt: Date.now() };
  const write = () => {
    try {
      ls.setItem(PREFIX + key, JSON.stringify(payload));
    } catch {
      // Storage cheio / modo privado — ignore silenciosamente.
      try { ls.removeItem(PREFIX + key); } catch { /* noop */ }
    }
  };
  const idle = (window as any).requestIdleCallback;
  if (typeof idle === 'function') {
    idle(write, { timeout: 1500 });
  } else {
    setTimeout(write, 0);
  }
}

export function clearCache(key: string): void {
  const ls = safeStorage();
  if (!ls) return;
  try { ls.removeItem(PREFIX + key); } catch { /* noop */ }
}
