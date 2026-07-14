import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface RankingEntry {
  profile_id: string;
  user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  is_verified: boolean;
  plan_type: string;
  rating_avg: number;
  rating_count: number;
  total_likes: number;
  total_followers: number;
  total_testimonials: number;
  total_recommendations: number;
  engagement_score: number;
}

export function useEngagementRanking(limit = 100) {
  return useQuery({
    queryKey: ["engagement-ranking", limit],
    staleTime: 60_000,
    queryFn: async (): Promise<RankingEntry[]> => {
      const { data, error } = await (supabase as any).rpc("get_engagement_ranking", {
        p_limit: limit,
      });
      if (error) {
        console.warn("[ranking] rpc fail", error.message);
        return [];
      }
      return (data ?? []).map((r: any) => ({
        ...r,
        rating_avg: Number(r.rating_avg ?? 0),
        rating_count: Number(r.rating_count ?? 0),
        total_likes: Number(r.total_likes ?? 0),
        total_followers: Number(r.total_followers ?? 0),
        total_testimonials: Number(r.total_testimonials ?? 0),
        total_recommendations: Number(r.total_recommendations ?? 0),
        engagement_score: Number(r.engagement_score ?? 0),
      })) as RankingEntry[];
    },
  });
}
