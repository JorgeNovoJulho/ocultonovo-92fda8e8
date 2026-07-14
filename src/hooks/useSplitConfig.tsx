/**
 * useSplitConfig — leitura/atualização da configuração dinâmica de split.
 * Backend é a fonte da verdade (RPC update_split_config valida soma=100%).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';

export interface SplitConfig {
  id: string;
  platform_percent: number;
  tax_percent: number;
  creator_percent: number;
  affiliate_percent: number;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
}

const QK = ['split-config', 'active'] as const;

export function useSplitConfig() {
  return useQuery({
    queryKey: QK,
    queryFn: async (): Promise<SplitConfig | null> => {
      const { data, error } = await supabase
        .from('split_config' as any)
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSplitConfigHistory(limit = 20) {
  return useQuery({
    queryKey: ['split-config', 'history', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('split_config' as any)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useUpdateSplitConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      platform: number;
      tax: number;
      creator: number;
      affiliate: number;
      notes?: string;
    }) => {
      const sum = +(input.platform + input.tax + input.creator + input.affiliate).toFixed(2);
      if (sum !== 100) throw new Error(`A soma deve ser 100% (atual: ${sum}%)`);

      const { data, error } = await supabase.rpc('update_split_config' as any, {
        p_platform: input.platform,
        p_tax: input.tax,
        p_creator: input.creator,
        p_affiliate: input.affiliate,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as SplitConfig;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['split-config'] });
      toast({ title: 'Configuração atualizada', description: 'Novo split aplicado a todas as transações futuras.' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    },
  });
}
