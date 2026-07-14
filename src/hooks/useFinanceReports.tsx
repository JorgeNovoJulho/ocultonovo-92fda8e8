import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export type FinanceOverview = {
  gross_total: number;
  tax_total: number;
  platform_total: number;
  affiliate_total: number;
  creator_total: number;
  tx_count: number;
  by_flow: Record<string, { gross: number; tax: number; platform: number; creator: number; affiliate: number; count: number }>;
  daily: Array<{ day: string; gross: number; tax: number; platform: number; creator: number; affiliate: number }>;
};

export function useFinanceOverview(start: Date, end: Date) {
  return useQuery({
    queryKey: ['finance-overview', start.toISOString(), end.toISOString()],
    queryFn: async (): Promise<FinanceOverview> => {
      const { data, error } = await supabase.rpc('get_finance_overview' as any, {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      });
      if (error) throw error;
      return (data || {}) as FinanceOverview;
    },
    staleTime: 60_000,
  });
}

export type TaxReportRow = {
  day: string;
  flow_type: string;
  tx_count: number;
  gross: number;
  tax: number;
  base: number;
};

export function useTaxReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['tax-report', startDate, endDate],
    queryFn: async (): Promise<TaxReportRow[]> => {
      const { data, error } = await supabase.rpc('get_tax_report_period' as any, {
        p_start: startDate,
        p_end: endDate,
      });
      if (error) throw error;
      return (data || []) as TaxReportRow[];
    },
    staleTime: 60_000,
  });
}

export type AffiliateEarnings = {
  total_earned: number;
  tx_count: number;
  gross_referred: number;
  daily: Array<{ day: string; earned: number; count: number }>;
  recent: Array<{ id: string; transaction_id: string; flow_type: string; gross_amount: number; affiliate_amount: number; created_at: string }>;
};

export function useAffiliateEarnings(start: Date, end: Date) {
  return useQuery({
    queryKey: ['affiliate-earnings', start.toISOString(), end.toISOString()],
    queryFn: async (): Promise<AffiliateEarnings> => {
      const { data, error } = await supabase.rpc('get_affiliate_earnings_period' as any, {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      });
      if (error) throw error;
      return (data || {}) as AffiliateEarnings;
    },
    staleTime: 60_000,
  });
}

export function exportToCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
