/**
 * Cliente Supabase EXTERNO — Oculto Swing
 *
 * Sempre usa o endpoint externo direto. O antigo proxy same-origin (`/sb-proxy`)
 * pode cair no fallback SPA do domínio publicado e devolver `index.html` para
 * chamadas REST/RPC, quebrando páginas públicas como `/play/p/:id`.
 */
import { createClient } from '@supabase/supabase-js';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { authDiagnostics } from '@/lib/authDiagnostics';
import { logger } from '@/lib/logger';

const SAME_ORIGIN_PROXY_PATH = '/sb-proxy';

const PREVIEW_HOST_SNIPPETS = ['id-preview--', 'lovable.app', 'lovableproject.com'];

const getHost = () => (typeof window !== 'undefined' ? window.location.hostname : '');
const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '');

const isLovablePreviewHost = () => {
  const host = getHost();
  return PREVIEW_HOST_SNIPPETS.some((snippet) => host.includes(snippet));
};

export const getSupabaseBrowserBaseUrl = () => {
  return EXTERNAL_SUPABASE_URL;
};

// Contador de falhas consecutivas no refresh do token de auth.
// Só limpa a sessão local após MUITAS falhas seguidas (cada uma já com
// retries internos). Isso evita logout em transiente 504/502/503.
let refreshFailureStreak = 0;
const REFRESH_FAILURE_THRESHOLD = 6;

const REFRESH_MAX_ATTEMPTS = 3;       // tentativas por chamada de refresh
const REFRESH_TIMEOUT_MS = 12000;     // timeout por tentativa
const REFRESH_BACKOFF_MS = [400, 1200, 2500];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const purgeLocalAuthSession = () => {
  if (typeof window === 'undefined') return;
  const removed: string[] = [];
  try {
    [localStorage, sessionStorage].forEach((storage) => {
      Object.keys(storage).forEach((key) => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          removed.push(key);
          storage.removeItem(key);
        }
      });
    });
    // eslint-disable-next-line no-console
    console.warn('[Oculto] Sessão local removida após falhas repetidas no refresh do token.', removed);
  } catch {
    /* ignore */
  }
  try {
    authDiagnostics.recordSessionPurge(removed);
  } catch { /* ignore */ }
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Mescla signals: se o caller já passou um signal, respeitamos ambos.
    const signal = init?.signal
      ? (() => {
          const merged = new AbortController();
          const abort = () => merged.abort();
          init!.signal!.addEventListener('abort', abort);
          ctrl.signal.addEventListener('abort', abort);
          return merged.signal;
        })()
      : ctrl.signal;
    return await fetch(input as any, { ...(init || {}), signal });
  } finally {
    clearTimeout(t);
  }
};

