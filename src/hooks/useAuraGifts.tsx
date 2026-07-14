import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';

export interface AuraGiftRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  created_at: string;
  seen: boolean;
  thanked_at?: string | null;
  sender?: {
    id: string;
    user_id: string | null;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
    profile_type: string | null;
    address_city: string | null;
    address_state: string | null;
  } | null;
}


export interface AuraGiftRankRow {
  sender_profile_id: string;
  total_xp: number;
  gifts_count: number;
  sender?: AuraGiftRow['sender'];
}

export interface AuraGiftSentRow extends AuraGiftRow {
  receiver?: AuraGiftRow['sender'];
}

const RECEIVED_KEY = ['aura-gifts-received'];
const UNSEEN_KEY = ['aura-gifts-unseen'];
const RANK_KEY = ['aura-gifts-rank'];
const GLOBAL_RANK_KEY = ['aura-gifts-global-rank'];
const SENT_KEY = ['aura-gifts-sent'];

/** Resolve TODOS os identificadores válidos para o usuário logado:
 *  profile.id e auth.user_id. Presentes podem ter receiver_id/sender_id
 *  armazenados como qualquer um dos dois — buscamos por ambos. */
async function resolveMyIds(authUserId: string): Promise<string[]> {
  const ids = new Set<string>([authUserId]);
  try {
    const { data } = await (supabase as any)
      .from('v_public_profiles')
      .select('id, user_id')
      .or(`id.eq.${authUserId},user_id.eq.${authUserId}`)
      .limit(2);
    (data ?? []).forEach((p: any) => {
      if (p?.id) ids.add(p.id);
      if (p?.user_id) ids.add(p.user_id);
    });
  } catch {/* segue com auth uid */}
  return Array.from(ids);
}

async function selectGifts(field: 'receiver_id' | 'sender_id', ids: string[]) {
  const baseCols = 'id, sender_id, receiver_id, amount, created_at';
  const withExtras = `${baseCols}, seen, thanked_at`;
  const inList = `(${ids.map((id) => `"${id}"`).join(',')})`;
  let { data, error } = await (supabase as any)
    .from('oculto_aura_xp_gifts')
    .select(withExtras)
    .filter(field, 'in', inList)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error && /(seen|thanked_at)/i.test(String(error?.message || ''))) {
    // Fallback: alguma coluna opcional ainda não existe no DB
    const fallbackCols = `${baseCols}, seen`;
    let retry = await (supabase as any)
      .from('oculto_aura_xp_gifts')
      .select(fallbackCols)
      .filter(field, 'in', inList)
      .order('created_at', { ascending: false })
      .limit(500);
    if (retry.error && /seen/i.test(String(retry.error?.message || ''))) {
      retry = await (supabase as any)
        .from('oculto_aura_xp_gifts')
        .select(baseCols)
        .filter(field, 'in', inList)
        .order('created_at', { ascending: false })
        .limit(500);
    }
    data = retry.data;
    error = retry.error;
  }
  if (error) return [];
  return (data ?? []).map((r: any) => ({ seen: false, thanked_at: null, ...r })) as AuraGiftRow[];
}


async function fetchProfilesByIds(ids: string[]) {
  if (ids.length === 0) return new Map<string, any>();
  const orExpr = ids.map((u) => `user_id.eq.${u},id.eq.${u}`).join(',');
  const { data: profiles } = await (supabase as any)
    .from('v_public_profiles')
    .select('id, user_id, username, name, avatar_url, profile_type')
    .or(orExpr);
  const byKey = new Map<string, any>();
  (profiles ?? []).forEach((p: any) => {
    if (p.user_id) byKey.set(p.user_id, p);
    if (p.id) byKey.set(p.id, p);
  });
  return byKey;
}

