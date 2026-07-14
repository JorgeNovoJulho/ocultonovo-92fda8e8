/**
 * useLatestOcultoPlayVideos — busca paginada (infinite) dos últimos vídeos
 * publicados no Oculto Play para a faixa do feed principal.
 *
 * - Paginação por cursor (created_at desc) — 25 por página
 * - Atualiza por realtime (INSERT/UPDATE/DELETE) para manter view_count
 *   e gifts em sincronia com o player
 * - NÃO consulta `description` (coluna inexistente em oculto_play_items)
 */
import { useEffect, useMemo } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";

export type LatestPlayVideo = {
  id: string;
  title: string | null;
  thumb_url: string | null;
  media_url: string | null;
  view_count: number | null;
  like_count: number | null;
  author_id: string | null;
  duration_sec: number | null;
  trim_start_seconds?: number | null;
  trim_end_seconds?: number | null;
  created_at: string;
  author?: {
    id: string;
    user_id: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

export type PlayVideoGiftTotals = Record<string, { count: number; totalXp: number }>;

const PAGE_SIZE = 25;

async function fetchAuthors(items: LatestPlayVideo[]) {
  const sb: any = supabase as any;
  const authorIds = Array.from(
    new Set(items.map((i) => i.author_id).filter(Boolean) as string[])
  );
  if (authorIds.length === 0) return items;
  const { data: profs } = await sb
    .from("profiles")
    .select("id, user_id, username, avatar_url")
    .in("id", authorIds);
  const authorsById: Record<string, NonNullable<LatestPlayVideo["author"]>> = {};
  for (const p of (profs ?? []) as any[]) {
    authorsById[p.id] = {
      id: p.id,
      user_id: p.user_id ?? null,
      username: p.username ?? null,
      avatar_url: p.avatar_url ?? null,
    };
  }
  return items.map((i) => ({
    ...i,
    author: i.author_id ? authorsById[i.author_id] ?? null : null,
  }));
}

export function useLatestOcultoPlayVideos() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubItems = subscribeTable("oculto_play_items", () => {
      queryClient.invalidateQueries({ queryKey: ["latest-oculto-play-videos"] });
    });
    return () => { unsubItems(); };
  }, [queryClient]);

  const query = useInfiniteQuery({
    queryKey: ["latest-oculto-play-videos"],
    initialPageParam: null as string | null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage: LatestPlayVideo[]) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1]?.created_at ?? undefined;
    },
    queryFn: async ({ pageParam }): Promise<LatestPlayVideo[]> => {
      const sb: any = supabase as any;
      let qy = sb
        .from("oculto_play_items")
        .select(
          "id, title, thumb_url, media_url, view_count, like_count, author_id, duration_sec, trim_start_seconds, trim_end_seconds, created_at, kind, is_published"
        )
        .eq("is_published", true)
        .in("kind", ["short_video", "vip_teaser"])
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) qy = qy.lt("created_at", pageParam);
      const { data, error } = await qy;
      if (error) {
        console.warn("[useLatestOcultoPlayVideos]", error.message);
        throw error;
      }
      return await fetchAuthors((data ?? []) as LatestPlayVideo[]);
    },
  });

  const items = useMemo<LatestPlayVideo[]>(() => {
    const all = (query.data?.pages ?? []).flat() as LatestPlayVideo[];
    const seen = new Set<string>();
    const dedup: LatestPlayVideo[] = [];
    for (const it of all) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      dedup.push(it);
    }
    return dedup;
  }, [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

export function useLatestPlayVideoGiftTotals(receiverIds: string[]) {
  const queryClient = useQueryClient();
  const key = [
    "latest-oculto-play-gift-totals",
    receiverIds.slice().sort().join(","),
  ];

  useEffect(() => {
    if (receiverIds.length === 0) return;
    return subscribeTable("oculto_aura_xp_gifts", () =>
      queryClient.invalidateQueries({ queryKey: ["latest-oculto-play-gift-totals"] })
    );
  }, [receiverIds.length, queryClient]);

  return useQuery({
    queryKey: key,
    enabled: receiverIds.length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PlayVideoGiftTotals> => {
      const inList = `(${receiverIds.map((id) => `"${id}"`).join(",")})`;
      const { data, error } = await (supabase as any)
        .from("oculto_aura_xp_gifts")
        .select("receiver_id, amount")
        .filter("receiver_id", "in", inList)
        .limit(5000);
      if (error) {
        console.warn("[useLatestPlayVideoGiftTotals]", error.message);
        return {};
      }
      const totals: PlayVideoGiftTotals = {};
      for (const row of (data ?? []) as Array<{ receiver_id: string; amount: number | null }>) {
        if (!totals[row.receiver_id]) totals[row.receiver_id] = { count: 0, totalXp: 0 };
        totals[row.receiver_id].count += 1;
        totals[row.receiver_id].totalXp += Number(row.amount ?? 0);
      }
      return totals;
    },
  });
}
