import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';

import { sanitizeMessage } from '@/lib/sanitize';
import { resolveChatIdentity, resolveAuthUserIdFromAnyId, resolveConversationPeerId, isSelfChatId, isChatBlockedBetween, invalidateChatBlockCache } from '@/lib/chatIdentity';
import { playNewMessageSound } from '@/lib/messageSound';
// showNewMessageToast intencionalmente removido daqui — ver nota em ~L549.
import {
  useUnreadChatStore,
  computeTotalUnreadFromConversations,
  bootstrapUnreadChatSync,
} from '@/store/useUnreadChatStore';

// Garante listener cross-tab montado o quanto antes (idempotente).
bootstrapUnreadChatSync();

const sanitizeChatContent = (content: string, mediaType?: string | null) => {
  const sanitized = sanitizeMessage(content);
  return mediaType === 'sticker' ? sanitized.replace(/^\uFEFF+/, '').trim() : sanitized;
};

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  media_url?: string | null;
  media_type?: string | null;
  is_locked?: boolean;
  unlock_price?: number | null;
  unlocked_by?: string[];
  story_reply_id?: string | null;
  deleted_for_everyone?: boolean;
  deleted_by?: string[];
  story?: {
    id: string;
    media_url?: string | null;
    content_text?: string | null;
    created_at: string;
    author?: {
      name: string;
      username?: string;
      avatar_url?: string | null;
    };
  } | null;
  sender?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  // Send status for optimistic UI
  // sending → sent (1 gray) → delivered (2 gray) → read (2 blue)
  _status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  _tempId?: string;
  _uploadProgress?: number;
  _uploadLabel?: string;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  self_is_archived: boolean;
  participants: {
    user_id: string;
    is_archived: boolean;
    last_read_at: string | null;
    has_unread_priority?: boolean;
    total_priority_amount?: number;
    profile: {
      id: string;
      user_id: string;
      name: string;
      username?: string | null;
      avatar_url: string | null;
      is_online: boolean;
      last_seen?: string | null;
      show_online_status?: boolean | null;
      profile_type: string;
      is_verified: boolean;
      is_verified_couple: boolean;
      plan_type: string;
      is_creator: boolean;
      accept_super_dm?: boolean;
      min_super_dm_price?: number;
    };
  }[];
  last_message?: Message;
  unread_count: number;
  has_unread_priority?: boolean;
  total_priority_amount?: number;
}

export interface TypingIndicator {
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  updated_at: string;
}

export type ConversationTab = 'inbox' | 'archived';

const getConvTimestamp = (c: Conversation) => {
  const lastMsgAt = c.last_message?.created_at;
  return new Date(lastMsgAt || c.updated_at || c.created_at || 0).getTime();
};

// Online "real" — replicado aqui (sem import) para evitar ciclos.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const isParticipantOnline = (c: Conversation): boolean => {
  const p = c.participants?.[0]?.profile;
  if (!p?.is_online) return false;
  if (p.show_online_status === false) return false;
  if (!p.last_seen) return false;
  const t = new Date(p.last_seen).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
};

// Ordem da inbox (tiers, do topo p/ baixo):
//  1. Super DM com alerta de prioridade (mantém topo)
//  2. Participantes ONLINE agora — sub-ordenados pela última atividade
//  3. Demais — pela última atividade
const sortConversations = (items: Conversation[]) => {
  return [...items].sort((a, b) => {
    const priorityA = a.has_unread_priority ? (a.total_priority_amount || 0) : 0;
    const priorityB = b.has_unread_priority ? (b.total_priority_amount || 0) : 0;
    if (priorityA !== priorityB) return priorityB - priorityA;

    const onlineA = isParticipantOnline(a) ? 1 : 0;
    const onlineB = isParticipantOnline(b) ? 1 : 0;
    if (onlineA !== onlineB) return onlineB - onlineA;

    return getConvTimestamp(b) - getConvTimestamp(a);
  });
};

// Deduplica conversas pelo outro participante, mantendo a mais recente.
const dedupeConversations = (items: Conversation[]) => {
  const byOther = new Map<string, Conversation>();
  const extras: Conversation[] = [];
  for (const conv of items) {
    const other = conv.participants[0]?.profile as any;
    const key =
      other?.user_id ||
      other?.id ||
      (other?.username ? `u:${String(other.username).toLowerCase()}` : '');
    if (!key) {
      extras.push(conv);
      continue;
    }
    const existing = byOther.get(key);
    if (!existing || getConvTimestamp(conv) > getConvTimestamp(existing)) {
      byOther.set(key, conv);
    }
  }
  return [...byOther.values(), ...extras];
};

