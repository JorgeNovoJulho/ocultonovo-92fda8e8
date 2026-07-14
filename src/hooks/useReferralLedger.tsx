import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";

export interface ReferralLedgerRow {
  id: string;
  affiliate_id: string;
  referred_user_id: string;
  creator_id: string | null;
  source: string;
  source_ref: string | null;
  gross_amount: number;
  commission_amount: number;
  commission_pct: number;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
}

export interface AffiliateStats {
  affiliate_id: string;
  total_referrals: number;
  confirmed_count: number;
  total_earned: number;
  total_paid: number;
  pending_payout: number;
}

/**
 * Reads the canonical referral_ledger for the logged-in affiliate
 * + the aggregated v_affiliate_stats view.
 */
export function useReferralLedger(limit = 100) {
  const { user } = useAuth();

  const ledger = useQuery({
    queryKey: ["referral-ledger", user?.id, limit],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("referral_ledger")
        .select("*")
        .eq("affiliate_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as ReferralLedgerRow[]) || [];
    },
  });

  const stats = useQuery({
    queryKey: ["affiliate-stats", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_affiliate_stats")
        .select("*")
        .eq("affiliate_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as AffiliateStats | null);
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable("referral_ledger", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.affiliate_id !== user.id) return;
      ledger.refetch();
      stats.refetch();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    rows: ledger.data || [],
    stats: stats.data || null,
    isLoading: ledger.isLoading || stats.isLoading,
    refetch: () => {
      ledger.refetch();
      stats.refetch();
    },
  };
}
