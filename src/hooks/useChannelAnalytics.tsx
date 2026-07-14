/**
 * useChannelAnalytics — métricas agregadas do Canal VIP do criador.
 * RPC: creator_channel_analytics(p_creator_id)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface ChannelAnalytics {
  reads_by_section: Array<{
    section_type: string | null;
    reads_total: number;
    avg_progress: number;
    completed: number;
  }>;
  top_narratives: Array<{
    id: string;
    title: string | null;
    section_type: string | null;
    reads_count: number;
    avg_progress: number;
  }>;
  beta_paid_grants: number;
  beta_sub_grants: number;
  real_subscriptions: number;
  pinned_count: number;
  narrative_count: number;
}

export function useChannelAnalytics(creatorId?: string | null) {
  return useQuery<ChannelAnalytics | null>({
    queryKey: ["channel-analytics", creatorId],
    enabled: !!creatorId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("creator_channel_analytics", {
        p_creator_id: creatorId,
      });
      if (error) return null;
      return (data || null) as ChannelAnalytics | null;
    },
  });
}
