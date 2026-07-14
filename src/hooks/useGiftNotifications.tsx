import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { playNewMessageSound } from '@/lib/messageSound';

interface GiftData {
  notificationId: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string;
  amount: number;
  message?: string;
}

export function useGiftNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [giftData, setGiftData] = useState<GiftData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const lastGiftShownAtRef = useRef<Map<string, number>>(new Map());

  // Persistência local: lista de gift IDs já exibidos (sobrevive a remount/reload).
  const SEEN_STORAGE_KEY = user ? `gift-modal-shown:${user.id}` : '';
  const loadShownIds = useCallback((): Set<string> => {
    if (!SEEN_STORAGE_KEY) return new Set();
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(arr);
    } catch { return new Set(); }
  }, [SEEN_STORAGE_KEY]);
  const persistShownId = useCallback((giftId: string) => {
    if (!SEEN_STORAGE_KEY) return;
    try {
      const set = loadShownIds();
      set.add(giftId);
      const arr = Array.from(set).slice(-500);
      localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr));
    } catch {/* silencioso */}
  }, [SEEN_STORAGE_KEY, loadShownIds]);

  const closeModal = useCallback(async () => {
    setIsOpen(false);

    const current = giftData;
    if (current?.notificationId && !current.notificationId.startsWith('gift:')) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', current.notificationId);
    }

    // Marca o presente como visto (DB + localStorage) para nunca reabrir
    const canonicalGiftId = current?.notificationId?.startsWith('gift:')
      ? current.notificationId.slice(5)
      : null;
    if (canonicalGiftId) {
      persistShownId(canonicalGiftId);
      try {
        await (supabase as any)
          .from('oculto_aura_xp_gifts')
          .update({ seen: true })
          .eq('id', canonicalGiftId);
      } catch {/* coluna pode não existir; guard local já protege */}
    }

    setTimeout(() => setGiftData(null), 300);
  }, [giftData, persistShownId]);

  useEffect(() => {
    if (!user) return;

    let active = true;

    const resolveOwnIds = async () => {
      const ids = new Set<string>([user.id]);
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, user_id')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .limit(2);
      (data ?? []).forEach((row: any) => {
        if (row?.id) ids.add(row.id);
        if (row?.user_id) ids.add(row.user_id);
      });
      return ids;
    };

    const openGiftModal = async (params: {
      eventKey: string;
      notificationId: string;
      senderLookupId?: string | null;
      amount?: number | null;
      message?: string | null;
      giftId?: string | null;
    }) => {
      if (!active || !params.senderLookupId) return;
      const canonicalGiftId = params.giftId ?? (params.notificationId.startsWith('gift:') ? params.notificationId.slice(5) : null);
      const dedupeKeys = [params.eventKey, canonicalGiftId ? `gift:${canonicalGiftId}` : null].filter(Boolean) as string[];
      if (dedupeKeys.some((key) => processedEventsRef.current.has(key))) return;
      // Guard persistente: já mostrado em sessão anterior
      if (canonicalGiftId && loadShownIds().has(canonicalGiftId)) {
        processedEventsRef.current.add(`gift:${canonicalGiftId}`);
        return;
      }
      if (canonicalGiftId) {
        const lastShownAt = lastGiftShownAtRef.current.get(canonicalGiftId);
        if (lastShownAt && Date.now() - lastShownAt < 15_000) return;
      }
      dedupeKeys.forEach((key) => processedEventsRef.current.add(key));
      if (canonicalGiftId) lastGiftShownAtRef.current.set(canonicalGiftId, Date.now());

      const { data: senderProfile } = await (supabase as any)
        .from('profiles')
        .select('id, user_id, name, username, avatar_url')
        .or(`user_id.eq.${params.senderLookupId},id.eq.${params.senderLookupId}`)
        .limit(1)
        .maybeSingle();

      if (!active || !senderProfile) return;

      playNewMessageSound();
      // Atualiza saldo XP e listas relacionadas em tempo real
      try {
        qc.invalidateQueries({ queryKey: ['profile', user?.id] });
        qc.invalidateQueries({ queryKey: ['aura-xp-gifts-received'] });
        qc.invalidateQueries({ queryKey: ['aura-xp-gifts-unseen'] });
        qc.invalidateQueries({ queryKey: ['aura-xp-gifts-ranking'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });
      } catch {}
      setGiftData({
        notificationId: params.notificationId,
        senderId: senderProfile.id,
        senderName: senderProfile.name || 'Usuário',
        senderUsername: senderProfile.username || 'usuario',
        senderAvatar: senderProfile.avatar_url || '',
        amount: Number(params.amount || 0),
        message: params.message ?? undefined,
      });
      if (active) setIsOpen(true);
    };

    const unsubNotifications = subscribeTable('notifications', async (payload: any) => {
      const notification = payload.new as {
        id: string;
        type: string;
        title: string;
        body: string;
        user_id?: string;
        data: {
          from_user_id?: string;
          amount?: number;
          message?: string;
        } | null;
      };
      if (notification?.user_id !== user.id) return;

      const giftTypes = ['tip_received', 'gift', 'unlock', 'gift_received'];
      if (!giftTypes.includes(notification.type)) return;
      const data = notification.data;
      await openGiftModal({
        eventKey: `notification:${notification.id}`,
        notificationId: notification.id,
        senderLookupId: data?.from_user_id ?? null,
        amount: data?.amount ?? 0,
        message: data?.message ?? null,
        giftId: (data as any)?.gift_id ?? null,
      });
    }, { events: ['INSERT'] });

    let unsubGifts: (() => void) | null = null;
    let ownIdsRef: Set<string> = new Set([user.id]);
    // Janela inicial larga (30 min) para cobrir presentes recebidos enquanto
    // o app estava em background no mobile. Após o primeiro catch-up vira
    // sliding window curto.
    let lastCheckIso = new Date(Date.now() - 30 * 60_000).toISOString();
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    // Catch-up: busca presentes recebidos recentemente que ainda não foram
    // exibidos (cobre cenários onde o realtime caiu — comum em mobile com
    // tela bloqueada/aba em background).
    const catchUpRecentGifts = async () => {
      if (!active || ownIdsRef.size === 0) return;
      const sinceIso = lastCheckIso;
      lastCheckIso = new Date().toISOString();
      try {
        const idsArray = Array.from(ownIdsRef);
        // Tenta filtrar seen=false (não reabrir presentes já vistos).
        // Faz fallback se a coluna `seen` não existir.
        let { data, error } = await (supabase as any)
          .from('oculto_aura_xp_gifts')
          .select('id, sender_id, receiver_id, amount, created_at, seen')
          .in('receiver_id', idsArray)
          .or('seen.is.null,seen.eq.false')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: true })
          .limit(5);
        if (error && /seen/i.test(String(error?.message || ''))) {
          const retry = await (supabase as any)
            .from('oculto_aura_xp_gifts')
            .select('id, sender_id, receiver_id, amount, created_at')
            .in('receiver_id', idsArray)
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: true })
            .limit(5);
          data = retry.data;
        }
        const shown = loadShownIds();
        for (const gift of (data ?? [])) {
          if (!gift?.id) continue;
          if (shown.has(gift.id)) continue;
          await openGiftModal({
            eventKey: `gift:${gift.id}`,
            notificationId: `gift:${gift.id}`,
            senderLookupId: gift.sender_id ?? null,
            amount: gift.amount ?? 0,
            message: null,
            giftId: gift.id,
          });
        }
      } catch { /* silencioso */ }
    };

    void (async () => {
      const ownIds = await resolveOwnIds();
      if (!active) return;
      ownIdsRef = ownIds;

      unsubGifts = subscribeTable('oculto_aura_xp_gifts', async (payload: any) => {
        const gift = payload.new as {
          id: string;
          sender_id?: string | null;
          receiver_id?: string | null;
          amount?: number | null;
        };

        if (!gift?.id || !gift.receiver_id || !ownIdsRef.has(gift.receiver_id)) return;

        await openGiftModal({
          eventKey: `gift:${gift.id}`,
          notificationId: `gift:${gift.id}`,
          senderLookupId: gift.sender_id ?? null,
          amount: gift.amount ?? 0,
          message: null,
          giftId: gift.id,
        });
      }, { events: ['INSERT'] });

      // Catch-up inicial (gifts dos últimos 30 min ainda não exibidos)
      catchUpRecentGifts();

      // Fallback: polling a cada 45s enquanto a aba está visível.
      // O canal Realtime acima é o caminho principal; o polling só existe
      // como safety-net e para catch-up após reconexão silenciosa.
      // (era 6s — reduzido para diminuir carga em toda navegação.)
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          catchUpRecentGifts();
        }
      }, 45000);
    })();

    // Fallback mobile: ao voltar do background, refazer catch-up imediato.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        catchUpRecentGifts();
      }
    };
    const onFocus = () => catchUpRecentGifts();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      if (pollTimer) clearInterval(pollTimer);
      unsubNotifications();
      if (unsubGifts) unsubGifts();
    };
  }, [user]);

  return {
    giftData,
    isOpen,
    closeModal,
  };
}
