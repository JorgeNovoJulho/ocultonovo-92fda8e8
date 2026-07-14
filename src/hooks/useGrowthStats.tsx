import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface GrowthStats {
  realUsers: number;
  seedUsers: number;
  target: number;
  progress: number;
  remaining: number;
  milestoneReached: boolean;
}

export function useGrowthStats(enabled: boolean = true) {
  return useQuery({
    enabled,
    queryKey: ["growth-stats"],
    queryFn: async (): Promise<GrowthStats> => {
      try {
        const [realResult, seedResult] = await Promise.all([
          (supabase as any)
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .or("is_seed.eq.false,is_seed.is.null"),
          (supabase as any)
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_seed", true),
        ]);

        const realUsers = realResult.count || 0;
        const seedUsers = seedResult.count || 0;
        const target = seedUsers * 3;
        const progress = target > 0 ? Math.min((realUsers / target) * 100, 100) : 0;
        const remaining = Math.max(target - realUsers, 0);
        const milestoneReached = seedUsers > 0 && realUsers >= target;

        return { realUsers, seedUsers, target, progress, remaining, milestoneReached };
      } catch (err) {
        console.warn('[GrowthStats] Query failed, returning zeros:', err);
        return { realUsers: 0, seedUsers: 0, target: 0, progress: 0, remaining: 0, milestoneReached: false };
      }
    },
    retry: false,
    refetchInterval: 120000,
    staleTime: 120000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
