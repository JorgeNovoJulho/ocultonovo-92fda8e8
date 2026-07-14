/**
 * useMagneticEnergy — Onda C
 * Boost elegante: aumenta descoberta/presença/prioridade durante 30 min.
 * Não é Tinder Boost — discreto, com cooldown por design (max 120 min/sessão).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useCallback } from 'react';

export interface MagneticStatus {
  active: boolean;
  multiplier?: number;
  ends_at?: string;
  remaining_seconds?: number;
  source?: string;
}

export function useMagneticEnergy() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['magnetic-status', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<MagneticStatus> => {
      const { data } = await (supabase as any).rpc('magnetic_status');
      return (data as MagneticStatus) || { active: false };
    },
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.active ? 30_000 : 5 * 60_000),
  });

  const activate = useCallback(
    async (minutes = 30, multiplier = 1.5, source = 'manual') => {
      const { data, error } = await (supabase as any).rpc('magnetic_activate', {
        p_minutes: minutes,
        p_multiplier: multiplier,
        p_source: source,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['magnetic-status', user?.id] });
      return data;
    },
    [qc, user?.id],
  );

  return {
    status: statusQ.data ?? { active: false },
    isLoading: statusQ.isLoading,
    activate,
  };
}
