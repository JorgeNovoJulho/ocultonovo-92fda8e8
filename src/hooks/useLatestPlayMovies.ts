/**
 * useLatestPlayMovies — últimos filmes (kind='link') NÃO +18 do Oculto Play.
 *
 * - Até 10 itens (após reordenação híbrida recência + visualizações).
 * - Inclui contadores (likes/dislikes/saves/shares/comments) e author para
 *   alimentar o card grande com ações funcionais em tempo real.
 * - Realtime: invalida ao receber qualquer mudança em oculto_play_items.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { normalizeOcultoPlayItem, type OcultoPlayItem } from "@/hooks/useOcultoPlayContent";

const MAX_ITEMS = 10;
const FETCH_LIMIT = 40;

export function useLatestPlayMovies(enabled: boolean = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const off = subscribeTable("oculto_play_items", () => {
      queryClient.invalidateQueries({ queryKey: ["latest-play-movies-sfw"] });
    });
    return () => { off(); };
  }, [enabled, queryClient]);

  const query = useQuery({
    queryKey: ["latest-play-movies-sfw"],
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<OcultoPlayItem[]> => {
      const sb: any = supabase as any;
      const { data, error } = await sb
        .from("oculto_play_items")
        .select(
          "id, author_id, kind, section, visibility, title, caption, media_url, thumb_url, audio_url, duration_sec, view_count, like_count, save_count, share_count, dislike_count, comment_count, published_at, created_at, expires_at, trim_start_seconds, trim_end_seconds, is_published, is_adult, source_url, link_provider"
        )
        .eq("is_published", true)
        .eq("kind", "link")
        .or("is_adult.is.null,is_adult.eq.false")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) {
        console.warn("[useLatestPlayMovies]", error.message);
        throw error;
      }
      const items = ((data ?? []) as any[]).map((r) => normalizeOcultoPlayItem(r));
      const authorIds = Array.from(new Set(items.map((i) => i.author_id).filter(Boolean)));
      if (authorIds.length) {
        const { data: profs } = await sb
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", authorIds);
        const map = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null }>();
        for (const p of (profs ?? []) as any[]) {
          map.set(p.id, {
            username: p.username ?? null,
            display_name: p.display_name ?? null,
            avatar_url: p.avatar_url ?? null,
          });
        }
        for (const it of items) {
          const a = map.get(it.author_id);
          if (a) {
            it.author_username = a.username;
            (it as any).author_display_name = a.display_name;
            it.author_avatar_url = a.avatar_url;
          }
        }
      }
      return items;
    },
  });

  const allItems = useMemo<OcultoPlayItem[]>(() => {
    const rows = (query.data ?? []).slice();
    const now = Date.now();
    rows.sort((a, b) => {
      const ageA = Math.max(1, (now - new Date(a.published_at).getTime()) / (1000 * 60 * 60));
      const ageB = Math.max(1, (now - new Date(b.published_at).getTime()) / (1000 * 60 * 60));
      const sA = Number(a.view_count ?? 0) / Math.sqrt(ageA);
      const sB = Number(b.view_count ?? 0) / Math.sqrt(ageB);
      if (sB !== sA) return sB - sA;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
    return rows;
  }, [query.data]);

  const items = useMemo(() => allItems.slice(0, MAX_ITEMS), [allItems]);

  return {
    items,
    allItems,
    pageSize: MAX_ITEMS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
