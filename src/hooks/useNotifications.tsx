import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import { Heart, Eye, UserPlus, Crown, MessageCircle, Flame, Sparkles, Lock, AtSign, Reply, Calendar, Star } from 'lucide-react';
import React from 'react';
import { extractNotificationActorId, getNotificationDisplayTitle, getNotificationDisplayBody } from '@/lib/notificationActors';
import { isChatBlockedBetween } from '@/lib/chatIdentity';
import { resolveNotificationTarget } from '@/lib/notificationTarget';

type RawNotificationType =
  | 'message'
  | 'like'
  | 'save'
  | 'share'
  | 'subscription'
  | 'follow'
  | 'comment'
  | 'visit'
  | 'unlock'
  | 'looking_now'
  | 'looking_now_match'
  | 'mention'
  | 'reply'
  | 'gift_received'
  | 'goal_contribution'
  | 'balance_frozen'
  | 'verification_rejected'
  | 'event_chat'
  | 'super_dm'
  | 'match'
  | 'superlike'
  | 'support_response'
  | 'attention_ping'
  | 'system'
  | 'new_message'
  | 'new_follower'
  | 'post_like'
  | 'post_comment'
  | 'oculto_play_new';

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  post_id: string | null;
  type: RawNotificationType;
  title: string;
  body: string | null;
  data: Json | null;
  is_read: boolean;
  created_at: string;
}

const normalizeNotificationType = (type: string | null | undefined): RawNotificationType => {
  switch (type) {
    case 'new_message':
      return 'message';
    case 'new_follower':
      return 'follow';
    case 'post_like':
      return 'like';
    case 'post_comment':
      return 'comment';
    default:
      return (type || 'system') as RawNotificationType;
  }
};

const extractNotificationMeta = (row: any) => {
  const rawData = (row?.data || {}) as Record<string, any>;
  const data = rawData?.notification_subtype === 'save' && !rawData?.notification_type
    ? { ...rawData, notification_type: 'save' }
    : rawData;
  const body = row?.body || row?.message || null;

  return {
    actor_id: extractNotificationActorId({ actor_id: row?.actor_id, data, title: row?.title, body, message: row?.message, type: row?.type }),
    post_id: row?.post_id || row?.related_id || data?.post_id || null,
    body,
    data,
  };
};

// Extended toast config — created once, never re-rendered
const toastConfig: Record<string, { icon: React.ReactNode; className: string }> = {
  like: { icon: React.createElement(Heart, { className: "h-4 w-4 text-primary fill-primary" }), className: "border-primary/30" },
  visit: { icon: React.createElement(Eye, { className: "h-4 w-4 text-purple-400" }), className: "border-purple-400/30" },
  follow: { icon: React.createElement(UserPlus, { className: "h-4 w-4 text-green-400" }), className: "border-green-400/30" },
  subscription: { icon: React.createElement(Crown, { className: "h-4 w-4 text-yellow-400" }), className: "border-yellow-400/30" },
  message: { icon: React.createElement(MessageCircle, { className: "h-4 w-4 text-blue-400" }), className: "border-blue-400/30" },
  comment: { icon: React.createElement(MessageCircle, { className: "h-4 w-4 text-cyan-400" }), className: "border-cyan-400/30" },
  mention: { icon: React.createElement(AtSign, { className: "h-4 w-4 text-primary" }), className: "border-primary/30" },
  reply: { icon: React.createElement(Reply, { className: "h-4 w-4 text-green-400" }), className: "border-green-400/30" },
  unlock: { icon: React.createElement(Lock, { className: "h-4 w-4 text-amber-400" }), className: "border-amber-400/30" },
  looking_now: { icon: React.createElement(Flame, { className: "h-4 w-4 text-orange-500" }), className: "border-orange-500/30" },
  looking_now_match: {
    icon: React.createElement('div', { className: "relative" },
      React.createElement(Flame, { className: "h-4 w-4 text-yellow-400" }),
      React.createElement(Sparkles, { className: "absolute -top-1 -right-1 h-2.5 w-2.5 text-yellow-300" })
    ),
    className: "border-yellow-400/50 bg-gradient-to-r from-orange-500/10 to-yellow-500/10"
  },
  event_chat: { icon: React.createElement(Calendar, { className: "h-4 w-4 text-purple-400" }), className: "border-purple-400/30" },
  super_dm: {
    icon: React.createElement('div', { className: "relative" },
      React.createElement(Crown, { className: "h-4 w-4 text-amber-400" }),
      React.createElement(Sparkles, { className: "absolute -top-1 -right-1 h-2.5 w-2.5 text-yellow-300" })
    ),
    className: "border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-yellow-400/10"
  },
  match: {
    icon: React.createElement(Heart, { className: "h-4 w-4 text-pink-500 fill-pink-500" }),
    className: "border-pink-500/50 bg-gradient-to-r from-pink-500/20 to-rose-400/10"
  },
  superlike: {
    icon: React.createElement(Star, { className: "h-4 w-4 text-cyan-400 fill-cyan-400" }),
    className: "border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 to-blue-400/10"
  },
};

