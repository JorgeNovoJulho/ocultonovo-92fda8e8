import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';

export interface AddonConfig {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly: number;
  is_enabled: boolean;
  min_plan: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export function useAddonConfig(slug: string) {
  return useQuery({
    queryKey: ['addon-config', slug],
    queryFn: async (): Promise<AddonConfig | null> => {
      const { data, error } = await supabase
        .from('addon_configs')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) {
        console.warn('[AddonConfig] fetch error:', error.message);
        return null;
      }
      return data as AddonConfig | null;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useAllAddonConfigs() {
  return useQuery({
    queryKey: ['addon-configs'],
    queryFn: async (): Promise<AddonConfig[]> => {
      const { data, error } = await supabase
        .from('addon_configs')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as AddonConfig[];
    },
    staleTime: 60_000,
  });
}

export function useUpdateAddonConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AddonConfig> }) => {
      const { error } = await supabase
        .from('addon_configs')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addon-configs'] });
      queryClient.invalidateQueries({ queryKey: ['addon-config'] });
      toast({ title: 'Configuração salva', description: 'Add-on atualizado com sucesso.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
