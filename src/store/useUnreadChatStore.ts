import { create } from 'zustand';

/**
 * Store global do contador de mensagens não-lidas do chat.
 *
 * Por que existe?
 * - Antes, cada consumidor de `useChat` (MobileNavbar, LeftSidebar, MessagesPage,
 *   RealtimeInboxSidebar) mantinha sua própria lista de conversas. O badge da
 *   bottom nav só caía quando o realtime UPDATE de `is_read` chegava, com
 *   throttle/refetch — visualmente travava ao abrir uma conversa.
 * - Agora `useChat` empurra `totalUnreadCount` para esta store sempre que sua
 *   lista interna muda (incluindo o update otimista do `markAsRead`). Qualquer
 *   componente que ler `useUnreadChatStore` cai INSTANTANEAMENTE quando o
 *   usuário abre/lê uma conversa, em qualquer instância do hook.
 *
 * Sync entre abas:
 * - Usa BroadcastChannel('oculto:chat-unread') (com fallback para `storage` event)
 *   para replicar o número e os updates otimistas em tempo real para outras abas
 *   abertas do mesmo usuário — sem precisar de novo round-trip ao banco.
 *
 * Helpers:
 *  - `computeTotalUnreadFromConversations` — fonte única de verdade do cálculo.
 *  - `markConversationOptimisticRead(convId, prevUnread)` — usado pelo hook
 *    para abater na hora ao abrir uma conversa (badge cai instantaneamente,
 *    o refetch confirma depois).
 */

const CHANNEL_NAME = 'oculto:chat-unread';
const STORAGE_KEY = 'oculto.chat-unread.v1';

interface UnreadChatState {
  totalUnreadCount: number;
  /** Tick local — incrementa a cada update; serve como "versão" para descartar mensagens antigas entre abas. */
  version: number;
  /** Updates otimistas pendentes por conversa — abatidos do total bruto recebido do fetch. */
  pendingReads: Record<string, number>;

  setTotalUnreadCount: (count: number, opts?: { broadcast?: boolean }) => void;
  markConversationOptimisticRead: (
    conversationId: string,
    previousUnread: number,
    opts?: { broadcast?: boolean },
  ) => void;
  clearPendingForConversation: (conversationId: string) => void;
  reset: () => void;
}

// ---------- Cross-tab plumbing ----------
let bc: BroadcastChannel | null = null;
let bootstrapped = false;

interface BroadcastPayload {
  type: 'set' | 'optimistic-read' | 'reset';
  count?: number;
  conversationId?: string;
  delta?: number;
  version: number;
  ts: number;
}

function getBroadcast(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (bc) return bc;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    bc = null;
  }
  return bc;
}

function publish(payload: Omit<BroadcastPayload, 'ts'>) {
  if (typeof window === 'undefined') return;
  const full: BroadcastPayload = { ...payload, ts: Date.now() };
  try {
    getBroadcast()?.postMessage(full);
  } catch {
    /* ignore */
  }
  // Fallback para navegadores sem BroadcastChannel: dispara `storage` event.
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

export const useUnreadChatStore = create<UnreadChatState>((set, get) => ({
  totalUnreadCount: 0,
  version: 0,
  pendingReads: {},

  setTotalUnreadCount: (count, opts) => {
    const safe = Math.max(0, count | 0);
    // Aplica os pendingReads como abatimento defensivo (caso o fetch venha
    // antes do persistReadState completar no banco).
    const pendingTotal = Object.values(get().pendingReads).reduce((a, b) => a + b, 0);
    const effective = Math.max(0, safe - pendingTotal);

    set((prev) => {
      if (prev.totalUnreadCount === effective) return prev;
      const nextVersion = prev.version + 1;
      if (opts?.broadcast !== false) {
        publish({ type: 'set', count: effective, version: nextVersion });
      }
      return { totalUnreadCount: effective, version: nextVersion };
    });
  },

  markConversationOptimisticRead: (conversationId, previousUnread, opts) => {
    if (!conversationId || previousUnread <= 0) return;
    set((prev) => {
      const nextVersion = prev.version + 1;
      const next = Math.max(0, prev.totalUnreadCount - previousUnread);
      if (opts?.broadcast !== false) {
        publish({
          type: 'optimistic-read',
          conversationId,
          delta: previousUnread,
          version: nextVersion,
        });
      }
      return {
        totalUnreadCount: next,
        version: nextVersion,
        pendingReads: { ...prev.pendingReads, [conversationId]: previousUnread },
      };
    });
  },

  clearPendingForConversation: (conversationId) => {
    set((prev) => {
      if (!(conversationId in prev.pendingReads)) return prev;
      const { [conversationId]: _omit, ...rest } = prev.pendingReads;
      return { pendingReads: rest };
    });
  },

  reset: () => {
    set({ totalUnreadCount: 0, version: 0, pendingReads: {} });
  },
}));

// ---------- Bootstrap dos listeners (uma vez por aba) ----------
export function bootstrapUnreadChatSync() {
  if (bootstrapped || typeof window === 'undefined') return;
  bootstrapped = true;

  const handle = (payload: BroadcastPayload | null) => {
    if (!payload) return;
    const current = useUnreadChatStore.getState();
    // Descarta mensagens antigas — só aplica se a versão recebida for > local.
    if (payload.version <= current.version) return;

    if (payload.type === 'set' && typeof payload.count === 'number') {
      useUnreadChatStore.setState({
        totalUnreadCount: Math.max(0, payload.count | 0),
        version: payload.version,
      });
    } else if (payload.type === 'optimistic-read' && payload.conversationId && payload.delta) {
      useUnreadChatStore.setState((prev) => ({
        totalUnreadCount: Math.max(0, prev.totalUnreadCount - (payload.delta || 0)),
        version: payload.version,
        pendingReads: {
          ...prev.pendingReads,
          [payload.conversationId!]: payload.delta || 0,
        },
      }));
    } else if (payload.type === 'reset') {
      useUnreadChatStore.setState({ totalUnreadCount: 0, version: payload.version, pendingReads: {} });
    }
  };

  const channel = getBroadcast();
  if (channel) {
    channel.addEventListener('message', (event) => {
      handle(event.data as BroadcastPayload);
    });
  }

  // Fallback: storage event funciona entre abas mesmo sem BroadcastChannel.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handle(JSON.parse(event.newValue) as BroadcastPayload);
    } catch {
      /* ignore */
    }
  });
}

/** Tipo mínimo que precisamos para somar — compatível com `Conversation` do `useChat`. */
export interface UnreadCountable {
  unread_count: number;
  self_is_archived?: boolean;
}

/**
 * Fonte única de verdade do cálculo do badge.
 * Regra: ignora conversas arquivadas (mesma regra usada na Inbox).
 */
export function computeTotalUnreadFromConversations(conversations: UnreadCountable[]): number {
  return conversations.reduce(
    (acc, conv) => (conv.self_is_archived ? acc : acc + (conv.unread_count || 0)),
    0,
  );
}
