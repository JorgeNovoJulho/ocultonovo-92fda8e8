import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { realtimeChannel } from '@/lib/realtimeChannels';
import { notifyEnterRoomMissionCompleted } from '@/lib/retentionMissionEvents';

export interface RoomMessage {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  plan_type: string | null;
  is_verified: boolean | null;
  profile_type?: string | null;
  gender?: string | null;
  mentions?: string[] | null;
  reply_to_id?: string | null;
  reply_to_body?: string | null;
  reply_to_user?: string | null;
  like_count?: number;
  dislike_count?: number;
  my_reaction?: 'like' | 'dislike' | null;
  /** Marca mensagens otimistas inseridas localmente antes da confirmação do servidor. */
  pending?: boolean;
  /** Marca mensagens otimistas que falharam ao confirmar (RPC retornou erro). */
  failed?: boolean;
  /** Edição local (mock) — sobrescreve body original no UI. */
  edited?: boolean;
  /** Apagada localmente — UI esconde, mas mantemos o id para sync. */
  deleted?: boolean;
  /** Reações emoji por mensagem (mock, mantido em localStorage). */
  emoji_reactions?: Record<string, { count: number; mine: boolean }>;
}

// Overlay local (edits/deletes/reações emoji mock) por sala — sobrevive a reload.
const OVERLAY_KEY = (slug: string) => `aura-room-chat:overlay:${slug}`;
interface MsgOverlay {
  edits?: Record<string, string>;
  deletes?: Record<string, true>;
  emojis?: Record<string, Record<string, { count: number; mine: boolean }>>;
}
function loadOverlay(slug: string): MsgOverlay {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(OVERLAY_KEY(slug)) || '{}') || {}; } catch { return {}; }
}
function saveOverlay(slug: string, ov: MsgOverlay) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(OVERLAY_KEY(slug), JSON.stringify(ov)); } catch {}
}
function applyOverlay(slug: string, list: RoomMessage[]): RoomMessage[] {
  const ov = loadOverlay(slug);
  if (!ov.edits && !ov.deletes && !ov.emojis) return list;
  const out: RoomMessage[] = [];
  for (const m of list) {
    if (ov.deletes?.[m.id]) continue; // pula apagadas
    let next = m;
    if (ov.edits?.[m.id] && ov.edits[m.id] !== m.body) {
      next = { ...next, body: ov.edits[m.id], edited: true };
    }
    if (ov.emojis?.[m.id]) {
      next = { ...next, emoji_reactions: ov.emojis[m.id] };
    }
    out.push(next);
  }
  return out;
}

// Persistência local do histórico por sala (mantém ordem ao reabrir o navegador).
const MSGS_KEY = (slug: string) => `aura-room-chat:msgs:${slug}`;
const PERSIST_MAX = 80;

function loadPersistedMessages(slug: string): RoomMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MSGS_KEY(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Descarta SEMPRE mensagens otimistas (pending/failed/temp-*) ao reidratar.
    // Em uma nova sessão não temos como reconciliar com o servidor sem causar
    // mensagens fantasmas de "enviando…/falhou" que nunca somem. Se a mensagem
    // chegou ao servidor, ela voltará pela RPC recente; se não chegou, o
    // usuário pode redigitar — muito melhor do que fila/pending eterno.
    return parsed.filter((m: any) => {
      if (!m?.id || !m?.body) return false;
      if (m.pending || m.failed) return false;
      if (typeof m.id === 'string' && m.id.startsWith('temp-')) return false;
      return true;
    });
  } catch { return []; }
}

function persistMessages(slug: string, list: RoomMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    const slim = list.slice(-PERSIST_MAX);
    localStorage.setItem(MSGS_KEY(slug), JSON.stringify(slim));
  } catch {}
}

const PAGE_SIZE = 30;
const MAX_KEEP = 200;

export type RoomPresence = 'idle' | 'reconnecting' | 'present';

export interface OutboxItem {
  id: string; // local id
  body: string;
  replyTo: string | null;
  mentions: string[];
  attempts: number;
  createdAt: number;
}

