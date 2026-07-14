import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface ShareClickStats {
  total_clicks: number;
  total_conversions: number;
  clicks_today: number;
  conversions_today: number;
  clicks_week: number;
  conversions_week: number;
}

/** Stats for the current user's referral links */
export function useMyShareClickStats(profileId?: string) {
  return useQuery({
    queryKey: ["share-click-stats", profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await (supabase as any)
        .from("share_click_stats")
        .select("*")
        .eq("referrer_id", profileId)
        .maybeSingle();
      if (error) throw error;
      return (data as ShareClickStats) || {
        total_clicks: 0, total_conversions: 0,
        clicks_today: 0, conversions_today: 0,
        clicks_week: 0, conversions_week: 0,
      };
    },
    enabled: !!profileId,
    staleTime: 1000 * 60 * 2,
  });
}

/** Admin: top referrers ranking */
export function useTopReferrers(limit = 10) {
  return useQuery({
    queryKey: ["top-referrers", limit],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("share_click_tracking")
        .select("referrer_id")
        .not("referrer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;

      // Aggregate clicks per referrer
      const counts = new Map<string, number>();
      for (const row of rows || []) {
        counts.set(row.referrer_id, (counts.get(row.referrer_id) || 0) + 1);
      }

      const topIds = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);

      if (topIds.length === 0) return [];

      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, name, username, avatar_url")
        .in("id", topIds);

      const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));

      return topIds.map((id) => {
        const p = profileMap.get(id);
        return {
          id,
          name: p?.name || "Anônimo",
          username: p?.username || "",
          avatar_url: p?.avatar_url || "",
          clicks: counts.get(id) || 0,
          conversions: 0,
        };
      });
    },
    staleTime: 1000 * 60 * 3,
  });
}

/** Admin: overall landing conversion rate */
export function useLandingConversionStats() {
  return useQuery({
    queryKey: ["landing-conversion-stats"],
    queryFn: async () => {
      const { count: totalClicks } = await (supabase as any)
        .from("share_click_tracking")
        .select("*", { count: "exact", head: true });

      const { count: totalConversions } = await (supabase as any)
        .from("share_click_tracking")
        .select("*", { count: "exact", head: true })
        .eq("converted", true);

      const { count: todayClicks } = await (supabase as any)
        .from("share_click_tracking")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date().toISOString().split("T")[0]);

      return {
        totalClicks: totalClicks || 0,
        totalConversions: totalConversions || 0,
        todayClicks: todayClicks || 0,
        conversionRate: totalClicks ? ((totalConversions || 0) / totalClicks * 100).toFixed(1) : "0.0",
      };
    },
    staleTime: 1000 * 60 * 2,
  });
}
