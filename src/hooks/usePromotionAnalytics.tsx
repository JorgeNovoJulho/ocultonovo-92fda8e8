import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface PromotionAnalytics {
  promotion_id: string;
  promotion_title: string;
  promotion_type: string;
  is_active: boolean;
  reward_value: number;
  impressions: number;
  clicks: number;
  closes: number;
  conversions: number;
  ctr: number;
  rejection_rate: number;
}

export interface PeriodStat {
  promotion_id: string;
  time_period: string;
  event_type: string;
  event_count: number;
  event_date: string;
}

export function usePromotionAnalytics() {
  return useQuery({
    queryKey: ["promotion-analytics"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("promotion_analytics")
        .select("*");
      if (error) throw error;
      return (data || []) as PromotionAnalytics[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function usePromotionPeriodStats(promotionId?: string) {
  return useQuery({
    queryKey: ["promotion-period-stats", promotionId],
    queryFn: async () => {
      let query = (supabase as any)
        .from("promotion_period_stats")
        .select("*")
        .order("event_date", { ascending: false })
        .limit(100);

      if (promotionId) {
        query = query.eq("promotion_id", promotionId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PeriodStat[];
    },
    enabled: !!promotionId,
    staleTime: 1000 * 60 * 2,
  });
}

/** Top 3 promotions by conversions in last 3 days */
export function useTopPromotions() {
  return useQuery({
    queryKey: ["top-promotions-3d"],
    queryFn: async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data, error } = await (supabase as any)
        .from("promotion_events")
        .select("promotion_id")
        .eq("event_type", "conversion")
        .gte("created_at", threeDaysAgo.toISOString());

      if (error) throw error;

      // Count conversions per promotion
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.promotion_id] = (counts[row.promotion_id] || 0) + 1;
      });

      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => ({ promotion_id: id, conversions: count }));
    },
    staleTime: 1000 * 60 * 5,
  });
}
