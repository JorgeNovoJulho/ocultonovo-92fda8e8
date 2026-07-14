/**
 * useLatestAdultPlayMovies — busca os últimos filmes (kind='link') marcados
 * como +18 no Oculto Play, combinando data de publicação e contagem de views.
 *
 * - Limite máximo de 25 itens (após reordenação).
 * - Realtime: invalida ao receber INSERT/UPDATE/DELETE em oculto_play_items.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";

export type LatestAdultMovie = {
  id: string;
  title: string | null;
  thumb_url: string | null;
  source_url: string | null;
  media_url?: string | null;
  view_count: number | null;
  created_at: string;
  author_id: string | null;
  author?: {
    id: string;
    user_id: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

const MAX_ITEMS = 25;
const FETCH_LIMIT = 60;

export function useLatestAdultPlayMovies(enabled: boolean = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const off = subscribeTable("oculto_play_items", () => {
      queryClient.invalidateQueries({ queryKey: ["latest-adult-play-movies"] });
    });
    return () => { off(); };
  }, [enabled, queryClient]);

  const query = useQuery({
    queryKey: ["latest-adult-play-movies"],
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<LatestAdultMovie[]> => {
      const sb: any = supabase as any;
      const { data, error } = await sb
        .from("oculto_play_items")
        .select("id, title, thumb_url, source_url, media_url, view_count, created_at, author_id, kind, is_published, is_adult")
        .eq("is_published", true)
        .eq("kind", "link")
        .eq("is_adult", true)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) {
        console.warn("[useLatestAdultPlayMovies]", error.message);
        throw error;
      }
      const rows = (data ?? []) as LatestAdultMovie[];
      const authorIds = Array.from(
        new Set(rows.map((r) => r.author_id).filter(Boolean) as string[]),
      );
      let authorsById: Record<string, NonNullable<LatestAdultMovie["author"]>> = {};
      if (authorIds.length > 0) {
        const { data: profs } = await sb
          .from("profiles")
          .select("id, user_id, username, avatar_url")
          .in("id", authorIds);
        for (const p of (profs ?? []) as any[]) {
          authorsById[p.id] = {
            id: p.id,
            user_id: p.user_id ?? null,
            username: p.username ?? null,
            avatar_url: p.avatar_url ?? null,
          };
        }
      }
      return rows.map((r) => ({
        ...r,
        author: r.author_id ? authorsById[r.author_id] ?? null : null,
      }));
    },
  });

  const items = useMemo<LatestAdultMovie[]>(() => {
    const rows = (query.data ?? []).slice();
    // Score híbrido: prioriza recente + mais visto.
    const now = Date.now();
    rows.sort((a, b) => {
      const ageA = Math.max(1, (now - new Date(a.created_at).getTime()) / (1000 * 60 * 60));
      const ageB = Math.max(1, (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60));
      const sA = Number(a.view_count ?? 0) / Math.sqrt(ageA);
      const sB = Number(b.view_count ?? 0) / Math.sqrt(ageB);
      if (sB !== sA) return sB - sA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows.slice(0, MAX_ITEMS);
  }, [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
