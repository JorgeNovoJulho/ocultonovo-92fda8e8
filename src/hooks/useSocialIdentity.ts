/**
 * useSocialIdentity — Onda A
 * Hook unificado: 1 RPC `social_identity_get` substitui as 3 chamadas
 * paralelas de useSocialScore + usePrestige + useTrustScore.
 *
 * Os hooks legados continuam funcionando (shims/independentes) para não
 * quebrar componentes que usam apenas um. Em telas onde os 3 aparecem
 * juntos, prefira este hook + <SocialIdentityCard />.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import type { SocialScore } from '@/hooks/useSocialScore';
import type { PrestigeData } from '@/hooks/usePrestige';

export interface TrustData {
  score: number;
  verification_points: number;
  profile_completion_points: number;
  activity_points: number;
  response_rate_points: number;
  report_penalty: number;
  last_calculated_at: string;
}

export interface AuraSnapshot {
  xp: number;
  level: number;
  streak_days: number;
  xp_in_level: number;
  xp_to_next: number;
}

export interface SocialIdentity {
  user_id: string;
  score: SocialScore | null;
  prestige: PrestigeData | null;
  trust: TrustData | null;
  aura: AuraSnapshot | null;
  updated_at: string;
}

export function useSocialIdentity(userId?: string | null) {
  const { user } = useAuth();
  const target = userId ?? user?.id ?? null;

  return useQuery<SocialIdentity | null>({
    queryKey: ['social-identity', target],
    enabled: !!target,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('social_identity_get', {
        p_user: target,
      });
      if (error) throw error;
      if (!data || data.error) return null;
      return data as SocialIdentity;
    },
  });
}
