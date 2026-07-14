/**
 * Data resilience utilities for offline-first behavior and exponential backoff.
 * Runs silently in background — no UI impact.
 */

const CACHE_PREFIX = 'oculto_cache_';
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 2; // 2 hours

// ─── Offline Cache ───────────────────────────────────────────

export function cacheData(key: string, data: unknown): void {
  try {
    const payload = JSON.stringify({ data, ts: Date.now() });
    localStorage.setItem(CACHE_PREFIX + key, payload);
  } catch {
    // Storage full — silently skip
  }
}

export function getCachedData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > MAX_CACHE_AGE_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export function clearCache(key?: string): void {
  if (key) {
    localStorage.removeItem(CACHE_PREFIX + key);
    return;
  }
  // Clear all oculto cache entries
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
}

// ─── Exponential Backoff ─────────────────────────────────────

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 8000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries) break;

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      // Add jitter to prevent thundering herd
      const jitter = delay * 0.2 * Math.random();
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }

  throw lastError;
}

// ─── Resilient Supabase Query ────────────────────────────────

/**
 * Wraps a Supabase query with retry + offline cache fallback.
 * If all retries fail, returns cached data if available.
 */
export async function resilientQuery<T>(
  cacheKey: string,
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; fromCache: boolean; error?: string }> {
  try {
    const result = await withRetry(async () => {
      const { data, error } = await queryFn();
      if (error) throw error;
      return data;
    });

    // Cache successful result
    if (result) cacheData(cacheKey, result);

    return { data: result, fromCache: false };
  } catch (err) {
    // Fallback to cache
    const cached = getCachedData<T>(cacheKey);
    if (cached) {
      return {
        data: cached,
        fromCache: true,
        error: 'Usando dados em cache (offline)',
      };
    }

    return {
      data: null,
      fromCache: false,
      error: err instanceof Error ? err.message : 'Erro de conexão',
    };
  }
}
