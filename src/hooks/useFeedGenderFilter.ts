/**
 * Hook do Filtro Global de Gênero do Feed.
 *
 * - Lê/grava em public.profiles.feed_filter_categories / chosen_at / prompt_required
 *   via Supabase externo.
 * - Optimistic update + invalidate do query do profile (mesma queryKey usada por useProfile).
 * - Realtime: já coberto pelo realtime existente da row de profile.
 */
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  FEED_GENDER_CATEGORIES,
  sanitizeCategories,
  type FeedGenderCategory,
} from "@/config/feedGenderFilter";

export interface UseFeedGenderFilter {
  isLoading: boolean;
  /** Seleção atual (subset de categorias). Vazio = sem filtro. */
  categories: FeedGenderCategory[];
  /** True quando o modal precisa ser exibido (novo usuário ou usuário antigo no próximo login). */
  promptRequired: boolean;
  /** Quando o usuário escolheu/atualizou pela última vez. */
  chosenAt: string | null;
  /** Salva nova seleção (marca chosen_at e zera prompt_required). */
  save: (cats: FeedGenderCategory[]) => Promise<void>;
  /** Marca o prompt como visto sem alterar a seleção (ex.: usuário fechou sem escolher). */
  dismissPrompt: () => Promise<void>;
}

export function useFeedGenderFilter(): UseFeedGenderFilter {
  const { user } = useAuth();
  const { profile, isLoading } = useProfile() as any;
  const qc = useQueryClient();

  const categories = useMemo<FeedGenderCategory[]>(
    () => sanitizeCategories(profile?.feed_filter_categories),
    [profile?.feed_filter_categories],
  );

  const promptRequired = !!profile?.feed_filter_prompt_required;
  const chosenAt: string | null = profile?.feed_filter_chosen_at ?? null;

  const persist = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!user?.id) throw new Error("not_authenticated");
      // Optimistic — atualiza o cache do profile antes do round-trip.
      qc.setQueriesData({ queryKey: ["profile"] }, (prev: any) =>
        prev ? { ...prev, ...patch } : prev,
      );
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("user_id", user.id);
      if (error) {
        // Rollback via invalidate — fonte da verdade volta a ser o banco.
        qc.invalidateQueries({ queryKey: ["profile"] });
        throw error;
      }
      // Garante consistência cross-aba e refetch.
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["posts-infinite"] });
    },
    [qc, user?.id],
  );

  const save = useCallback(
    async (cats: FeedGenderCategory[]) => {
      const clean = sanitizeCategories(cats);
      await persist({
        feed_filter_categories: clean.length ? clean : (FEED_GENDER_CATEGORIES as readonly string[]),
        feed_filter_chosen_at: new Date().toISOString(),
        feed_filter_prompt_required: false,
      });
    },
    [persist],
  );

  const dismissPrompt = useCallback(async () => {
    await persist({ feed_filter_prompt_required: false });
  }, [persist]);

  return {
    isLoading: !!isLoading,
    categories,
    promptRequired,
    chosenAt,
    save,
    dismissPrompt,
  };
}