// ---------------------------------------------------------------------------
// Dedup global de toasts de notificação
// ---------------------------------------------------------------------------
// `useNotifications` é montado em vários lugares (sidebar, bell, drawer, etc).
// Cada montagem assina o realtime e dispararia seu próprio toast, gerando
// 3+ avisos idênticos sobre a mesma notificação. O cache abaixo garante que
// CADA id de notificação só dispara UM toast em toda a aplicação.
const _shownToastIds = new Map<string, number>();
const _TOAST_DEDUP_MS = 15_000;
function _shouldShowToastFor(id: string | undefined | null): boolean {
  if (!id) return true;
  const now = Date.now();
  for (const [k, ts] of _shownToastIds) {
    if (now - ts > _TOAST_DEDUP_MS) _shownToastIds.delete(k);
  }
  if (_shownToastIds.has(id)) return false;
  _shownToastIds.set(id, now);
  return true;
}

const PAGE_SIZE = 20;

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCountState] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isVisibleRef = useRef(!document.hidden);
  const pendingQueueRef = useRef<Notification[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const loadingMoreRef = useRef(false);

  // --- Coalesced unreadCount writes: avoid flicker when many reads happen quickly ---
  const unreadRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);
  const setUnreadCount = useCallback((updater: number | ((prev: number) => number)) => {
    const next = typeof updater === 'function'
      ? (updater as (p: number) => number)(unreadRef.current)
      : updater;
    const safe = Math.max(0, next | 0);
    if (safe === unreadRef.current) return;
    unreadRef.current = safe;
    if (flushTimerRef.current != null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      setUnreadCountState(unreadRef.current);
    }, 80);
  }, []);
  useEffect(() => () => {
    if (flushTimerRef.current != null) window.clearTimeout(flushTimerRef.current);
  }, []);

  // --- Visibility tracking: queue updates when hidden, flush when visible ---
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
      if (!document.hidden && pendingQueueRef.current.length > 0) {
        // Flush queued notifications in a single batch via requestAnimationFrame
        const queued = pendingQueueRef.current.splice(0);
        requestAnimationFrame(() => {
          setNotifications(prev => [...queued, ...prev]);
          setUnreadCount(prev => prev + queued.length);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Cross-instance + cross-tab sync: when one hook instance (in any tab) marks
  // notifications as read, every other instance updates immediately.
  useEffect(() => {
    const applyReadSync = (detail: any) => {
      if (!detail) return;
      if (detail.all) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
        return;
      }
      const ids: string[] = Array.isArray(detail.ids) ? detail.ids : [];
      if (!ids.length) return;
      // The dispatcher only fires the event if the notif was actually unread,
      // so decrementing by ids.length is safe even when this instance hasn't
      // loaded the notif in its local list (e.g. sidebar/header badge).
      setUnreadCount(c => Math.max(0, c - ids.length));
      setNotifications(prev =>
        prev.map(n => (ids.includes(n.id) && !n.is_read ? { ...n, is_read: true } : n))
      );
    };

    // Same-tab events
    const handleReadSync = (e: Event) => applyReadSync((e as CustomEvent).detail);
    window.addEventListener('notifications:read', handleReadSync as EventListener);

    // Cross-tab via BroadcastChannel (preferred)
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined' && user?.id) {
        bc = new BroadcastChannel(`notifications:${user.id}`);
        bc.onmessage = (ev) => {
          if (ev?.data?.type === 'read') applyReadSync(ev.data.detail);
        };
      }
    } catch { /* no-op */ }

    // Cross-tab fallback via storage event (Safari/older browsers without BC)
    const STORAGE_KEY = `notifications:read:${user?.id || 'anon'}`;
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try { applyReadSync(JSON.parse(e.newValue).detail); } catch { /* no-op */ }
    };
    window.addEventListener('storage', handleStorage);

    // Also broadcast outgoing same-tab events to other tabs
    const handleOutgoing = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      try { bc?.postMessage({ type: 'read', detail }); } catch { /* no-op */ }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), detail }));
      } catch { /* no-op */ }
    };
    window.addEventListener('notifications:read', handleOutgoing as EventListener);

    return () => {
      window.removeEventListener('notifications:read', handleReadSync as EventListener);
      window.removeEventListener('notifications:read', handleOutgoing as EventListener);
      window.removeEventListener('storage', handleStorage);
      try { bc?.close(); } catch { /* no-op */ }
    };
  }, [user?.id, setUnreadCount]);

  // Play match sound — only if no media is playing
  const playMatchSound = useCallback(() => {
    try {
      // Don't interrupt playing media
      const mediaPlaying = document.querySelectorAll('audio, video');
      for (const el of mediaPlaying) {
        if (!(el as HTMLMediaElement).paused) return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(659.25, now + 0.1);
      osc1.frequency.setValueAtTime(783.99, now + 0.2);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(392, now);
      osc2.frequency.setValueAtTime(493.88, now + 0.1);
      osc2.frequency.setValueAtTime(587.33, now + 0.2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.setValueAtTime(0.2, now + 0.15);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc1.start(now); osc2.start(now);
      osc1.stop(now + 0.6); osc2.stop(now + 0.6);
    } catch { /* silent */ }
  }, []);

  // Play Super DM sound — only if no media is playing
  const playSuperDmSound = useCallback(() => {
    try {
      const mediaPlaying = document.querySelectorAll('audio, video');
      for (const el of mediaPlaying) {
        if (!(el as HTMLMediaElement).paused) return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const frequencies = [523.25, 659.25, 783.99, 1046.50];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        g.gain.setValueAtTime(0, now + i * 0.1);
        g.gain.linearRampToValueAtTime(0.18, now + i * 0.1 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.35);
        osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.35);
      });
      const shimmer = ctx.createOscillator();
      const sg = ctx.createGain();
      shimmer.connect(sg); sg.connect(ctx.destination);
      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(1318.51, now + 0.4);
      sg.gain.setValueAtTime(0, now + 0.4);
      sg.gain.linearRampToValueAtTime(0.08, now + 0.45);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      shimmer.start(now + 0.4); shimmer.stop(now + 0.8);
    } catch { /* silent */ }
  }, []);

  const triggerVibration = useCallback(() => {
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);
  }, []);

  const triggerSuperDmVibration = useCallback(() => {
    if ('vibrate' in navigator) navigator.vibrate([50, 30, 50, 30, 50, 30, 200, 50, 200]);
  }, []);

  const filterBlockedMessageNotifications = useCallback(async (items: Notification[]) => {
    if (!user?.id || items.length === 0) return items;
    const checked = await Promise.all(items.map(async (notification) => {
      const senderId = (notification.data as any)?.sender_id || notification.actor_id;
      if ((notification.type === 'message' || notification.type === 'new_message' || notification.type === 'attention_ping') && senderId) {
        if (await isChatBlockedBetween(senderId, user.id)) return null;
      }
      return notification;
    }));
    return checked.filter((notification): notification is Notification => Boolean(notification));
  }, [user?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!user) { setNotifications([]); setLoading(false); setHasMore(false); setUnreadCount(0); return; }
    try {
      setLoading(true);

      // Parallelize the data fetch with the unread count head-query so the
      // badge reflects the correct number on the very first paint, before
      // any realtime event arrives.
      const [listRes, countRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1),
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      if (listRes.error) throw listRes.error;
      const typedData: Notification[] = (listRes.data || []).map(n => ({
        ...n,
        body: n.body || n.message || null,
        ...extractNotificationMeta(n),
        type: normalizeNotificationType(n.type),
      }));
      const visibleData = await filterBlockedMessageNotifications(typedData);
      setNotifications(visibleData);
      setHasMore((listRes.data?.length || 0) === PAGE_SIZE);
      // Force-flush the count immediately (bypass coalescing) so badges hydrate fast
      const unreadRows: Notification[] = (countRes.data || []).map(n => ({
        ...n,
        body: n.body || n.message || null,
        ...extractNotificationMeta(n),
        type: normalizeNotificationType(n.type),
      }));
      const fresh = (await filterBlockedMessageNotifications(unreadRows)).length;
      unreadRef.current = fresh;
      setUnreadCountState(fresh);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [user, filterBlockedMessageNotifications]);

  const loadMore = useCallback(async () => {
    if (!user || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const offset = notifications.length;
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const typedData: Notification[] = (data || []).map(n => ({
        ...n,
        body: n.body || n.message || null,
        ...extractNotificationMeta(n),
        type: normalizeNotificationType(n.type),
      }));
      const visibleData = await filterBlockedMessageNotifications(typedData);
      // Dedupe by id (real-time inserts may overlap)
      setNotifications(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...visibleData.filter(n => !seen.has(n.id))];
      });
      setHasMore((data?.length || 0) === PAGE_SIZE);
    } catch { /* silent */ } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [user, hasMore, notifications.length, filterBlockedMessageNotifications]);

  const sendNativePush = useCallback(async (notification: Notification) => {
    try {
      if (!document.hidden) return;
      const senderId = (notification.data as any)?.sender_id || notification.actor_id;
      if ((notification.type === 'message' || notification.type === 'new_message' || notification.type === 'attention_ping') && senderId) {
        if (await isChatBlockedBetween(senderId, user?.id)) return;
      }
      await supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: notification.user_id,
          sender_id: senderId || undefined,
          title: notification.title,
          body: notification.body || '',
          // Mesmo destino do clique no sino (regra única).
          url: (await resolveNotificationTarget(notification as any)).url,
          type: notification.type,
        }
      });
    } catch { /* silent */ }
  }, [user?.id]);

  // --- Realtime subscription with visibility-aware lifecycle ---
  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    // Migrado para realtimeBus — canal único compartilhado em `notifications`.
    // Filtragem por user_id é feita no handler (substitui filter server-side).
    const unsubInsert = subscribeTable('notifications', async (payload: any) => {
      const raw = payload.new as any;
      if (!raw || raw.user_id !== user.id) return;
      // Skip seed/test notifications em realtime (memória: is_seed filtering)
      if (raw?.is_seed === true) return;
      const rawType = normalizeNotificationType(raw.type);
      const senderId = (raw.data as any)?.sender_id || raw.actor_id;
      if ((rawType === 'message' || raw.type === 'new_message' || raw.type === 'attention_ping') && senderId) {
        if (await isChatBlockedBetween(senderId, user.id)) return;
      }
      const newNotif: Notification = {
        ...raw,
        body: raw.body || raw.message || null,
        ...extractNotificationMeta(raw),
        type: normalizeNotificationType(raw.type),
      };

      // If tab hidden: queue for later, send native push, skip toast/sound
      if (!isVisibleRef.current) {
        pendingQueueRef.current.push(newNotif);
        await sendNativePush(newNotif);
        return;
      }

      const extendedType = (raw.data as any)?.notification_type;
      const isSuperDm = newNotif.type === 'super_dm';
      const displayType = isSuperDm ? 'super_dm' :
        ((extendedType === 'looking_now_match' || newNotif.type === 'looking_now_match') ? 'looking_now_match' : newNotif.type);
      const config = toastConfig[displayType] || toastConfig.message;

      if (isSuperDm) { playSuperDmSound(); triggerSuperDmVibration(); }
      else if (extendedType === 'looking_now_match' || newNotif.type === 'looking_now_match') { playMatchSound(); triggerVibration(); }

      requestAnimationFrame(() => {
        // Dedup global por id da notificação — impede toasts duplicados quando
        // o hook está montado em múltiplos componentes simultaneamente.
        if (!_shouldShowToastFor(newNotif.id)) return;
        // Sanitiza nome real → @username antes de exibir o toast.
        const safeTitle = getNotificationDisplayTitle(newNotif as any) || newNotif.title;
        const safeBody = getNotificationDisplayBody(newNotif as any) || newNotif.body || undefined;
        toast({ title: safeTitle, description: safeBody, className: config.className });
      });

      setNotifications(prev => {
        if (prev.some(n => n.id === newNotif.id)) return prev;
        return [newNotif, ...prev];
      });
      setUnreadCount(prev => prev + 1);
    }, { events: ['INSERT'] });

    const unsubUpdate = subscribeTable('notifications', (payload: any) => {
      const updated = payload.new as any;
      if (!updated || updated.user_id !== user.id) return;
      // Dedup por id contra o ESTADO LOCAL — não contra payload.old.
      // Se o mesmo UPDATE chegar 2x (re-subscribe, multi-handler, HMR),
      // o delta de unreadCount aplica no máximo uma vez por transição real
      // de is_read (false→true ou true→false).
      setNotifications(prev => {
        const idx = prev.findIndex(n => n.id === updated.id);
        if (idx < 0) {
          // Notificação ainda não está no estado local — apenas atualiza
          // o contador se vier marcada como não-lida (caso raro de UPDATE
          // antes do INSERT chegar). Sem alterar a lista para evitar
          // furo de ordenação; o próximo fetch consolida.
          return prev;
        }
        const localIsRead = prev[idx].is_read;
        const nextIsRead = !!updated.is_read;
        if (localIsRead !== nextIsRead) {
          // Ajuste de contador SOMENTE quando há transição real local→novo.
          setUnreadCount(c => Math.max(0, c + (nextIsRead ? -1 : 1)));
        }
        const next = prev.slice();
        next[idx] = { ...prev[idx], ...updated, ...extractNotificationMeta(updated), type: normalizeNotificationType(updated.type) };
        return next;
      });
    }, { events: ['UPDATE'] });


    const unsubDelete = subscribeTable('notifications', (payload: any) => {
      const removed = payload.old as any;
      if (!removed) return;
      // user_id pode não vir em DELETE dependendo da REPLICA IDENTITY — filtra por id local.
      setNotifications(prev => {
        const target = prev.find(n => n.id === removed.id);
        if (!target) return prev;
        if (!target.is_read) setUnreadCount(c => Math.max(0, c - 1));
        return prev.filter(n => n.id !== removed.id);
      });
    }, { events: ['DELETE'] });

    channelRef.current = null;

    // Fallback de resync — se o Realtime cair (aba dormindo, rede oscilando,
    // suspend/resume mobile), reconciliamos via REST ao voltar. Throttle de
    // 4s evita refetch em rajada quando vários eventos disparam juntos
    // (visibilitychange + online + focus). Mantém badge e estado de lida
    // alinhados com o servidor mesmo se algum UPDATE foi perdido.
    let lastResyncAt = 0;
    const resync = () => {
      const now = Date.now();
      if (now - lastResyncAt < 4000) return;
      lastResyncAt = now;
      void fetchNotifications();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') resync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', resync);
    window.addEventListener('focus', resync);

    return () => {
      unsubInsert();
      unsubUpdate();
      unsubDelete();
      channelRef.current = null;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', resync);
      window.removeEventListener('focus', resync);
    };
  }, [user, fetchNotifications, playMatchSound, triggerVibration, playSuperDmSound, triggerSuperDmVibration, sendNativePush]);


  // --- Unsubscribe when page is frozen/hidden for extended periods (battery saving) ---
  useEffect(() => {
    const handleFreeze = () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
    // 'freeze' event fires when browser suspends the page (mobile background)
    document.addEventListener('freeze', handleFreeze);
    // Also handle 'pagehide' for broader support
    window.addEventListener('pagehide', handleFreeze);
    return () => {
      document.removeEventListener('freeze', handleFreeze);
      window.removeEventListener('pagehide', handleFreeze);
    };
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;
    let wasUnread = false;
    setNotifications(prev =>
      prev.map(n => {
        if (n.id === notificationId) {
          if (!n.is_read) wasUnread = true;
          return { ...n, is_read: true };
        }
        return n;
      })
    );
    if (wasUnread) {
      setUnreadCount(prev => Math.max(0, prev - 1));
      window.dispatchEvent(new CustomEvent('notifications:read', { detail: { ids: [notificationId] } }));
    }
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('is_read', false);
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    window.dispatchEvent(new CustomEvent('notifications:read', { detail: { all: true } }));
  }, [user]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    // Optimistic removal — usa setState callback para evitar dep em `notifications`
    let wasUnread = false;
    setNotifications(prev => {
      const target = prev.find(n => n.id === notificationId);
      wasUnread = !!(target && !target.is_read);
      return prev.filter(n => n.id !== notificationId);
    });
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    await supabase.from('notifications').delete().eq('id', notificationId);
  }, [setUnreadCount]);

  const clearAllNotifications = useCallback(async () => {
    if (!user) return;
    // Optimistic: remove only read notifications, keep unread
    setNotifications(prev => prev.filter(n => !n.is_read));
    setUnreadCount(prev => prev); // unread count stays the same
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_read', true);
      if (error) {
        console.error('clearAllNotifications failed:', error);
        await fetchNotifications();
      }
    } catch (err) {
      console.error('clearAllNotifications error:', err);
      await fetchNotifications();
    }
  }, [user, fetchNotifications]);

  const createNotification = useCallback(async (
    targetUserId: string, type: Notification['type'], title: string,
    body?: string, actorId?: string, postId?: string, data?: Json
  ) => {
    if (targetUserId === user?.id) return;
    await supabase.from('notifications').insert([{
      user_id: targetUserId,
      type: type as string,
      title,
      body: body || null,
      data: {
        ...(data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}),
        ...(actorId ? { actor_id: actorId } : {}),
        ...(postId ? { post_id: postId } : {}),
      },
    }]);
  }, [user]);

  return {
    notifications,
    loading,
    loadingMore,
    hasMore,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    createNotification,
    loadMore,
    refetch: fetchNotifications,
  };
}
