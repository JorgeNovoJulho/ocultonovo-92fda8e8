import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";

export type SpecialReactionKey = "fire" | "diamond" | "crown" | "sparkle";

export interface SpecialReactionRow {
  reaction: SpecialReactionKey;
  total: number;
  mine: boolean;
}

export const SPECIAL_REACTIONS: { key: SpecialReactionKey; emoji: string; label: string }[] = [
  { key: "fire",    emoji: "🔥", label: "Quente" },
  { key: "diamond", emoji: "💎", label: "Joia" },
  { key: "crown",   emoji: "👑", label: "Realeza" },
  { key: "sparkle", emoji: "✨", label: "Brilho" },
];

export function useSpecialReactions(postId: string | undefined | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["special-reactions", postId],
    queryFn: async (): Promise<SpecialReactionRow[]> => {
      if (!postId) return [];
      const { data, error } = await supabase.rpc("list_special_reactions", { p_post_id: postId });
      if (error) throw error;
      return (data as any[]).map((r) => ({
        reaction: r.reaction,
        total: Number(r.total ?? 0),
        mine: !!r.mine,
      }));
    },
    enabled: !!postId,
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async (reaction: SpecialReactionKey) => {
      if (!postId) throw new Error("post id ausente");
      const { data, error } = await supabase.rpc("toggle_special_reaction", {
        p_post_id: postId,
        p_reaction: reaction,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["special-reactions", postId] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Não foi possível reagir agora.");
    },
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    toggle: toggle.mutate,
    isToggling: toggle.isPending,
  };
}
