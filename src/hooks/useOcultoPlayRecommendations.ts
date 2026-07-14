/**
 * useOcultoPlayRecommendations — Etapa 11
 *
 * Recomendação personalizada "Para Você" com motivo legível.
 * Backend explicável (sem caixa-preta), tudo via RPC SECURITY DEFINER.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';
import type { OcultoPlayItem } from './useOcultoPlayContent';

export interface OcultoPlayRecommendation extends OcultoPlayItem {
  reco_score: number;
  reco_reason: string;
}

export function useOcultoPlayRecommendations(limit = 20) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<OcultoPlayRecommendation[]>({
    queryKey: ['oculto-play', 'recommend', limit] as const,
    enabled: canAccess,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_recommend', { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as OcultoPlayRecommendation[];
    },
  });
}