/** Lista de presentes XP recebidos pelo usuário logado (com perfil do remetente). */
export function useAuraGiftsReceived() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...RECEIVED_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AuraGiftRow[]> => {
      const myIds = await resolveMyIds(user!.id);
      const rows = await selectGifts('receiver_id', myIds);
      if (rows.length === 0) return [];
      const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)));
      const byKey = await fetchProfilesByIds(senderIds);
      return rows.map((r) => ({ ...r, sender: byKey.get(r.sender_id) ?? null }));
    },
  });
}

/** Lista de presentes XP ENVIADOS pelo usuário logado (com perfil do destinatário). */
export function useAuraGiftsSent() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...SENT_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AuraGiftSentRow[]> => {
      const myIds = await resolveMyIds(user!.id);
      const rows = await selectGifts('sender_id', myIds);
      if (rows.length === 0) return [];
      const receiverIds = Array.from(new Set(rows.map((r) => r.receiver_id)));
      const byKey = await fetchProfilesByIds(receiverIds);
      return rows.map((r) => ({ ...r, receiver: byKey.get(r.receiver_id) ?? null }));
    },
  });
}

/** Contagem de presentes XP NÃO vistos pelo usuário logado. */
export function useAuraGiftsUnseenCount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...UNSEEN_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<number> => {
      const rpc = await (supabase as any).rpc('aura_xp_gifts_unseen_count');
      if (!rpc.error) return Number(rpc.data ?? 0);
      const myIds = await resolveMyIds(user!.id);
      const rows = await selectGifts('receiver_id', myIds);
      return rows.filter((r) => r.seen === false).length;
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable('oculto_aura_xp_gifts', () => {
      qc.invalidateQueries({ queryKey: UNSEEN_KEY });
      qc.invalidateQueries({ queryKey: RECEIVED_KEY });
      qc.invalidateQueries({ queryKey: RANK_KEY });
      qc.invalidateQueries({ queryKey: SENT_KEY });
    });
    return () => { unsub(); };
  }, [user?.id, qc]);


  return q;
}

/** Ranking acumulado de quem mais te enviou presentes XP.
 *  Inclui TODAS as fontes (feed/posts, boas-vindas, master e chat). */
export function useAuraGiftsRanking() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...RANK_KEY, user?.id, 'v2-all-sources'],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AuraGiftRankRow[]> => {
      const myIds = await resolveMyIds(user!.id);
      if (myIds.length === 0) return [];

      // 1) oculto_aura_xp_gifts (feed/posts/welcome/master)
      const auraRows = await selectGifts('receiver_id', myIds);

      // 2) gift_history (chat) — receiver_id é profile.id
      const inList = `(${myIds.map((id) => `"${id}"`).join(',')})`;
      const { data: chatRows } = await (supabase as any)
        .from('gift_history')
        .select('sender_id, receiver_id, amount, created_at, is_visible')
        .filter('receiver_id', 'in', inList)
        .order('created_at', { ascending: false })
        .limit(2000);

      type Row = { sender_id: string; amount: number | null };
      const allRows: Row[] = [];
      auraRows.forEach((g) => allRows.push({ sender_id: g.sender_id, amount: g.amount }));
      (chatRows ?? []).forEach((g: any) => {
        if (g.is_visible === false) return;
        if (!g.sender_id) return;
        allRows.push({ sender_id: g.sender_id, amount: g.amount });
      });
      if (allRows.length === 0) return [];

      // 3) Agrega por sender_id RAW
      const accRaw = new Map<string, { total: number; count: number }>();
      allRows.forEach((g) => {
        const cur = accRaw.get(g.sender_id) ?? { total: 0, count: 0 };
        cur.total += Number(g.amount || 0);
        cur.count += 1;
        accRaw.set(g.sender_id, cur);
      });

      // 4) Resolve perfis e re-agrega por identidade canônica (profile.id)
      const rawIds = Array.from(accRaw.keys());
      const byKey = await fetchProfilesByIds(rawIds);
      const accCanon = new Map<
        string,
        { total: number; count: number; profile: any | null }
      >();
      rawIds.forEach((rid) => {
        const profile = byKey.get(rid) ?? null;
        const canonical: string = profile?.id ?? rid;
        const cur = accCanon.get(canonical) ?? { total: 0, count: 0, profile };
        const raw = accRaw.get(rid)!;
        cur.total += raw.total;
        cur.count += raw.count;
        if (!cur.profile && profile) cur.profile = profile;
        accCanon.set(canonical, cur);
      });

      return Array.from(accCanon.entries())
        .map(([cid, v]) => ({
          sender_profile_id: cid,
          total_xp: v.total,
          gifts_count: v.count,
          sender: v.profile,
        }))
        .sort((a, b) => b.total_xp - a.total_xp);
    },
  });
}