// Cache em localStorage para hidratação instantânea da Inbox entre sessões.
// Mantém apenas dados leves (sem mensagens completas) — primeiro render em <50ms
// mesmo após reabrir o app. Fallback para sessionStorage em modo privado.
const CACHE_KEY_PREFIX = 'oculto:chat:conversations:v2:';
const cacheStore = (): Storage | null => {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* ignore */ }
  try { if (typeof sessionStorage !== 'undefined') return sessionStorage; } catch { /* ignore */ }
  return null;
};
const readConversationsCache = (userId: string): Conversation[] | null => {
  try {
    const s = cacheStore(); if (!s) return null;
    const raw = s.getItem(CACHE_KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as Conversation[];
  } catch { return null; }
};
const writeConversationsCache = (userId: string, list: Conversation[]) => {
  try {
    const s = cacheStore(); if (!s) return;
    // Limita payload — mantém só os 40 mais recentes para cache leve.
    const slim = list.slice(0, 40);
    s.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify(slim));
  } catch { /* quota — ignora */ }
};

// Dedup cross-instance: várias montagens de useChat (Navbar, Sidebar,
// MessagesPage, RecentMatchesWidget...) disparam fetchConversations em
// paralelo no mesmo render. Sem dedup isso vira ~28 requests concorrentes,
// faz o HTTP/2 da Supabase abortar lotes inteiros e o feed/chat fica em
// loading infinito ("AbortError: signal is aborted without reason").
const _inflightFetches = new Map<string, Promise<Conversation[]>>();
const CHAT_UPDATE_EVENT = 'oculto:chat:conversations:update';
const broadcastConversations = (userId: string, list: Conversation[]) => {
  try {
    window.dispatchEvent(new CustomEvent(CHAT_UPDATE_EVENT, { detail: { userId, list } }));
  } catch { /* ignore */ }
};
const isAbortLike = (err: any) =>
  err?.name === 'AbortError' ||
  /aborted|abort/i.test(String(err?.message || ''));