export const supabaseBrowserFetch: typeof fetch = async (input, init) => {
  let requestUrl = '';
  if (typeof window !== 'undefined') {
    requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const proxyPrefix = `${getOrigin()}${SAME_ORIGIN_PROXY_PATH}`;

    // Bypass defensivo: qualquer URL legada `/sb-proxy` vira endpoint externo,
    // inclusive no domínio publicado, para nunca receber HTML no lugar de JSON.
    if (requestUrl.startsWith(proxyPrefix)) {
      const rewritten = requestUrl.replace(proxyPrefix, EXTERNAL_SUPABASE_URL);
      input = rewritten;
      requestUrl = rewritten;
    }
  }

  const isRefreshCall =
    requestUrl.includes('/auth/v1/token') && requestUrl.includes('grant_type=refresh_token');

  if (!isRefreshCall) {
    return fetch(input as any, init);
  }

  // ---- Refresh com retry + timeout + fallback direto ao endpoint externo ----
  try { authDiagnostics.recordRefreshAttempt(); } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  logger.info('[AuthDiag] → refresh attempt', requestUrl);

  const proxyPrefix = typeof window !== 'undefined' ? `${getOrigin()}${SAME_ORIGIN_PROXY_PATH}` : '';
  const directUrl =
    proxyPrefix && requestUrl.startsWith(proxyPrefix)
      ? requestUrl.replace(proxyPrefix, EXTERNAL_SUPABASE_URL)
      : requestUrl;

  let lastErr: unknown = null;
  let lastResp: Response | null = null;

  for (let attempt = 0; attempt < REFRESH_MAX_ATTEMPTS; attempt++) {
    // Tentativa final: vai direto ao endpoint externo (bypass do proxy /sb-proxy)
    // para escapar de eventuais 504 da camada de rewrite.
    const useDirect = attempt === REFRESH_MAX_ATTEMPTS - 1 && directUrl !== requestUrl;
    const target: RequestInfo | URL = useDirect ? directUrl : (input as any);

    try {
      const response = await fetchWithTimeout(target, init, REFRESH_TIMEOUT_MS);
      try { authDiagnostics.recordRefreshResult(response.status); } catch { /* ignore */ }
      // eslint-disable-next-line no-console
      logger.info(`[AuthDiag] ← refresh response ${response.status}${useDirect ? ' (direct)' : ''} attempt=${attempt + 1}`);

      // Retryable: 502/503/504/408/429
      const retryable = [408, 429, 502, 503, 504].includes(response.status);
      if (!retryable) {
        if (response.ok || response.status === 400 || response.status === 401) {
          // Sucesso OU refresh token inválido (não adianta retry).
          refreshFailureStreak = response.ok ? 0 : refreshFailureStreak;
          return response;
        }
        // Outros statuses não-retryable: devolve direto.
        return response;
      }

      lastResp = response;
    } catch (err) {
      lastErr = err;
      try { authDiagnostics.recordRefreshError(err); } catch { /* ignore */ }
      // eslint-disable-next-line no-console
      console.warn(`[AuthDiag] ✕ refresh error attempt=${attempt + 1}`, err);
    }

    if (attempt < REFRESH_MAX_ATTEMPTS - 1) {
      await sleep(REFRESH_BACKOFF_MS[attempt] ?? 2500);
    }
  }

  // Esgotou retries — conta UMA falha de refresh.
  refreshFailureStreak += 1;
  if (refreshFailureStreak >= REFRESH_FAILURE_THRESHOLD) {
    refreshFailureStreak = 0;
    purgeLocalAuthSession();
  }

  if (lastResp) return lastResp;
  throw lastErr instanceof Error ? lastErr : new Error('refresh failed');
};

const CLIENT_URL = getSupabaseBrowserBaseUrl();
const REALTIME_URL = EXTERNAL_SUPABASE_URL.replace(/^http/i, 'ws') + '/realtime/v1';

export const EXTERNAL_URL = EXTERNAL_SUPABASE_URL;
export const EXTERNAL_ANON_KEY = EXTERNAL_SUPABASE_ANON_KEY;

if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  logger.info(`[Oculto] Auth base URL: ${CLIENT_URL}`);
}

export const supabase = createClient(CLIENT_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  realtime: {
    worker: true,
    heartbeatIntervalMs: 15000,
    reconnectAfterMs: (tries: number) => [500, 1000, 2000, 4000][Math.min(tries - 1, 3)] ?? 4000,
    params: {
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
      eventsPerSecond: 20,
    },
  },
  global: {
    fetch: supabaseBrowserFetch,
  },
});

/**
 * Cliente anônimo isolado para leituras públicas do feed/stories.
 *
 * Uso: fallback defensivo quando uma sessão autenticada fica sem GRANT/RLS após
 * hardening no banco externo. Ele NÃO persiste sessão, NÃO lê tokens do usuário
 * e deve ser usado somente em dados públicos já liberados para `anon`.
 */
export const supabasePublic = createClient(CLIENT_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'oculto-public-anon-client',
  },
  global: {
    fetch: supabaseBrowserFetch,
  },
});

if ((supabase as any)?.realtime) {
  try {
    (supabase as any).realtime.endPoint = `${REALTIME_URL}/websocket`;
    (supabase as any).realtime.httpEndpoint = EXTERNAL_SUPABASE_URL + '/realtime/v1';
  } catch {
    /* noop */
  }
}
