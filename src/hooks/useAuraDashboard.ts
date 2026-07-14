/**
 * useAuraDashboard — Onda A
 * Reúne em UMA chamada (`aura_dashboard_get`) os dados que antes
 * exigiam 5-6 RPCs separados na página Aura Match.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface AuraDashboard {
  user_id: string;
  progress: any | null;
  storm: any | null;
  attention: any | null;
  passersby: any | null;
  weekly_chest: any | null;
  my_rank: any | null;
  updated_at: string;
}

export function useAuraDashboard() {
  const { user } = useAuth();
  return useQuery<AuraDashboard | null>({
    queryKey: ['aura-dashboard', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('aura_dashboard_get');
      if (error) throw error;
      if (!data || data.error) return null;
      return data as AuraDashboard;
    },
  });
}