/** Ranking GLOBAL do app: quem mais RECEBE presentes XP (top N).
 *  Usa o RPC `aura_gifts_global_ranking` (SECURITY DEFINER) — necessário
 *  porque o RLS de gifts só expõe ao usuário logado as próprias linhas,
 *  o que truncaria a agregação no cliente.
 *
 *  Fontes contadas pelo RPC: oculto_aura_xp_gifts + gift_history (visíveis),
 *  já resolvido por identidade canônica (profile.id).
 *
 *  Fallback: se o RPC ainda não estiver instalado, faz a agregação no cliente
 *  (parcial, mas evita tela vazia em ambientes legados). */
export function useAuraGiftsGlobalRanking(limit: number = 20) {
  return useQuery({
    queryKey: [...GLOBAL_RANK_KEY, limit, 'v5-profiles-count'],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AuraGiftRankRow[]> => {
      // 1) Tenta o RPC server-side (recomendado, sem viés de RLS)
      const rpc = await (supabase as any).rpc('aura_gifts_global_ranking', {
        p_limit: limit,
      });
      if (!rpc.error && Array.isArray(rpc.data)) {
        return (rpc.data as any[]).map((r) => ({
          sender_profile_id: r.profile_id ?? r.user_id ?? '',
          total_xp: Number(r.total_xp ?? 0),
          gifts_count: Number(r.gifts_count ?? 0),
          sender: {
            id: r.profile_id,
            user_id: r.user_id,
            username: r.username,
            name: r.name,
            avatar_url: r.avatar_url,
            profile_type: r.profile_type,
            address_city: r.address_city,
            address_state: r.address_state,
          },
        })).sort((a, b) => {
          if (b.gifts_count !== a.gifts_count) return b.gifts_count - a.gifts_count;
          if (b.total_xp !== a.total_xp) return b.total_xp - a.total_xp;
          return String(a.sender_profile_id).localeCompare(String(b.sender_profile_id));
        });
      }

      // 2) Fallback (legado): agregação client-side, sujeita ao RLS do usuário
      const [auraRes, chatRes] = await Promise.all([
        (supabase as any)
          .from('oculto_aura_xp_gifts')
          .select('receiver_id, amount, created_at')
          .order('created_at', { ascending: false })
          .limit(5000),
        (supabase as any)
          .from('gift_history')
          .select('receiver_id, amount, created_at, is_visible')
          .order('created_at', { ascending: false })
          .limit(5000),
      ]);

      type Row = { receiver_id: string; amount: number | null };
      const allRows: Row[] = [];
      if (!auraRes.error && Array.isArray(auraRes.data)) {
        allRows.push(...(auraRes.data as Row[]));
      }
      if (!chatRes.error && Array.isArray(chatRes.data)) {
        (chatRes.data as any[]).forEach((g) => {
          if (g.is_visible === false) return;
          allRows.push({ receiver_id: g.receiver_id, amount: g.amount });
        });
      }
      if (allRows.length === 0) return [];

      const accRaw = new Map<string, { total: number; count: number }>();
      allRows.forEach((g) => {
        if (!g.receiver_id) return;
        const cur = accRaw.get(g.receiver_id) ?? { total: 0, count: 0 };
        cur.total += Number(g.amount || 0);
        cur.count += 1;
        accRaw.set(g.receiver_id, cur);
      });

      const rawIds = Array.from(accRaw.keys());
      const byKey = await fetchProfilesByIds(rawIds);
      const accCanon = new Map<
        string,
        { total: number; count: number; profile: any | null }
      >();
      rawIds.forEach((rid) => {
        const profile = byKey.get(rid) ?? null;
        const canonical: string = profile?.id ?? rid;
        const cur = accCanon.get(canonical) ?? { total: 0, count: 0, profile };
        const raw = accRaw.get(rid)!;
        cur.total += raw.total;
        cur.count += raw.count;
        if (!cur.profile && profile) cur.profile = profile;
        accCanon.set(canonical, cur);
      });

      return Array.from(accCanon.entries())
        .sort((a, b) => {
          if (b[1].count !== a[1].count) return b[1].count - a[1].count;
          if (b[1].total !== a[1].total) return b[1].total - a[1].total;
          return String(a[0]).localeCompare(String(b[0]));
        })
        .slice(0, limit)
        .map(([cid, v]) => ({
          sender_profile_id: cid,
          total_xp: v.total,
          gifts_count: v.count,
          sender: v.profile,
        }));
    },
  });
}



