import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { startOfMonth } from "date-fns";

export interface ReferralPendingRow {
  id: string;            // creator_referral.id
  afilhada_id: string;
  afilhada_name: string;
  afilhada_username: string | null;
  afilhada_avatar: string | null;
  started_at: string;
  total_commission_earned: number;
}

export interface ReferralPaidRow {
  id: string;            // referral_withdrawal.id
  amount: number;
  requested_at: string;
  paid_at: string | null;
  status: string;
  pix_key: string | null;
  pix_key_type: string | null;
}

export interface ReferralBalance {
  earned_total: number;
  withdrawn_total: number;
  available: number;
}

/** Lista de indicados (Pendentes) — sourced from creator_referrals */
export function useReferralPendingList() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["referral-pending-list", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ReferralPendingRow[]> => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!prof?.id) return [];

      const { data: rows, error } = await (supabase as any)
        .from("creator_referrals")
        .select("id, afilhada_id, started_at, total_commission_earned")
        .eq("madrinha_id", prof.id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      if (!rows?.length) return [];

      const ids = [...new Set(rows.map((r: any) => r.afilhada_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url")
        .in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p]));

      return rows.map((r: any) => {
        const p = map.get(r.afilhada_id) as any;
        return {
          id: r.id,
          afilhada_id: r.afilhada_id,
          afilhada_name: p?.name || p?.username || "Indicado",
          afilhada_username: p?.username || null,
          afilhada_avatar: p?.avatar_url || null,
          started_at: r.started_at,
          total_commission_earned: Number(r.total_commission_earned || 0),
        };
      });
    },
  });
}

/** Saques realizados (Pagas) */
export function useReferralPaidList() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["referral-paid-list", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ReferralPaidRow[]> => {
      const { data, error } = await (supabase as any)
        .from("referral_withdrawals")
        .select("id, amount, requested_at, paid_at, status, pix_key, pix_key_type")
        .eq("user_id", user!.id)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        amount: Number(r.amount || 0),
        requested_at: r.requested_at,
        paid_at: r.paid_at,
        status: r.status,
        pix_key: r.pix_key,
        pix_key_type: r.pix_key_type,
      }));
    },
  });
}

/** Saldo via RPC — earned_total / withdrawn_total / available */
export function useReferralBalance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["referral-balance", user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async (): Promise<ReferralBalance> => {
      const { data, error } = await (supabase as any).rpc("referral_balance_self");
      if (error) throw error;
      const r = data || {};
      return {
        earned_total: Number(r.earned_total || 0),
        withdrawn_total: Number(r.withdrawn_total || 0),
        available: Number(r.available || 0),
      };
    },
  });
}

export interface MonthlyWithdrawalUsage {
  used: number;
  limit: number;
  remaining: number;
  minAmount: number;
}

export function useMonthlyWithdrawalUsage(): {
  data: MonthlyWithdrawalUsage;
  isLoading: boolean;
  refetch: () => void;
} {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["referral-withdrawal-usage", user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async (): Promise<MonthlyWithdrawalUsage> => {
      const defaultLimit = 4;
      const defaultMinAmount = 250;

      const [{ data: config }, { count, error: withdrawalsError }] = await Promise.all([
        (supabase as any)
          .from("referral_program_config")
          .select("withdraw_monthly_limit, withdraw_min_amount")
          .eq("id", true)
          .maybeSingle(),
        (supabase as any)
          .from("referral_withdrawals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .gte("requested_at", startOfMonth(new Date()).toISOString()),
      ]);

      if (withdrawalsError) throw withdrawalsError;

      const limit = Number(config?.withdraw_monthly_limit || defaultLimit);
      const minAmount = Number(config?.withdraw_min_amount || defaultMinAmount);
      const used = count || 0;
      return { used, limit, remaining: Math.max(0, limit - used), minAmount };
    },
  });
  return {
    data: q.data || { used: 0, limit: 4, remaining: 4, minAmount: 250 },
    isLoading: q.isLoading,
    refetch: () => q.refetch(),
  };
}

export function useRequestReferralWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { amount: number; pixKey?: string }) => {
      const { data, error } = await (supabase as any).rpc(
        "request_referral_commission_withdrawal",
        { p_amount: args.amount, p_pix_key: args.pixKey ?? null }
      );
      if (error) throw error;
      return data as {
        ok: boolean;
        reason?: string;
        amount?: number;
        available?: number;
        available_after?: number;
        requested?: number;
        monthly_used?: number;
        monthly_limit?: number;
        min_amount?: number;
        withdrawal_id?: string;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-pending-list"] });
      qc.invalidateQueries({ queryKey: ["referral-paid-list"] });
      qc.invalidateQueries({ queryKey: ["referral-balance"] });
      qc.invalidateQueries({ queryKey: ["referral-withdrawal-usage"] });
    },
  });
}
