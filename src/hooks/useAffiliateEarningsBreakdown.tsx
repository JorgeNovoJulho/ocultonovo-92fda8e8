import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";

export interface AffiliateTxBreakdown {
  transaction_external_id: string;
  total_amount: number;
  affiliate_amount: number;
  platform_fee: number;
  creator_amount: number;
  processed_at: string;
  origin: string; // type from transactions OR fallback
}

/**
 * Lista ganhos do afiliado autenticado, agrupados por transaction_external_id,
 * com origem do ganho (transactions.type quando disponível).
 */
export function useAffiliateEarningsBreakdown(start: Date, end: Date) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["affiliate-tx-breakdown", user?.id, start.toISOString(), end.toISOString()],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<AffiliateTxBreakdown[]> => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user!.id)
        .single();
      if (!profile) return [];

      const { data: splits, error } = await (supabase as any)
        .from("payment_splits")
        .select(
          "transaction_external_id,total_amount,platform_fee,creator_amount,affiliate_amount,processed_at,affiliate_applied"
        )
        .eq("affiliate_id", profile.id)
        .eq("affiliate_applied", true)
        .gte("processed_at", start.toISOString())
        .lte("processed_at", end.toISOString())
        .order("processed_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const rows = (splits || []) as any[];
      const externalIds = rows.map((r) => r.transaction_external_id).filter(Boolean);
      let originMap: Record<string, string> = {};
      if (externalIds.length) {
        const { data: txs } = await supabase
          .from("transactions")
          .select("external_id,type,description")
          .in("external_id", externalIds);
        (txs || []).forEach((t: any) => {
          originMap[t.external_id] =
            (t.description as string)?.slice(0, 80) || (t.type as string) || "";
        });
      }

      return rows.map((r) => ({
        transaction_external_id: r.transaction_external_id,
        total_amount: Number(r.total_amount || 0),
        affiliate_amount: Number(r.affiliate_amount || 0),
        platform_fee: Number(r.platform_fee || 0),
        creator_amount: Number(r.creator_amount || 0),
        processed_at: r.processed_at,
        origin: originMap[r.transaction_external_id] || "comissao",
      }));
    },
  });
}