export function useChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    // SSR-safe: só lê cache no client.
    if (typeof window === 'undefined') return [];
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string[]>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'error'>('connected');
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchConversationsRef = useRef<(() => void) | null>(null);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  // Sufixo único por instância do hook — sem isso, múltiplos consumidores
  // (MobileNavbar + MessagesPage + LeftSidebar + RealtimeInboxSidebar) criariam
  // canais com o MESMO topic no mesmo socket e apenas uma instância recebia
  // os eventos realtime, causando o badge de não-lidas travado/dessincronizado.
  const instanceIdRef = useRef<string>(Math.random().toString(36).slice(2, 10));

  const activeConversationIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  const selfIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (user?.id) resolveChatIdentity(user.id).then(id => { selfIdsRef.current = id.selfIds; });
  }, [user?.id]);

  // Tick periódico (60s) — re-ordena a lista para refletir usuários que
  // saíram da janela de "online" sem disparar evento de presença.
  useEffect(() => {
    if (!user?.id) return;
    const t = setInterval(() => {
      setConversations(prev => {
        if (prev.length < 2) return prev;
        const sorted = sortConversations(prev);
        // Evita re-render se a ordem permanecer idêntica.
        for (let i = 0; i < prev.length; i += 1) {
          if (prev[i].id !== sorted[i].id) return sorted;
        }
        return prev;
      });
    }, 60_000);
    return () => clearInterval(t);
  }, [user?.id]);

  // Throttled refetch — agrupa rajadas em uma única chamada (300ms).
  const throttledRefetch = useCallback(() => {
    if (throttleTimerRef.current) return;
    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null;
      fetchConversationsRef.current?.();
    }, 300);
  }, []);


  // Núcleo da busca — extraído para fora do hook de modo a ser
  // compartilhado entre múltiplas instâncias (via _inflightFetches).
  const runFetchCore = useCallback(async (userId: string): Promise<Conversation[]> => {
    const selfIdentity = await resolveChatIdentity(userId);
    const selfIds = selfIdentity.selfIds.length > 0 ? selfIdentity.selfIds : [userId];

    const { data: participations, error: partError } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        is_archived,
        last_read_at,
        has_unread_priority,
        total_priority_amount
      `)
      .in('user_id', selfIds);

    if (partError) throw partError;

    const conversationIds = Array.from(
      new Set((participations || []).map(p => p.conversation_id))
    );

    if (conversationIds.length === 0) return [];

    const { data: convsData } = await supabase
      .from('conversations')
      .select('id, created_at, updated_at')
      .in('id', conversationIds);
    const convMap = new Map<string, any>((convsData || []).map((c: any) => [c.id, c]));
    participations?.forEach((p: any) => { p.conversations = convMap.get(p.conversation_id) || null; });

    // Fonte de verdade do "não lido": comparamos `messages.created_at` com
    // `conversation_participants.last_read_at` do próprio usuário. Não dependemos
    // mais de `messages.is_read` — esse flag pode falhar silenciosamente por RLS
    // (recipient nem sempre tem permissão de UPDATE em messages), causando o bug
    // de mensagens "voltarem" como não lidas após sair da conversa.
    const selfLastReadMap = new Map<string, string | null>();
    (participations || []).forEach((p: any) => {
      const prev = selfLastReadMap.get(p.conversation_id);
      const cur = p.last_read_at as string | null;
      // Mantém o MAIS RECENTE entre múltiplas identidades self (caso raro).
      if (!prev || (cur && new Date(cur) > new Date(prev))) {
        selfLastReadMap.set(p.conversation_id, cur);
      } else if (!selfLastReadMap.has(p.conversation_id)) {
        selfLastReadMap.set(p.conversation_id, cur);
      }
    });
    // Janela de busca: pega a `last_read_at` mais antiga (ou epoch se alguém
    // nunca leu) para limitar a query a mensagens potencialmente não lidas.
    let earliestLastRead: string | null = null;
    selfLastReadMap.forEach((v) => {
      if (!v) { earliestLastRead = null; return; }
      if (earliestLastRead === null) return; // já marcou alguém sem leitura
      if (new Date(v) < new Date(earliestLastRead)) earliestLastRead = v;
    });
    // Se algum participante nunca leu, varremos sem cutoff (mas com limite).
    const someoneNeverRead = Array.from(selfLastReadMap.values()).some(v => !v);
    const cutoffIso = someoneNeverRead ? null : earliestLastRead;

    const [allParticipantsRes, lastMessagesRes, unreadDataRes] = await Promise.all([
      supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          user_id,
          is_archived,
          last_read_at,
          has_unread_priority,
          total_priority_amount
        `)
        .in('conversation_id', conversationIds)
        .not('user_id', 'in', `(${selfIds.map(id => `"${id}"`).join(',')})`),
      supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, is_read, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(Math.max(conversationIds.length * 3, 200)),
      (() => {
        let q = supabase
          .from('messages')
          .select('conversation_id, sender_id, created_at')
          .in('conversation_id', conversationIds)
          .not('sender_id', 'in', `(${selfIds.map(id => `"${id}"`).join(',')})`);
        if (cutoffIso) q = q.gt('created_at', cutoffIso);
        return q.limit(5000);
      })(),
    ]);


    const allParticipants = allParticipantsRes.data;
    const lastMessages = lastMessagesRes.data;
    const unreadData = unreadDataRes.data;

    const otherUserIds = allParticipants?.map(p => p.user_id).filter(Boolean) || [];
    let profilesMap = new Map<string, Conversation['participants'][0]['profile']>();
    const botConvIds = new Set<string>();

    // OBS: o check de bloqueio (`isChatBlockedBetween`) é caro — uma RPC por
    // peer. Antes era awaitado aqui e segurava o primeiro render da inbox por
    // 1–4s em usuários com muitas conversas. Agora deixamos passar tudo no
    // primeiro fetch e filtramos no próximo (block-cache TTL evita refetch).
    const blockedPeerIds = new Set<string>();

    if (otherUserIds.length > 0) {
      const [byUserId, byId] = await Promise.all([
        (supabase as any)
          .from('v_public_profiles')
          .select('id, user_id, name, username, avatar_url, is_online, last_seen, show_online_status, profile_type, is_verified, is_verified_couple, plan_type, is_creator, accept_super_dm, min_super_dm_price, is_seed')
          .in('user_id', otherUserIds),
        (supabase as any)
          .from('v_public_profiles')
          .select('id, user_id, name, username, avatar_url, is_online, last_seen, show_online_status, profile_type, is_verified, is_verified_couple, plan_type, is_creator, accept_super_dm, min_super_dm_price, is_seed')
          .in('id', otherUserIds),
      ]);

      const indexProfile = (p: any) => {
        if (p.is_seed) {
          allParticipants?.forEach(ap => {
            if (ap.user_id === p.user_id || ap.user_id === p.id) botConvIds.add(ap.conversation_id);
          });
          return;
        }
        const mapped = p as unknown as Conversation['participants'][0]['profile'];
        if (p.user_id) profilesMap.set(p.user_id, mapped);
        if (p.id) profilesMap.set(p.id, mapped);
      };
      (byUserId.data || []).forEach(indexProfile);
      (byId.data || []).forEach(indexProfile);
    }

    const conversationMap = new Map<string, Conversation>();

    participations?.filter(p => !botConvIds.has(p.conversation_id)).forEach(p => {
      const conv = (p as any).conversations as { id: string; created_at: string; updated_at: string } | null;
      if (!conv) return;
      const peers = (allParticipants || []).filter(ap => ap.conversation_id === p.conversation_id);
      if (peers.some(peer => blockedPeerIds.has(peer.user_id))) return;
      const part = p as any;
      conversationMap.set(p.conversation_id, {
        id: conv.id,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        self_is_archived: !!part.is_archived,
        participants: [],
        unread_count: 0,
        has_unread_priority: part.has_unread_priority || false,
        total_priority_amount: part.total_priority_amount || 0,
      });
    });

    allParticipants?.filter(p => !botConvIds.has(p.conversation_id)).forEach(p => {
      const conv = conversationMap.get(p.conversation_id);
      if (conv) {
        const part = p as any;
        const profile = profilesMap.get(p.user_id) || {
          id: '', user_id: p.user_id, name: 'Usuário', avatar_url: null,
          is_online: false, last_seen: null, show_online_status: true, profile_type: 'single', is_verified: false,
          is_verified_couple: false, plan_type: 'free', is_creator: false,
        } as unknown as Conversation['participants'][0]['profile'];
        conv.participants.push({
          user_id: p.user_id,
          is_archived: p.is_archived,
          last_read_at: p.last_read_at,
          has_unread_priority: part.has_unread_priority || false,
          total_priority_amount: part.total_priority_amount || 0,
          profile,
        });
      }
    });

    const lastMsgMap = new Map<string, Message>();
    lastMessages?.forEach(msg => {
      if (!lastMsgMap.has(msg.conversation_id)) {
        lastMsgMap.set(msg.conversation_id, msg as Message);
      }
    });

    conversationMap.forEach((conv, id) => {
      conv.last_message = lastMsgMap.get(id);
    });

    unreadData?.forEach((u: any) => {
      const conv = conversationMap.get(u.conversation_id);
      if (!conv) return;
      const lastRead = selfLastReadMap.get(u.conversation_id);
      // Conta apenas mensagens criadas APÓS o `last_read_at` do próprio usuário.
      // Se nunca leu, conta todas as mensagens do "outro" naquela conversa.
      if (!lastRead || new Date(u.created_at) > new Date(lastRead)) {
        conv.unread_count++;
      }
    });

    return sortConversations(dedupeConversations(Array.from(conversationMap.values())));
  }, []);

  // Wrapper: dedup cross-instância + retry leve em AbortError + broadcast
  const abortRetryRef = useRef(0);
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const userId = user.id;

    let promise = _inflightFetches.get(userId);
    if (!promise) {
      promise = runFetchCore(userId).finally(() => _inflightFetches.delete(userId));
      _inflightFetches.set(userId, promise);
    }

    try {
      const list = await promise;
      setConversations(list);
      writeConversationsCache(userId, list);
      broadcastConversations(userId, list);
      abortRetryRef.current = 0;

      // Aquecimento em background do cache de bloqueios. Não bloqueia o render:
      // o próximo fetch (ou um realtime tick) já filtra peers bloqueados.
      try {
        const peers = Array.from(new Set(
          list.flatMap((c) => c.participants.map((p) => p.user_id)).filter(Boolean)
        )).slice(0, 60);
        if (peers.length > 0) {
          const run = () => { peers.forEach((id) => { void isChatBlockedBetween(id, userId); }); };
          if (typeof (window as any).requestIdleCallback === 'function') {
            (window as any).requestIdleCallback(run, { timeout: 1500 });
          } else {
            setTimeout(run, 250);
          }
        }
      } catch { /* noop */ }
    } catch (error) {
      if (isAbortLike(error)) {
        // Mantém estado/cache atual e tenta novamente uma vez com backoff curto.
        if (abortRetryRef.current < 2) {
          abortRetryRef.current += 1;
          setTimeout(() => { fetchConversationsRef.current?.(); }, 600);
        }
        return;
      }
      console.error('[Chat] Fetch error:', error);
    } finally {
      setLoading(false);

    }
  }, [user, runFetchCore]);

  const persistReadState = useCallback(async (conversationIds: string | string[], knownSelfIds?: string[]) => {
    if (!user) return;

    const ids = Array.isArray(conversationIds) ? conversationIds.filter(Boolean) : [conversationIds].filter(Boolean);
    if (ids.length === 0) return;

    const selfIds = knownSelfIds && knownSelfIds.length > 0
      ? knownSelfIds
      : (await resolveChatIdentity(user.id)).selfIds;
    const normalizedSelfIds = selfIds.length > 0 ? selfIds : [user.id];

    await Promise.all([
      supabase
        .from('messages')
        .update({ is_read: true })
        .in('conversation_id', ids)
        .not('sender_id', 'in', `(${normalizedSelfIds.map(id => `"${id}"`).join(',')})`),
      supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .in('conversation_id', ids)
        .in('user_id', normalizedSelfIds),
      // Sincroniza o sino de notificações com a leitura do chat:
      // qualquer notificação de mensagem/ping/super-dm desta conversa cai
      // para is_read=true imediatamente, e o Realtime de `notifications`
      // empurra o badge para zero em todas as abas.
      supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .in('type', ['new_message', 'message', 'super_dm', 'attention_ping'])
        .in('data->>conversation_id', ids),
    ]);

  }, [user]);

  const setActiveConversation = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationIdState(conversationId);
  }, []);

  // Cross-instance sync: outra montagem de useChat acabou de buscar — recebe
  // o resultado pronto e evita um round-trip duplicado.
  useEffect(() => {
    if (!user?.id) return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { userId: string; list: Conversation[] } | undefined;
      if (!detail || detail.userId !== user.id) return;
      setConversations(detail.list);
      setLoading(false);
    };
    window.addEventListener(CHAT_UPDATE_EVENT, handler);
    return () => window.removeEventListener(CHAT_UPDATE_EVENT, handler);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const handler = () => {
      throttledRefetch();
    };
    window.addEventListener('oculto:chat-blocks:changed', handler);
    // Refetch forçado vindo de qualquer parte do app (ex.: useGlobalChatNotifications
    // ao receber INSERT de mensagem para conversa desconhecida).
    const forceHandler = () => {
      try { _inflightFetches.delete(user.id); } catch { /* noop */ }
      fetchConversationsRef.current?.();
    };
    window.addEventListener('oculto:chat:force-refetch', forceHandler);

    // Fallback Realtime — se o socket cair (aba dormindo, rede oscilando,
    // suspend/resume), reconciliamos a inbox via REST ao voltar. Throttle
    // de 4s evita rajada quando visibilitychange + online + focus disparam
    // juntos. Garante que contadores de não lidas, last_read_at e ✓✓ azuis
    // ficam corretos mesmo se algum evento Realtime foi perdido.
    let lastResyncAt = 0;
    const resync = () => {
      const now = Date.now();
      if (now - lastResyncAt < 4000) return;
      lastResyncAt = now;
      fetchConversationsRef.current?.();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') resync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', resync);
    window.addEventListener('focus', resync);

    return () => {
      window.removeEventListener('oculto:chat-blocks:changed', handler);
      window.removeEventListener('oculto:chat:force-refetch', forceHandler);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', resync);
      window.removeEventListener('focus', resync);
    };
  }, [user?.id, throttledRefetch]);


  // Initial fetch on mount / user change — sem isso o loading fica infinito.
  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    // Hidratação instantânea do cache — Inbox aparece em <50ms no mobile
    // enquanto o fetch completo roda em background.
    const cached = readConversationsCache(user.id);
    if (cached && cached.length > 0) {
      setConversations(cached);
      setLoading(false); // mostra dados imediatamente
    } else {
      setLoading(true);
    }
    fetchConversations();
  }, [user, fetchConversations]);



  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;


    channelsRef.current.forEach(ch => ch.unsubscribe());
    channelsRef.current = [];

    // Bus multiplexado em `messages`/`conversations`/`conversation_participants`
    // para não abrir um websocket por instância do hook.
    const unsubMessagesInsert = subscribeTable(
      'messages',
      (payload: any) => {
        const inserted = payload.new as Partial<Message> & { conversation_id?: string; sender_id?: string; created_at?: string; content?: string; is_read?: boolean };

        if (!inserted.conversation_id) {
          throttledRefetch();
          return;
        }

        const fromSelf = inserted.sender_id ? isSelfChatId(inserted.sender_id, selfIdsRef.current.length > 0 ? selfIdsRef.current : [user.id]) : false;
        const isActiveConversation = activeConversationIdRef.current === inserted.conversation_id;

        // 🚀 Som dispara IMEDIATAMENTE para mensagens recebidas — não fica
        // atrás de await isChatBlockedBetween (que custava 200-500ms/msg).
        // Som tem dedup interno por id, então é seguro tocar aqui.
        if (!fromSelf) {
          playNewMessageSound(inserted.id ? `message:${String(inserted.id)}` : undefined, inserted.conversation_id);
        }

        // Atualiza a lista de conversas SINCRONAMENTE — preview da última
        // mensagem e badge de não-lidas instantâneos.
        let conversationFoundLocally = false;
        setConversations(prev => {
          const idx = prev.findIndex(conv => conv.id === inserted.conversation_id);
          if (idx === -1) return prev;
          conversationFoundLocally = true;

          const conv = prev[idx];
          const nextUnreadCount = fromSelf || isActiveConversation
            ? 0
            : conv.unread_count + 1;

          const nextConversation: Conversation = {
            ...conv,
            updated_at: inserted.created_at || new Date().toISOString(),
            unread_count: nextUnreadCount,
            self_is_archived: isActiveConversation ? false : conv.self_is_archived,
            last_message: {
              id: String(inserted.id || conv.last_message?.id || ''),
              conversation_id: inserted.conversation_id!,
              sender_id: inserted.sender_id || conv.last_message?.sender_id || '',
              content: inserted.content || conv.last_message?.content || '',
              is_read: Boolean(inserted.is_read),
              created_at: inserted.created_at || conv.last_message?.created_at || new Date().toISOString(),
            },
          };

          const next = [...prev];
          next[idx] = nextConversation;
          return sortConversations(next);
        });

        if (!fromSelf && isActiveConversation) {
          void persistReadState(inserted.conversation_id, selfIdsRef.current.length > 0 ? selfIdsRef.current : [user.id]);
        }

        if (!conversationFoundLocally) {
          // Conversa NOVA — bypassa throttle para aparecer instantaneamente
          // na lista (estilo WhatsApp). O fetch puxa participação+conversa+
          // última mensagem em uma rodada.
          //
          // FIX (race read-after-write): em alguns ambientes a primeira leitura
          // da inbox pode retornar 0 rows porque a participação ainda não está
          // visível no réplica que serve a query. Limpamos o inflight para
          // forçar nova request e re-tentamos com backoff até a conversa
          // aparecer (máx ~5s). Cada retry invalida o inflight também.
          const targetId = inserted.conversation_id!;
          const runRetry = () => {
            try { _inflightFetches.delete(user.id); } catch { /* noop */ }
            fetchConversationsRef.current?.();
          };
          runRetry();
          const delays = [500, 1500, 3500];
          delays.forEach((ms) => {
            setTimeout(() => {
              const found = conversationsRef.current.some((c) => c.id === targetId);
              if (!found) runRetry();
            }, ms);
          });
        }

        // Bloqueio agora roda em background — se for bloqueado, reverte o
        // incremento de não-lidas no próximo refetch (não impacta som/UI).
        if (!fromSelf && inserted.sender_id) {
          void isChatBlockedBetween(inserted.sender_id, user.id).then((blocked) => {
            if (blocked) throttledRefetch();
          }).catch(() => {});
        }
      },
      { events: ['INSERT'] },
    );

    const unsubMessagesUpdate = subscribeTable(
      'messages',
      (payload: any) => {
        if (payload.new && payload.old && !payload.old.is_read && payload.new.is_read) {
          throttledRefetch();
        }
      },
      { events: ['UPDATE'] },
    );

    const unsubParticipants = subscribeTable('conversation_participants', () => {
      throttledRefetch();
    });

    const unsubConversations = subscribeTable('conversations', () => {
      throttledRefetch();
    });

    const unsubBlocks = subscribeTable('blocked_contacts', () => {
      invalidateChatBlockCache();
      throttledRefetch();
    });

    // Bus já está conectado quando o hook monta; assume conectado.
    setConnectionStatus('connected');


    // Use Broadcast for typing (zero DB writes, low latency)
    const typingChannel = supabase
      .channel(`typing-broadcast:${instanceIdRef.current}`)
      .on(
        'broadcast',
        { event: 'typing' },
        (payload: any) => {
          const data = payload.payload as { conversation_id: string; user_id: string; is_typing: boolean };
          if (data.user_id === user.id) return;
          
          setTypingUsers(prev => {
            const newMap = new Map(prev);
            const convTyping = newMap.get(data.conversation_id) || [];
            
            if (data.is_typing) {
              if (!convTyping.includes(data.user_id)) {
                newMap.set(data.conversation_id, [...convTyping, data.user_id]);
              }
            } else {
              newMap.set(data.conversation_id, convTyping.filter(id => id !== data.user_id));
            }
            
            return newMap;
          });
        }
      )
      .subscribe();

    channelsRef.current = [typingChannel];

    // Presença (is_online/last_seen) dos participantes — via bus compartilhado
    // de `profiles` em vez de canal próprio, para reduzir websockets paralelos.
    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      const updated = payload.new as { id?: string; user_id?: string; is_online?: boolean; last_seen?: string | null };
      if (!updated || (updated.is_online === undefined && updated.last_seen === undefined)) return;

      setConversations(prev => {
        let changed = false;
        const next = prev.map(conv => {
          let convChanged = false;
          const participants = conv.participants.map(p => {
            const match = (updated.id && p.profile.id === updated.id) ||
                          (updated.user_id && p.profile.user_id === updated.user_id);
            if (!match) return p;
            convChanged = true;
            return {
              ...p,
              profile: {
                ...p.profile,
                is_online: updated.is_online ?? p.profile.is_online,
                last_seen: updated.last_seen ?? p.profile.last_seen,
              },
            };
          });
          if (!convChanged) return conv;
          changed = true;
          return { ...conv, participants };
        });
        if (!changed) return prev;
        return sortConversations(next);
      });
    }, { events: ['UPDATE'] });

    return () => {
      unsubMessagesInsert();
      unsubMessagesUpdate();
      unsubParticipants();
      unsubConversations();
      unsubBlocks();
      typingChannel.unsubscribe();
      unsubProfiles();
      channelsRef.current = [];
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, [user, fetchConversations, throttledRefetch]);

  // Send message with sanitization and error handling
  const sendMessage = useCallback(async (conversationId: string, content: string, mediaUrl?: string, mediaType?: string): Promise<{ error: Error | null; tempId?: string }> => {
    if (!user) return { error: new Error('Not authenticated') };

    const sanitized = sanitizeChatContent(content, mediaType);
    if (!sanitized && !mediaUrl) return { error: new Error('Empty message after sanitization') };

    try {
      const selfIdentity = await resolveChatIdentity(user.id);
      const senderId = selfIdentity.profileId || user.id;
      const receiverId = await resolveConversationPeerId(conversationId, selfIdentity.selfIds.length > 0 ? selfIdentity.selfIds : [user.id]);
      if (await isChatBlockedBetween(receiverId, user.id)) {
        return { error: new Error('chat_blocked') };
      }

      const insertData = {
        conversation_id: conversationId,
        sender_id: senderId,
        content: sanitized || '',
        ...(mediaUrl ? { media_url: mediaUrl } : {}),
        ...(mediaType ? { media_type: mediaType } : {}),
      };

      const { error } = await supabase
        .from('messages')
        .insert(insertData);

      if (error) {
        console.error('[Chat] Send error:', error);
        return { error };
      }

      // Missão diária "Envie 3 mensagens" — conta cada DM real (não bloqueia falhas).
      try {
        const { progressAuraQuest } = await import('@/lib/auraQuests');
        void progressAuraQuest('send_3_dms', 1, { bypassLock: true, reason: 'mensagem enviada no chat' });
      } catch { /* noop */ }

      await setTypingFn(conversationId, false);
      return { error: null };
    } catch (err) {
      console.error('[Chat] Send exception:', err);
      return { error: err instanceof Error ? err : new Error('Falha ao enviar') };
    }
  }, [user]);

  // Broadcast-based typing (no DB writes) — reuses the typing channel
  // já assinado em channelsRef para evitar vazamento de canais a cada keystroke.
  const setTypingFn = useCallback(async (conversationId: string, isTyping: boolean) => {
    if (!user) return;

    const typingCh = channelsRef.current.find((ch: any) => ch?.topic === 'realtime:typing-broadcast');
    if (!typingCh) return; // ainda não assinado — ignora silenciosamente

    try {
      await typingCh.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          conversation_id: conversationId,
          user_id: user.id,
          is_typing: isTyping,
        },
      });
    } catch {
      /* swallow — typing é best-effort */
    }
  }, [user]);

  const markAsRead = useCallback(async (conversationId: string | string[]) => {
    if (!user) return;

    const ids = Array.isArray(conversationId) ? conversationId.filter(Boolean) : [conversationId].filter(Boolean);
    if (ids.length === 0) return;

    const selfIdentity = await resolveChatIdentity(user.id);
    const selfIds = selfIdentity.selfIds.length > 0 ? selfIdentity.selfIds : [user.id];

    // 1) Update otimista CROSS-ABA: abate da store global ANTES de tocar no
    //    estado local — assim o badge da navbar (qualquer aba) cai na hora.
    const store = useUnreadChatStore.getState();
    ids.forEach((id) => {
      const conv = conversationsRef.current.find((c) => c.id === id);
      const prevUnread = conv?.unread_count ?? 0;
      if (prevUnread > 0 && !conv?.self_is_archived) {
        store.markConversationOptimisticRead(id, prevUnread);
      }
    });

    // 2) Optimistic local — zera o unread_count na lista da Inbox e ATUALIZA
    //    o `last_read_at` próprio em participants (fonte de verdade nova do
    //    cálculo de não lido). Sem isso, ao remontar a tela o snapshot
    //    re-hidratado do cache mantinha o contador antigo.
    const nowIso = new Date().toISOString();
    setConversations(prev => {
      const next = prev.map(conv =>
        ids.includes(conv.id)
          ? {
              ...conv,
              unread_count: 0,
              participants: conv.participants.map(part =>
                selfIds.includes(part.user_id)
                  ? { ...part, last_read_at: nowIso }
                  : part,
              ),
            }
          : conv,
      );
      // Reflete imediatamente no cache de sessão — evita "voltar 3" ao remontar.
      try { writeConversationsCache(user.id, next); } catch { /* noop */ }
      return next;
    });

    // 3) Persistência real no banco. `last_read_at` em conversation_participants
    //    é o que conta agora — mesmo se o UPDATE em messages falhar por RLS,
    //    o cálculo de não lidos passa a usar last_read_at e segue correto.
    await persistReadState(ids, selfIds);

    // 4) Libera o "pendingReads" daquela conversa: a partir daqui o próximo
    //    fetch do inbox já trará unread=0 e o cálculo casará sozinho.
    ids.forEach((id) => useUnreadChatStore.getState().clearPendingForConversation(id));
  }, [user, persistReadState]);

  const markTabAsRead = useCallback(async (tab: ConversationTab) => {
    const targetIds = conversations
      .filter((conv) => tab === 'inbox' ? !conv.self_is_archived : conv.self_is_archived)
      .filter((conv) => conv.unread_count > 0)
      .map((conv) => conv.id);

    if (targetIds.length === 0) return;
    await markAsRead(targetIds);
  }, [conversations, markAsRead]);

  const getOrCreateConversation = useCallback(async (otherUserId: string) => {
    if (!user) return { conversation: null, error: new Error('Not authenticated') };

    const { getOrCreateConversationId } = await import('@/lib/conversationsApi');
    const targetAuthId = await resolveAuthUserIdFromAnyId(otherUserId);
    const { id, error } = await getOrCreateConversationId(user.id, targetAuthId || otherUserId);

    if (error || !id) {
      return { conversation: null, error: error ?? new Error('No conversation id') };
    }

    return { conversation: { id }, error: null };
  }, [user]);

  const archiveConversation = useCallback(async (conversationId: string) => {
    if (!user) return;

    const selfIdentity = await resolveChatIdentity(user.id);
    const selfIds = selfIdentity.selfIds.length > 0 ? selfIdentity.selfIds : [user.id];

    await supabase
      .from('conversation_participants')
      .update({ is_archived: true })
      .eq('conversation_id', conversationId)
      .in('user_id', selfIds);

  }, [user, fetchConversations]);

  // Sidebar badge: contagem real de mensagens não lidas apenas na caixa de
  // entrada (ignora conversas arquivadas), espelhando exatamente o que o
  // usuário vê em /messages → aba Inbox.
  const totalUnreadCount = computeTotalUnreadFromConversations(conversations);

  // Empurra para a store global — qualquer componente (MobileNavbar, etc.)
  // que ler `useUnreadChatStore` cai INSTANTANEAMENTE quando o usuário lê
  // uma conversa (markAsRead → setConversations otimista → este efeito).
  const setStoreUnread = useUnreadChatStore((s) => s.setTotalUnreadCount);
  useEffect(() => {
    setStoreUnread(totalUnreadCount);
  }, [totalUnreadCount, setStoreUnread]);

  return {
    conversations,
    loading,
    typingUsers,
    totalUnreadCount,
    connectionStatus,
    sendMessage,
    setTyping: setTypingFn,
    markAsRead,
    markTabAsRead,
    activeConversationId,
    setActiveConversation,
    getOrCreateConversation,
    archiveConversation,
    refetch: fetchConversations,
  };
}
