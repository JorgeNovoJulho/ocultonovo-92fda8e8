import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "./useAuth";

export interface ReferralChild {
  id: string;
  child_id: string;
  referral_source: string;
  level: number;
  status: string;
  created_at: string;
  child_profile?: {
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export interface ReferralNetworkStat {
  parent_id: string;
  parent_name: string;
  parent_username: string | null;
  parent_avatar: string | null;
  total_children: number;
  active_children: number;
  first_referral_at: string;
}

/** My share-link referral children */
export function useMyReferralChildren() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-referral-children", user?.id],
    queryFn: async (): Promise<ReferralChild[]> => {
      if (!user) return [];

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return [];

      const { data, error } = await (supabase as any)
        .from("referral_tree")
        .select("*")
        .eq("parent_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data?.length) return [];

      const childIds = data.map((r: any) => r.child_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url")
        .in("id", childIds);

      return data.map((r: any) => ({
        ...r,
        child_profile: profiles?.find((p) => p.id === r.child_id),
      }));
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });
}

/** My share link stats (clicks + conversions) */
export function useMyShareStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-share-stats", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, external_clicks_count")
        .eq("user_id", user.id)
        .single();
      if (!profile) return null;

      const clicks = profile.external_clicks_count || 0;

      const { count } = await (supabase as any)
        .from("referral_tree")
        .select("*", { count: "exact", head: true })
        .eq("parent_id", profile.id);

      const conversions = count || 0;
      const rate = clicks > 0 ? ((conversions / clicks) * 100).toFixed(1) : "0.0";

      return { clicks, conversions, rate };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });
}

/** Admin: referral network top list */
export function useAdminReferralNetwork(limit = 20) {
  return useQuery({
    queryKey: ["admin-referral-network", limit],
    queryFn: async (): Promise<ReferralNetworkStat[]> => {
      const { data, error } = await (supabase as any)
        .from("referral_network_stats")
        .select("*")
        .order("total_children", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 3,
  });
}

/** Admin: overall conversion stats */
export function useAdminConversionStats() {
  return useQuery({
    queryKey: ["admin-conversion-stats"],
    queryFn: async () => {
      const { count: totalClicks } = await (supabase as any)
        .from("share_click_tracking")
        .select("*", { count: "exact", head: true })
        .eq("confirmed_age", true);

      const { count: totalConversions } = await (supabase as any)
        .from("share_click_tracking")
        .select("*", { count: "exact", head: true })
        .eq("converted", true);

      const { count: totalReferrals } = await (supabase as any)
        .from("referral_tree")
        .select("*", { count: "exact", head: true });

      const clicks = totalClicks || 0;
      const conversions = totalConversions || 0;
      const rate = clicks > 0 ? ((conversions / clicks) * 100).toFixed(1) : "0.0";

      return {
        totalClicks: clicks,
        totalConversions: conversions,
        totalReferrals: totalReferrals || 0,
        conversionRate: rate,
      };
    },
    staleTime: 1000 * 60 * 2,
  });
}
