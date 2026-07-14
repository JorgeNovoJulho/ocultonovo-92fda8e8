/**
 * realtimeBus — multiplexador global de canais Realtime por tabela.
 *
 * Mantém UM canal por tabela; vários hooks compartilham o mesmo websocket.
 *
 * Robustez (corrige feed que parava de atualizar em tempo real):
 *  - Loga status de subscribe (SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED).
 *  - Auto-resubscribe com backoff em CHANNEL_ERROR/TIMED_OUT/CLOSED.
 *  - Re-subscribe ao voltar a aba (visibilitychange) e ao reconectar (online).
 *  - Re-subscribe quando a sessão de auth muda (token novo → RLS válido no
 *    canal). Sem isso, canais abertos antes do login continuam sem receber
 *    eventos de tabelas com RLS (caso do `posts`).
 */
import { supabase } from '@/lib/supabaseExternal';

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*';
type Handler = (payload: any) => void;

interface Entry {
  handlers: Map<symbol, { events: Set<Event>; handler: Handler }>;
  channel: any;
  retries: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, Entry>();
let globalListenersInstalled = false;

function backoffMs(attempt: number) {
  return [400, 800, 1600, 3000, 5000][Math.min(attempt, 4)] ?? 5000;
}

function disposeChannel(entry: Entry) {
  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }
  if (entry.channel) {
    try { (supabase as any).removeChannel(entry.channel); } catch { /* noop */ }
    entry.channel = null;
  }
}

function attachChannel(table: string, entry: Entry) {
  disposeChannel(entry);

  const channel = (supabase as any)
    .channel(`bus:${table}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload: any) => {
        const evt = payload?.eventType as Event;
        for (const { events, handler } of entry.handlers.values()) {
          if (events.has('*') || events.has(evt)) {
            try { handler(payload); } catch { /* noop */ }
          }
        }
      },
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        entry.retries = 0;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // só reagenda se ainda houver handlers ativos
        if (entry.handlers.size === 0) return;
        if (entry.retryTimer) return;
        const wait = backoffMs(entry.retries++);
        entry.retryTimer = setTimeout(() => {
          entry.retryTimer = null;
          attachChannel(table, entry);
        }, wait);
      }
    });

  entry.channel = channel;
}

function ensureEntry(table: string): Entry {
  const existing = registry.get(table);
  if (existing) return existing;
  const entry: Entry = { handlers: new Map(), channel: null, retries: 0, retryTimer: null };
  registry.set(table, entry);
  attachChannel(table, entry);
  return entry;
}

/**
 * Reconecta APENAS canais sem socket ativo (ou em backoff).
 * Antes: reagia em todos os canais a cada visibilitychange/focus/token refresh,
 * o que reiniciava o realtime várias vezes por minuto em mobile e fazia o
 * feed/chat "piscarem". Agora só age quando realmente perdeu a conexão.
 */
function reconnectStale() {
  for (const [table, entry] of registry.entries()) {
    if (entry.handlers.size === 0) continue;
    const state = (entry.channel as any)?.state;
    const isHealthy = state === 'joined' || state === 'joining';
    if (isHealthy) continue;
    entry.retries = 0;
    attachChannel(table, entry);
  }
}

// Throttle defensivo: nunca reconecta mais de 1x a cada 4s.
let lastReconnectAt = 0;
function reconnectStaleThrottled() {
  const now = Date.now();
  if (now - lastReconnectAt < 4000) return;
  lastReconnectAt = now;
  reconnectStale();
}

function installGlobalListeners() {
  if (globalListenersInstalled) return;
  if (typeof window === 'undefined') return;
  globalListenersInstalled = true;

  const onVisible = () => {
    if (document.visibilityState === 'visible') reconnectStaleThrottled();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', reconnectStaleThrottled);
  // NOTA: 'focus' do window NÃO entra mais como gatilho — em mobile dispara
  // em quase todo toque/scroll e causava re-subscribe em cascata.

  // Auth: só recria canais quando a identidade efetivamente muda
  // (SIGNED_IN / SIGNED_OUT / USER_UPDATED). TOKEN_REFRESHED não invalida
  // RLS dos canais já abertos — reconectar nesse evento causa piscadas a
  // cada ~50 minutos sem motivo real.
  try {
    (supabase as any).auth?.onAuthStateChange?.((evt: string) => {
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') {
        // Identidade nova → força resubscribe completo (RLS muda).
        for (const [table, entry] of registry.entries()) {
          if (entry.handlers.size === 0) continue;
          entry.retries = 0;
          attachChannel(table, entry);
        }
      }
    });
  } catch { /* noop */ }
}

export interface SubscribeOpts {
  events?: Event[]; // default: ['*']
}

/**
 * Inscreve um handler na tabela. Retorna função de cleanup.
 */
export function subscribeTable(
  table: string,
  handler: Handler,
  opts: SubscribeOpts = {},
): () => void {
  installGlobalListeners();
  const entry = ensureEntry(table);
  const key = Symbol('handler');
  entry.handlers.set(key, {
    events: new Set(opts.events ?? ['*']),
    handler,
  });
  return () => {
    entry.handlers.delete(key);
    if (entry.handlers.size === 0) {
      disposeChannel(entry);
      registry.delete(table);
    }
  };
}
