import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { notifyProfileRating } from "@/lib/profileSocialNotify";
import { readSidebarStats, writeSidebarStats } from "@/lib/sidebarStatsCache";

export interface ProfileRatingSummary {
  rating_avg: number;
  rating_count: number;
  my_stars: number | null;
}

export function useProfileRating(targetProfileId?: string | null) {
  const { profile } = useProfile();
  const qc = useQueryClient();
  const myProfileId = profile?.id ?? null;

  const query = useQuery<ProfileRatingSummary>({
    queryKey: ["profile-rating", targetProfileId, myProfileId],
    enabled: !!targetProfileId,
    staleTime: 15_000,
    placeholderData: () => {
      const cached = readSidebarStats(targetProfileId);
      if (!cached) return undefined;
      return {
        rating_avg: Number(cached.ratingAvg ?? 0),
        rating_count: Number(cached.ratingCount ?? 0),
        my_stars: null,
      } satisfies ProfileRatingSummary;
    },
    queryFn: async () => {
      if (!targetProfileId) {
        return { rating_avg: 0, rating_count: 0, my_stars: null };
      }
      const [{ data: prof }, mine] = await Promise.all([
        supabase
          .from("profiles")
          .select("rating_avg, rating_count")
          .eq("id", targetProfileId)
          .maybeSingle(),
        myProfileId
          ? supabase
              .from("oculto_profile_ratings" as any)
              .select("stars")
              .eq("rater_profile_id", myProfileId)
              .eq("target_profile_id", targetProfileId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const result = {
        rating_avg: Number((prof as any)?.rating_avg ?? 0),
        rating_count: Number((prof as any)?.rating_count ?? 0),
        my_stars: (mine as any)?.data?.stars ?? null,
      } satisfies ProfileRatingSummary;
      writeSidebarStats(targetProfileId, {
        ratingAvg: result.rating_avg,
        ratingCount: result.rating_count,
      });
      return result;
    },
  });

  const submit = useMutation({
    mutationFn: async (stars: number) => {
      if (!myProfileId) throw new Error("Faça login para avaliar.");
      if (!targetProfileId) throw new Error("Perfil inválido.");
      if (myProfileId === targetProfileId) throw new Error("Você não pode avaliar seu próprio perfil.");
      if (stars < 1 || stars > 5) throw new Error("Nota inválida.");
      const { error } = await (supabase as any)
        .from("oculto_profile_ratings")
        .upsert(
          {
            rater_profile_id: myProfileId,
            target_profile_id: targetProfileId,
            stars,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "rater_profile_id,target_profile_id" },
        );
      if (error) throw error;
      void notifyProfileRating({
        actorProfileId: myProfileId,
        targetProfileId,
        stars,
        url: `${window.location.origin}/creator/${targetProfileId}`,
      });
    },
    onSuccess: () => {
      toast.success("Avaliação registrada!");
      qc.invalidateQueries({ queryKey: ["profile-rating", targetProfileId] });
      qc.invalidateQueries({ queryKey: ["creator-profile", targetProfileId] });
      qc.invalidateQueries({ queryKey: ["profile", targetProfileId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar avaliação"),
  });

  return { ...query, submit, myProfileId };
}
