/**
 * useReadProgress — rastreia leitura de conteúdo narrativo do Canal VIP.
 * Salva no banco via RPC `upsert_read_progress` (debounced).
 * Lista "Continue Lendo" via RPC `list_continue_reading`.
 */
import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";

interface UpsertInput {
  postId: string;
  creatorId: string;
  sectionType?: string | null;
  progressPercent: number;
}

export function useUpsertReadProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertInput) => {
      const { data, error } = await (supabase as any).rpc("upsert_read_progress", {
        p_post_id: input.postId,
        p_creator_id: input.creatorId,
        p_section_type: input.sectionType ?? null,
        p_progress_percent: Math.round(input.progressPercent),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ["continue-reading"] });
      qc.invalidateQueries({ queryKey: ["continue-reading", input.creatorId] });
    },
  });
}

export function useContinueReading(creatorId?: string | null, limit = 6) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["continue-reading", creatorId || "all", user?.id, limit],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_continue_reading", {
        p_creator_id: creatorId ?? null,
        p_limit: limit,
      });
      if (error) return [];
      return (data || []) as Array<{
        post_id: string;
        creator_id: string;
        section_type: string | null;
        progress_percent: number;
        last_read_at: string;
        title: string | null;
        teaser: string | null;
        thumbnail_url: string | null;
        read_time_minutes: number | null;
        series_title: string | null;
        chapter_number: number | null;
      }>;
    },
  });
}

/**
 * Hook ajudante: rastreia scroll de um elemento e dispara upsert debounced
 * (a cada 4s ou ao desmontar). Use no viewer narrativo.
 */
export function useTrackNarrativeProgress(
  scrollEl: HTMLElement | null,
  meta: { postId?: string; creatorId?: string | null; sectionType?: string | null },
  enabled = true,
) {
  const upsert = useUpsertReadProgress();
  const lastSent = useRef(0);
  const pct = useRef(0);

  useEffect(() => {
    if (!enabled || !scrollEl || !meta.postId || !meta.creatorId) return;
    let timer: number | null = null;

    const compute = () => {
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (max <= 0) return 100;
      const p = Math.min(100, Math.max(0, (scrollEl.scrollTop / max) * 100));
      pct.current = Math.max(pct.current, p);
      return pct.current;
    };

    const flush = () => {
      const value = compute();
      if (value < 5) return;
      if (Math.abs(value - lastSent.current) < 5 && value < 95) return;
      lastSent.current = value;
      upsert.mutate({
        postId: meta.postId!,
        creatorId: meta.creatorId!,
        sectionType: meta.sectionType ?? null,
        progressPercent: value,
      });
    };

    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 1200);
    };

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    // primeiro snapshot após 1.5s (caso usuário leia rápido e feche)
    const initial = window.setTimeout(flush, 1500);

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (timer) window.clearTimeout(timer);
      window.clearTimeout(initial);
      // flush final ao desmontar
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollEl, enabled, meta.postId, meta.creatorId, meta.sectionType]);
}
