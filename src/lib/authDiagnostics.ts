/**
 * Diagnóstico de autenticação — registra tentativas e falhas no refresh
 * do token contra o backend externo (Supabase) para que possamos exibir
 * um relatório claro de quando o 504 ocorre.
 *
 * Tudo fica em memória + localStorage (chave OCULTO_AUTH_DIAG_KEY) para
 * sobreviver a reloads do preview Lovable.
 */

export type AuthEventType =
  | 'refresh_attempt'
  | 'refresh_ok'
  | 'refresh_fail'   // 502/503/504/timeout
  | 'refresh_error' // exception (network / abort)
  | 'session_purged'
  | 'auto_recovery';

export interface AuthEvent {
  type: AuthEventType;
  ts: number;          // epoch ms
  status?: number;     // HTTP status quando aplicável
  detail?: string;     // mensagem livre (motivo, token removido, etc.)
}

interface DiagState {
  events: AuthEvent[];
  lastRefreshAt: number | null;
  lastRefreshStatus: number | null;
  consecutiveRefreshFailures: number;
  refreshFailureCount: number;
  refreshSuccessCount: number;
  purgedTokens: string[];
  lastPurgeAt: number | null;
  lastRecoveryAt: number | null;
}

const STORAGE_KEY = 'oculto.authDiag.v1';
const MAX_EVENTS = 50;

type Listener = (state: DiagState) => void;

const listeners = new Set<Listener>();

const defaultState = (): DiagState => ({
  events: [],
  lastRefreshAt: null,
  lastRefreshStatus: null,
  consecutiveRefreshFailures: 0,
  refreshFailureCount: 0,
  refreshSuccessCount: 0,
  purgedTokens: [],
  lastPurgeAt: null,
  lastRecoveryAt: null,
});

const isBrowser = () => typeof window !== 'undefined';

const loadState = (): DiagState => {
  if (!isBrowser()) return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
};

let state: DiagState = loadState();

const persist = () => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
};

const notify = () => {
  listeners.forEach((l) => {
    try {
      l(state);
    } catch {
      /* ignore */
    }
  });
};

const pushEvent = (evt: AuthEvent) => {
  state.events = [evt, ...state.events].slice(0, MAX_EVENTS);
};

export const authDiagnostics = {
  getState(): DiagState {
    return state;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },

  recordRefreshAttempt() {
    pushEvent({ type: 'refresh_attempt', ts: Date.now() });
    persist();
    notify();
  },

  recordRefreshResult(status: number) {
    const ok = status >= 200 && status < 300;
    state.lastRefreshAt = Date.now();
    state.lastRefreshStatus = status;
    if (ok) {
      state.consecutiveRefreshFailures = 0;
      state.refreshSuccessCount += 1;
      pushEvent({ type: 'refresh_ok', ts: Date.now(), status });
    } else {
      state.consecutiveRefreshFailures += 1;
      state.refreshFailureCount += 1;
      pushEvent({
        type: 'refresh_fail',
        ts: Date.now(),
        status,
        detail: status === 504 ? 'Gateway Timeout no /auth/v1/token' : `HTTP ${status}`,
      });
    }
    persist();
    notify();
  },

  recordRefreshError(err: unknown) {
    state.consecutiveRefreshFailures += 1;
    state.refreshFailureCount += 1;
    state.lastRefreshAt = Date.now();
    state.lastRefreshStatus = 0;
    const detail =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'erro desconhecido';
    pushEvent({ type: 'refresh_error', ts: Date.now(), detail });
    persist();
    notify();
  },

  recordSessionPurge(removedKeys: string[]) {
    state.consecutiveRefreshFailures = 0;
    state.purgedTokens = [...removedKeys, ...state.purgedTokens].slice(0, 20);
    state.lastPurgeAt = Date.now();
    pushEvent({
      type: 'session_purged',
      ts: Date.now(),
      detail: removedKeys.length ? removedKeys.join(', ') : 'sem tokens locais',
    });
    persist();
    notify();
  },

  recordAutoRecovery(reason: string) {
    state.lastRecoveryAt = Date.now();
    pushEvent({ type: 'auto_recovery', ts: Date.now(), detail: reason });
    persist();
    notify();
  },

  reset() {
    state = defaultState();
    persist();
    notify();
  },
};