export function useAuraRoomChat(slug: string | null, opts?: { forcePresent?: boolean }) {
  const forcePresent = !!opts?.forcePresent;
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [presenceRaw, setPresence] = useState<RoomPresence>('idle');
  // Quando o pai indicou que o usuário entrou na sala (RPC já validou requisitos),
  // expomos sempre 'present' para a UI/lógica de envio, ignorando flutuações idle/reconnecting.
  const presence: RoomPresence = forcePresent ? 'present' : presenceRaw;
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const dedupeBodiesRef = useRef<Map<string, number>>(new Map()); // body -> timestamp, evita duplicatas em reconexão
  const hydrateTimerRef = useRef<number | null>(null);
  const presencePromiseRef = useRef<Promise<boolean> | null>(null);
  const outboxRef = useRef<OutboxItem[]>([]);
  const flushingRef = useRef(false);
  // Protege loadOlder contra chamadas concorrentes / repetidas no topo
  const loadOlderLockRef = useRef<{ slug: string | null; at: number; inflight: boolean }>({
    slug: null, at: 0, inflight: false,
  });

  // Mantém ref sincronizada com o estado para uso em closures
  useEffect(() => { outboxRef.current = outbox; }, [outbox]);

  // Hidrata do localStorage assim que o slug é conhecido (mensagens aparecem instantaneamente
  // ao reabrir o navegador, na ordem correta), antes mesmo da resposta da RPC.
  useEffect(() => {
    if (!slug) return;
    const cached = loadPersistedMessages(slug);
    if (cached.length > 0) {
      seenRef.current = new Set(cached.filter((m) => !m.id.startsWith('temp-')).map((m) => m.id));
      setMessages(cached);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Persiste mensagens (debounced) para sobreviver a reload/close.
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!slug) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistMessages(slug, messages);
      persistTimerRef.current = null;
    }, 250);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [messages, slug]);


  /** Tenta garantir presença na sala (idempotente do lado do servidor). */
  const ensurePresence = useCallback(async () => {
    if (!slug || !forcePresent) {
      setPresence('idle');
      return false;
    }
    if (presencePromiseRef.current) return presencePromiseRef.current;
    setPresence((p) => (p === 'present' ? p : 'reconnecting'));
    presencePromiseRef.current = (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('aura_room_join', { p_slug: slug });
        if (error) throw error;
        if ((data as any)?.queued) {
          setPresence('idle');
          return false;
        }
        if ((data as any)?.allowed === false && !(data as any)?.open && !(data as any)?.master) {
          setPresence('idle');
          return false;
        }
        setPresence('present');
        void notifyEnterRoomMissionCompleted();
        return true;
      } catch {
        setPresence('idle');
        return false;
      } finally {
        presencePromiseRef.current = null;
      }
    })();
    return presencePromiseRef.current;
  }, [forcePresent, slug]);

  const loadRecent = useCallback(async (slugArg: string) => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('aura_room_recent_messages', {
      p_slug: slugArg,
      p_limit: PAGE_SIZE,
    });
    setLoading(false);
    if (error || !data) return;
    const rows = (data as RoomMessage[]).slice().reverse();
    seenRef.current = new Set(rows.map((r) => r.id));
    // Reconcilia mensagens otimistas: mantém apenas temps cujo body ainda não chegou do servidor.
    setMessages((prev) => {
      const serverBodies = new Set(rows.map((r) => `${r.user_id}::${r.body}`));
      const lingeringTemps = prev.filter((m) =>
        m.id.startsWith('temp-') && !serverBodies.has(`${m.user_id}::${m.body}`)
      );
      return [...rows, ...lingeringTemps].slice(-MAX_KEEP);
    });
    setHasMore(rows.length >= PAGE_SIZE);
  }, []);

  /**
   * Carrega mensagens mais antigas (paginação ascendente).
   * Funciona client-side: pede mais e filtra pelos ids já vistos.
   */
  const loadOlder = useCallback(async () => {
    if (!slug) return;
    const lock = loadOlderLockRef.current;
    // Throttle: 800ms entre chamadas para o mesmo slug, e impede concorrência
    if (lock.inflight) return;
    if (lock.slug === slug && Date.now() - lock.at < 800) return;
    if (!hasMore) return;
    loadOlderLockRef.current = { slug, at: Date.now(), inflight: true };
    setLoadingOlder(true);
    try {
      const currentSize = seenRef.current.size;
      const targetLimit = Math.min(currentSize + PAGE_SIZE, 240);
      const { data, error } = await (supabase as any).rpc('aura_room_recent_messages', {
        p_slug: slug,
        p_limit: targetLimit,
      });
      if (error || !data) { setHasMore(false); return; }
      const rows = (data as RoomMessage[]).slice().reverse();
      const fresh = rows.filter((r) => !seenRef.current.has(r.id));
      if (fresh.length === 0) { setHasMore(false); return; }
      fresh.forEach((r) => seenRef.current.add(r.id));
      setMessages((prev) => {
        const merged = [...fresh, ...prev];
        return merged.slice(-MAX_KEEP);
      });
      if (rows.length < targetLimit) setHasMore(false);
    } finally {
      setLoadingOlder(false);
      loadOlderLockRef.current = { slug, at: Date.now(), inflight: false };
    }
  }, [slug, hasMore]);

  const refetch = useCallback(async () => {
    if (!slug) return;
    const { data } = await (supabase as any).rpc('aura_room_recent_messages', {
      p_slug: slug, p_limit: 40,
    });
    if (!data) return;
    const rows = (data as RoomMessage[]).slice().reverse();
    // Adiciona ids ao seen sem resetar — evita flicker de mensagens já vistas
    rows.forEach((r) => seenRef.current.add(r.id));
    setMessages((prev) => {
      const serverIds = new Set(rows.map((r) => r.id));
      const serverBodies = new Set(rows.map((r) => `${r.user_id}::${r.body}`));
      // Mantém apenas itens locais que ainda não chegaram do servidor:
      // - temps cujo body não voltou
      // - mensagens reais já presentes que não estão neste fetch (preserva histórico)
      const localKept = prev.filter((m) => {
        if (m.id.startsWith('temp-')) {
          return !serverBodies.has(`${m.user_id}::${m.body}`);
        }
        // Mantém mensagens reais antigas que não vieram neste batch
        return !serverIds.has(m.id) ? true : false;
      });
      // Merge respeitando created_at
      const merged = [...rows, ...prev.filter((m) => !serverIds.has(m.id) && !m.id.startsWith('temp-')), ...localKept.filter((m) => m.id.startsWith('temp-'))];
      // Dedup final por id, ordena por created_at
      const map = new Map<string, RoomMessage>();
      for (const m of merged) map.set(m.id, m);
      return Array.from(map.values())
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(-MAX_KEEP);
    });
  }, [slug]);

  useEffect(() => {
    if (!slug) { setMessages([]); seenRef.current = new Set(); setHasMore(true); return; }
    loadOlderLockRef.current = { slug: null, at: 0, inflight: false };
    setHasMore(true);
    let cancelled = false;
    if (forcePresent) void ensurePresence();
    loadRecent(slug).catch(() => {});

    const scheduleHydrate = () => {
      if (hydrateTimerRef.current) return;
      hydrateTimerRef.current = window.setTimeout(async () => {
        hydrateTimerRef.current = null;
        if (cancelled) return;
        await refetch();
      }, 350);
    };

    const onInsertMsg = (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const row = payload.new;
      if (!row || row.room_slug !== slug) return;
      if (!row?.id || seenRef.current.has(row.id)) return;
      seenRef.current.add(row.id);
      const isSelf = !!meRef.current?.user_id && row.user_id === meRef.current.user_id;
      setMessages((prev) => {
        const filtered = prev.filter((m) =>
          !(m.id.startsWith('temp-') && m.user_id === row.user_id && m.body === row.body)
        );
        const next = [
          ...filtered,
          {
            id: row.id,
            user_id: row.user_id,
            body: row.body,
            created_at: row.created_at,
            name: isSelf ? (meRef.current?.name ?? null) : null,
            username: isSelf ? (meRef.current?.username ?? null) : null,
            avatar_url: isSelf ? (meRef.current?.avatar_url ?? null) : null,
            plan_type: isSelf ? (meRef.current?.plan_type ?? null) : null,
            is_verified: null,
            mentions: row.mentions ?? [],
            reply_to_id: row.reply_to_id ?? null,
            like_count: 0, dislike_count: 0, my_reaction: null,
          } as RoomMessage,
        ];
        return next.slice(-MAX_KEEP);
      });
      scheduleHydrate();
    };
    const unsubMsgs = subscribeTable('oculto_aura_room_messages', onInsertMsg, { events: ['INSERT'] });
    const unsubReacts = subscribeTable('oculto_aura_room_message_reactions', () => { scheduleHydrate(); });
    // Hidrata uma vez (já que não temos callback SUBSCRIBED do bus)
    refetch().catch(() => {});


    const onVisible = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      if (forcePresent) void ensurePresence();
      refetch().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    // Polling de segurança bem espaçado (60s) — confiamos no realtime para o resto.
    // Antes era 20s e causava flicker visível ("desconecta/reconecta").
    const safetyTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !cancelled) {
        refetch().catch(() => {});
      }
    }, 60_000);

    return () => {
      cancelled = true;
      if (hydrateTimerRef.current) window.clearTimeout(hydrateTimerRef.current);
      window.clearInterval(safetyTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      unsubMsgs(); unsubReacts();
    };
  }, [slug, loadRecent, refetch, ensurePresence, forcePresent]);

  /**
   * Envia uma mensagem da fila. Retorna true se enviou (e deve ser removida da fila),
   * false se deve permanecer (ex.: presença caiu novamente).
   */
  const dispatchOne = useCallback(async (item: OutboxItem): Promise<boolean> => {
    if (!slug || !forcePresent) return false;
    // Anti-duplicação: se o body já foi enviado nos últimos 10s, descarta.
    const lastSent = dedupeBodiesRef.current.get(item.body);
    if (lastSent && Date.now() - lastSent < 10_000) {
      return true; // marca como processado (descarta silenciosamente)
    }
    const present = await ensurePresence();
    if (!present) return false;
    try {
      const { data, error } = await (supabase as any).rpc('aura_room_post_message', {
        p_slug: slug,
        p_body: item.body.slice(0, 240),
        p_reply_to: item.replyTo,
        p_mentions: item.mentions,
      });
      if (error) return false;
      if ((data as any)?.ok === false) {
        const reason = (data as any)?.reason;
        // Erros recuperáveis ficam na fila; erros definitivos são descartados
        if (reason === 'not_present') return false;
        return true;
      }
      dedupeBodiesRef.current.set(item.body, Date.now());
      // Limpa entradas antigas (>30s) do mapa
      for (const [k, t] of dedupeBodiesRef.current) {
        if (Date.now() - t > 30_000) dedupeBodiesRef.current.delete(k);
      }
      setPresence('present');
      return true;
    } catch {
      return false;
    }
  }, [slug, ensurePresence]);

  const flushOutbox = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      // Itera sequencialmente para preservar ordem
      while (outboxRef.current.length > 0) {
        const next = outboxRef.current[0];
        const ok = await dispatchOne({ ...next, attempts: next.attempts + 1 });
        if (ok) {
          setOutbox((prev) => prev.filter((m) => m.id !== next.id));
        } else {
          // Backoff exponencial leve: para até a próxima tentativa de presença
          await new Promise((r) => setTimeout(r, 400 + next.attempts * 200));
          if (next.attempts >= 6) {
            // Após 6 tentativas, descarta para não travar a fila
            setOutbox((prev) => prev.filter((m) => m.id !== next.id));
          } else {
            setOutbox((prev) => prev.map((m) => m.id === next.id ? { ...m, attempts: m.attempts + 1 } : m));
          }
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
    // Após hidratar, sincroniza para que mensagens enviadas apareçam na lista
    if (slug) refetch().catch(() => {});
  }, [dispatchOne, refetch, slug]);

  // Quando a presença volta (ou o pai forçou presente), esvazia a fila imediatamente
  useEffect(() => {
    if (presence === 'present' && outboxRef.current.length > 0) {
      void flushOutbox();
    }
  }, [presence, flushOutbox]);

  // Se o pai forçou presença (usuário entrou via UI), garante uma tentativa de presença
  // em background para o realtime/RPCs ficarem alinhados — sem afetar o label exposto.
  useEffect(() => {
    if (forcePresent && slug) {
      void ensurePresence();
    }
  }, [forcePresent, slug, ensurePresence]);

  // Cache do perfil do usuário corrente para mensagens otimistas (preenche author/avatar imediatamente).
  const meRef = useRef<{ user_id: string; name: string | null; username: string | null; avatar_url: string | null; plan_type: string | null } | null>(null);
  const [meUserId, setMeUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data: prof } = await (supabase as any)
          .from('profiles')
          .select('name, username, avatar_url, plan_type')
          .eq('user_id', uid).maybeSingle();
        if (!cancelled) {
          meRef.current = {
            user_id: uid,
            name: prof?.name ?? null,
            username: prof?.username ?? null,
            avatar_url: prof?.avatar_url ?? null,
            plan_type: prof?.plan_type ?? null,
          };
          setMeUserId(uid);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const send = useCallback(async (
    body: string,
    opts?: { replyTo?: string | null; mentions?: string[] }
  ): Promise<{ ok: boolean; reason?: string; queued?: boolean }> => {
    if (!slug) return { ok: false, reason: 'no_slug' };
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, reason: 'invalid_length' };

    // Anti-duplicação imediata: se acabou de enviar o mesmo body, ignora
    const lastSent = dedupeBodiesRef.current.get(trimmed);
    if (lastSent && Date.now() - lastSent < 3000) {
      return { ok: false, reason: 'duplicate' };
    }

    setSending(true);

    const item: OutboxItem = {
      id: `oxb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      body: trimmed.slice(0, 240),
      replyTo: opts?.replyTo ?? null,
      mentions: opts?.mentions ?? [],
      attempts: 0,
      createdAt: Date.now(),
    };

    // === UI otimista: insere a mensagem imediatamente no chat (estado pending). ===
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let me = meRef.current;
    // Garante user_id real para reconciliação correta com a linha do servidor.
    if (!me?.user_id) {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user?.id) {
          me = { user_id: auth.user.id, name: null, username: null, avatar_url: null, plan_type: null };
          meRef.current = me;
        }
      } catch {}
    }
    const optimistic: RoomMessage = {
      id: tempId,
      user_id: me?.user_id ?? 'me',
      body: item.body,
      created_at: new Date().toISOString(),
      name: me?.name ?? null,
      username: me?.username ?? null,
      avatar_url: me?.avatar_url ?? null,
      plan_type: me?.plan_type ?? null,
      is_verified: null,
      mentions: item.mentions,
      reply_to_id: item.replyTo,
      like_count: 0, dislike_count: 0, my_reaction: null,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic].slice(-MAX_KEEP));

    const markFailed = () => {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, pending: false, failed: true } : m));
    };

    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    const clearTempPending = () => {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, pending: false, failed: false } : m));
    };

    // Helper de envio com retry exponencial p/ erros transitórios (rede/RPC).
    // Reasons definitivos (cooldown, blocked, frozen, etc.) NÃO são re-tentados.
    const TRANSIENT_REASONS = new Set(['', 'not_present', 'network', 'timeout', 'temporary']);
    const DEFINITIVE_REASONS = new Set([
      'cooldown', 'blocked', 'frozen', 'shadowbanned', 'invalid_length',
      'rate_limited', 'unauthorized', 'banned', 'requirements_not_met',
    ]);

    async function attempt(): Promise<{ ok: true } | { ok: false; reason: string; transient: boolean; details?: any }> {
      try {
        const { data, error } = await (supabase as any).rpc('aura_room_post_message', {
          p_slug: slug,
          p_body: item.body,
          p_reply_to: item.replyTo,
          p_mentions: item.mentions,
        });
        if (error) {
          // Erro de rede/transporte → transitório
          return { ok: false, reason: 'network', transient: true, details: { error } };
        }
        if ((data as any)?.ok === false) {
          const reason = (data as any)?.reason ?? '';
          const transient = TRANSIENT_REASONS.has(reason) && !DEFINITIVE_REASONS.has(reason);
          return { ok: false, reason: reason || 'send_failed', transient, details: data };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'network', transient: true, details: { error: e } };
      }
    }

    const diagnostic = (label: string, info: any) => {
      try {
        const enabled = typeof window !== 'undefined' && window.localStorage.getItem('aura-chat:diag') === '1';
        if (enabled) console.warn(`[aura-chat] ${label}`, info);
      } catch {}
    };

    // Tentativas com backoff exponencial (300ms, 700ms, 1500ms, 3000ms)
    const backoffs = [0, 300, 700, 1500, 3000];
    let lastReason = '';
    let lastDetails: any = null;
    for (let i = 0; i < backoffs.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, backoffs[i]));
      if (i > 0 && forcePresent) { try { await ensurePresence(); } catch {} }
      const r = await attempt();
      if (r.ok === true) {
        setSending(false);
        dedupeBodiesRef.current.set(item.body, Date.now());
        setPresence('present');
        clearTempPending();
        refetch().catch(() => {});
        return { ok: true };
      } else {
        lastReason = r.reason;
        lastDetails = r.details;
        diagnostic(`attempt ${i + 1}/${backoffs.length} failed`, { slug, reason: r.reason, transient: r.transient, details: r.details });
        if (!r.transient) break;
        if (!isOnline) break;
      }
    }

    setSending(false);

    // Online + falha persistente → marca como falha (botão reenviar disponível)
    if (isOnline) {
      markFailed();
      diagnostic('send failed (online, no retry left)', { slug, lastReason, lastDetails });
      return { ok: false, reason: lastReason || 'send_failed' };
    }

    // Offline real → enfileira para flush automático ao voltar conexão
    setOutbox((prev) => [...prev, item]);
    diagnostic('queued (offline)', { slug, item });
    return { ok: true, queued: true };
  }, [slug, ensurePresence, refetch]);


  const react = useCallback(async (messageId: string, kind: 'like' | 'dislike') => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const cur = m.my_reaction ?? null;
      let likeC = m.like_count ?? 0;
      let disC = m.dislike_count ?? 0;
      let next: 'like' | 'dislike' | null = kind;
      if (cur === kind) {
        next = null;
        if (kind === 'like') likeC = Math.max(0, likeC - 1);
        else disC = Math.max(0, disC - 1);
      } else if (cur && cur !== kind) {
        if (cur === 'like') likeC = Math.max(0, likeC - 1); else disC = Math.max(0, disC - 1);
        if (kind === 'like') likeC += 1; else disC += 1;
      } else {
        if (kind === 'like') likeC += 1; else disC += 1;
      }
      return { ...m, like_count: likeC, dislike_count: disC, my_reaction: next };
    }));
    const { error } = await (supabase as any).rpc('aura_room_react_message', {
      p_message_id: messageId, p_kind: kind,
    });
    if (error) { try { await refetch(); } catch {} }
  }, [refetch]);

  const editMessage = useCallback((messageId: string, newBody: string) => {
    if (!slug) return;
    const trimmed = newBody.trim().slice(0, 240);
    if (!trimmed) return;
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, body: trimmed, edited: true } : m));
    const ov = loadOverlay(slug);
    ov.edits = { ...(ov.edits || {}), [messageId]: trimmed };
    saveOverlay(slug, ov);
  }, [slug]);

  const deleteMessage = useCallback((messageId: string) => {
    if (!slug) return;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    const ov = loadOverlay(slug);
    ov.deletes = { ...(ov.deletes || {}), [messageId]: true };
    saveOverlay(slug, ov);
  }, [slug]);

  const toggleEmoji = useCallback((messageId: string, emoji: string) => {
    if (!slug) return;
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const cur = m.emoji_reactions || {};
      const e = cur[emoji] || { count: 0, mine: false };
      const nextEntry = e.mine
        ? { count: Math.max(0, e.count - 1), mine: false }
        : { count: e.count + 1, mine: true };
      const nextRx = { ...cur };
      if (nextEntry.count <= 0 && !nextEntry.mine) delete nextRx[emoji];
      else nextRx[emoji] = nextEntry;
      // persiste no overlay
      const ov = loadOverlay(slug);
      ov.emojis = { ...(ov.emojis || {}), [messageId]: nextRx };
      saveOverlay(slug, ov);
      return { ...m, emoji_reactions: nextRx };
    }));
  }, [slug]);

  /** Reenvia uma mensagem otimista que falhou: re-tenta a RPC e atualiza o estado. */
  const resend = useCallback(async (tempId: string) => {
    const target = (messages.find((m) => m.id === tempId));
    if (!target || !slug) return;
    setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, pending: true, failed: false } : m));
    try {
      const { data, error } = await (supabase as any).rpc('aura_room_post_message', {
        p_slug: slug,
        p_body: target.body.slice(0, 240),
        p_reply_to: target.reply_to_id ?? null,
        p_mentions: target.mentions ?? [],
      });
      if (!error && (data as any)?.ok !== false) {
        dedupeBodiesRef.current.set(target.body, Date.now());
        refetch().catch(() => {});
        return;
      }
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, pending: false, failed: true } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, pending: false, failed: true } : m));
    }
  }, [messages, slug, refetch]);

  // Aplica overlay (edits/deletes/emojis) sobre o estado bruto antes de devolver à UI.
  const overlaidMessages = (() => {
    if (!slug) return messages;
    return applyOverlay(slug, messages);
  })();

  return {
    messages: overlaidMessages, loading, loadingOlder, hasMore, loadOlder,
    sending, send, react, refetch, presence, presenceRaw, ensurePresence,
    outbox,
    editMessage, deleteMessage, toggleEmoji, resend,
    meUserId,
  };
}
