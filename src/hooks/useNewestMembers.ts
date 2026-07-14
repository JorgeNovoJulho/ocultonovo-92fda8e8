/**
 * useNewestMembers — busca os 25 perfis mais recentes (não-seed, com username).
 * Atualiza no login, em tempo real por realtime e a cada 10 minutos.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";

export type NewestMember = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  cover_image_url: string | null;
  banner_url: string | null;
  address_city: string | null;
  gender: string | null;
  profile_type: string | null;
  is_online: boolean | null;
  last_seen: string | null;
  show_online_status: boolean | null;
  created_at: string;
  gifts_received_count: number | null;
};

const TEN_MIN = 10 * 60 * 1000;

export type NewMemberGiftTotals = Record<string, { totalXp: number; count: number }>;

export function useNewestMembers(limit = 25) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Debounce/coalesce: alternâncias rápidas de is_online (heartbeat curto,
    // tab focus, reconexão) chegavam como N invalidações por segundo e
    // re-disparavam o framer-motion layout, causando flicker no carrossel.
    // Agora agrupamos em uma única atualização por janela.
    const REFETCH_DEBOUNCE_MS = 700;
    const PRESENCE_REORDER_COOLDOWN_MS = 4_000;
    let refetchTimer: number | null = null;
    const lastReorderAt = new Map<string, number>();

    const scheduleRefetch = () => {
      if (refetchTimer != null) return;
      refetchTimer = window.setTimeout(() => {
        refetchTimer = null;
        queryClient.invalidateQueries({ queryKey: ["newest-members"], refetchType: 'active' });
      }, REFETCH_DEBOUNCE_MS);
    };

    const unsubProfiles = subscribeTable('profiles', scheduleRefetch);
    const unsubGifts = subscribeTable('oculto_aura_xp_gifts', () => {
      queryClient.invalidateQueries({ queryKey: ["newest-members"], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ["newest-members-gift-totals"], refetchType: 'active' });
    });

    // Atualização OTIMISTA com trava por perfil: ao receber presença local,
    // só reordenamos se já passou o cooldown — evita "pulo" do card ao topo
    // a cada heartbeat (45s) ou alternância rápida online/offline.
    const onPresenceOnline = (e: Event) => {
      const detail = (e as CustomEvent).detail as { profileId?: string } | undefined;
      const profileId = detail?.profileId;
      if (!profileId) return;
      const now = Date.now();
      const last = lastReorderAt.get(profileId) ?? 0;
      if (now - last < PRESENCE_REORDER_COOLDOWN_MS) return;
      lastReorderAt.set(profileId, now);
      queryClient.setQueriesData<NewestMember[] | undefined>(
        { queryKey: ["newest-members"] },
        (old) => {
          if (!old || old.length === 0) return old;
          const nowIso = new Date().toISOString();
          const idx = old.findIndex((m) => m.id === profileId || m.user_id === profileId);
          if (idx === -1) return old;
          // Se já está no topo e já online, não reordena (evita re-render layout).
          if (idx === 0 && old[0].is_online) return old;
          const target = { ...old[idx], is_online: true, last_seen: nowIso };
          const rest = old.filter((_, i) => i !== idx);
          return [target, ...rest];
        },
      );
    };
    window.addEventListener('oculto:presence-online', onPresenceOnline as EventListener);

    // Atualização OTIMISTA imediata ao enviar um presente XP — qualquer cliente
    // (o próprio remetente) reflete +1 no contador do receptor antes mesmo do
    // realtime entregar o INSERT. Soma também no cache de totals.
    const onGiftSent = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { receiverProfileId?: string; receiverUserId?: string | null; amount?: number }
        | undefined;
      const rid = detail?.receiverProfileId;
      const ruid = detail?.receiverUserId ?? null;
      if (!rid && !ruid) return;
      // 1) Bump em profiles.gifts_received_count dentro do cache de newest-members
      queryClient.setQueriesData<NewestMember[] | undefined>(
        { queryKey: ["newest-members"] },
        (old) => {
          if (!old) return old;
          let changed = false;
          const next = old.map((m) => {
            if (m.id === rid || (ruid && (m.id === ruid || m.user_id === ruid)) || m.user_id === rid) {
              changed = true;
              return { ...m, gifts_received_count: (m.gifts_received_count || 0) + 1 };
            }
            return m;
          });
          return changed ? next : old;
        },
      );
      // 2) Bump nos totais ao vivo (count + amount)
      queryClient.setQueriesData<NewMemberGiftTotals | undefined>(
        { queryKey: ["newest-members-gift-totals"] },
        (old) => {
          if (!old) return old;
          const next = { ...old };
          const bump = (k?: string | null) => {
            if (!k) return;
            const cur = next[k] ?? { totalXp: 0, count: 0 };
            next[k] = { totalXp: cur.totalXp + Number(detail?.amount || 0), count: cur.count + 1 };
          };
          bump(rid);
          if (ruid && ruid !== rid) bump(ruid);
          return next;
        },
      );
      // Refetch leve para reconciliar com o servidor logo em seguida.
      scheduleRefetch();
    };
    window.addEventListener('oculto:aura-gift-sent', onGiftSent as EventListener);

    // Cross-tab: BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('oculto-aura-gifts');
      bc.onmessage = (ev) => {
        try { onGiftSent(new CustomEvent('oculto:aura-gift-sent', { detail: ev.data }) as any); } catch {}
      };
    } catch {}
    // Cross-tab fallback: storage event
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'oculto:aura-gift-sent' || !e.newValue) return;
      try {
        const detail = JSON.parse(e.newValue);
        onGiftSent(new CustomEvent('oculto:aura-gift-sent', { detail }) as any);
      } catch {}
    };
    window.addEventListener('storage', onStorage);

    // Fallback: refetch ao voltar para a aba e ao reconectar (também debounced).
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleRefetch(); };
    const onOnline = () => scheduleRefetch();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      if (refetchTimer != null) window.clearTimeout(refetchTimer);
      unsubProfiles();
      unsubGifts();
      window.removeEventListener('oculto:presence-online', onPresenceOnline as EventListener);
      window.removeEventListener('oculto:aura-gift-sent', onGiftSent as EventListener);
      window.removeEventListener('storage', onStorage);
      try { bc?.close(); } catch {}
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [limit, queryClient]);


  return useQuery({

    queryKey: ["newest-members", limit],
    staleTime: 0,
    gcTime: TEN_MIN,
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 1,

    queryFn: async (): Promise<NewestMember[]> => {
      const cols = "id, user_id, username, avatar_url, cover_image_url, banner_url, address_city, gender, profile_type, is_online, last_seen, show_online_status, created_at, gifts_received_count";
      const sb: any = supabase as any;

      // 1) Mais recentes (qualquer status online)
      const newestPromise = sb
        .from("profiles")
        .select(cols)
        .or("is_seed.is.null,is_seed.eq.false")
        .not("username", "is", null)
        .neq("username", "")
        .order("created_at", { ascending: false })
        .limit(limit);

      // 2) Online em tempo real (últimos 2 min), independente da data de criação
      const onlineSince = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const onlinePromise = sb
        .from("profiles")
        .select(cols)
        .or("is_seed.is.null,is_seed.eq.false")
        .not("username", "is", null)
        .neq("username", "")
        .eq("is_online", true)
        .or("show_online_status.is.null,show_online_status.eq.true")
        .gte("last_seen", onlineSince)
        .order("last_seen", { ascending: false })
        .limit(limit);

      const [newestRes, onlineRes] = await Promise.all([newestPromise, onlinePromise]);
      if (newestRes.error) console.warn("[useNewestMembers:newest]", newestRes.error.message);
      if (onlineRes.error) console.warn("[useNewestMembers:online]", onlineRes.error.message);

      // Online primeiro (prioridade), depois novos offline — deduplicando por id.
      const merged = new Map<string, NewestMember>();
      for (const row of ((onlineRes.data || []) as NewestMember[])) merged.set(row.id, row);
      for (const row of ((newestRes.data || []) as NewestMember[])) {
        if (!merged.has(row.id)) merged.set(row.id, row);
      }
      return Array.from(merged.values());
    },
  });
}

export function useNewestMembersGiftTotals(memberIds: string[]) {
  const queryClient = useQueryClient();
  const key = ["newest-members-gift-totals", memberIds.slice().sort().join(",")];

  useEffect(() => {
    if (memberIds.length === 0) return;
    return subscribeTable('oculto_aura_xp_gifts', () =>
      queryClient.invalidateQueries({ queryKey: ["newest-members-gift-totals"] })
    );
  }, [memberIds.length, queryClient]);


  return useQuery({
    queryKey: key,
    enabled: memberIds.length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<NewMemberGiftTotals> => {
      const inList = `(${memberIds.map((id) => `"${id}"`).join(",")})`;
      const { data, error } = await (supabase as any)
        .from("oculto_aura_xp_gifts")
        .select("receiver_id, amount")
        .filter("receiver_id", "in", inList)
        .limit(5000);

      if (error) {
        console.warn("[useNewestMembersGiftTotals]", error.message);
        return {};
      }

      const totals: NewMemberGiftTotals = {};
      for (const row of (data ?? []) as Array<{ receiver_id: string; amount: number | null }>) {
        const key = row.receiver_id;
        if (!totals[key]) totals[key] = { totalXp: 0, count: 0 };
        totals[key].totalXp += Number(row.amount ?? 0);
        totals[key].count += 1;
      }
      return totals;
    },
  });
}