/** Marca todos os presentes recebidos como vistos. */
export function useMarkAuraGiftsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc('aura_xp_gifts_mark_all_seen');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: UNSEEN_KEY });
      qc.invalidateQueries({ queryKey: RECEIVED_KEY });
    },
  });
}

/** Helper para invalidar TODOS os caches de presentes (usado pelo botão "Atualizar"). */
export function useRefreshAuraGifts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: RECEIVED_KEY });
    qc.invalidateQueries({ queryKey: UNSEEN_KEY });
    qc.invalidateQueries({ queryKey: RANK_KEY });
    qc.invalidateQueries({ queryKey: GLOBAL_RANK_KEY });
    qc.invalidateQueries({ queryKey: SENT_KEY });
  };
}

/** Realtime dedicado à página Meus Presentes:
 *  - assina mudanças em oculto_aura_xp_gifts
 *  - se a inscrição falhar/cair, faz fallback (poll 5s) até reconectar
 *  - expõe lastUpdatedAt + status para feedback de UI */
export function useAuraGiftsRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date>(() => new Date());
  const pollRef = useRef<number | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: RECEIVED_KEY });
    qc.invalidateQueries({ queryKey: UNSEEN_KEY });
    qc.invalidateQueries({ queryKey: RANK_KEY });
    qc.invalidateQueries({ queryKey: GLOBAL_RANK_KEY });
    qc.invalidateQueries({ queryKey: SENT_KEY });
    setLastUpdatedAt(new Date());
  };

  const startFallback = () => {
    if (pollRef.current) return;
    setStatus('fallback');
    pollRef.current = window.setInterval(invalidateAll, 5_000);
  };
  const stopFallback = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const handler = () => { if (!active) return; invalidateAll(); };
    const unsubA = subscribeTable('oculto_aura_xp_gifts', handler);
    const unsubB = subscribeTable('gift_history', handler);
    // Como o bus não expõe status SUBSCRIBED, assumimos "live" e mantemos fallback curto
    setStatus('live');
    stopFallback();
    // Mantém um polling leve como safety-net caso o realtime caia silenciosamente.
    const t = window.setTimeout(() => {
      if (active && status !== 'live') startFallback();
    }, 6_000);
    return () => {
      active = false;
      clearTimeout(t);
      stopFallback();
      unsubA(); unsubB();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);


  return { status, lastUpdatedAt, refresh: invalidateAll };
}

/** Estado local "agradecido" (persistido) para refletir UI após "Agradecer". */
const THANKED_KEY = 'aura-gifts-thanked-v1';
function readThanked(): Set<string> {
  try {
    const raw = localStorage.getItem(THANKED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}
export function useThankedGifts() {
  const [set, setSet] = useState<Set<string>>(() => readThanked());
  const mark = (id: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(THANKED_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  return { thanked: set, markThanked: mark };
}
