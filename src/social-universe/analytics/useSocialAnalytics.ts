/**
 * useSocialAnalytics — Onda B
 * Hook leve que consulta métricas agregadas do universo social.
 * Atualmente best-effort: usa RPCs já existentes; se não houver, retorna NULL.
 *
 * Onda C: criar `social_analytics_get(range)` consolidado.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { SU_QUERY_KEYS, SU_STALE } from '@/social-universe/constants';

export interface SocialAnalyticsSnapshot {
  online_now: number;
  rooms_active: number;
  matches_24h: number | null;
  storms_24h: number | null;
}

export function useSocialAnalytics(range: '24h' | '7d' = '24h') {
  return useQuery<SocialAnalyticsSnapshot>({
    queryKey: SU_QUERY_KEYS.socialAnalytics(range),
    staleTime: SU_STALE.metrics,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const cutoff = new Date(
        Date.now() - (range === '24h' ? 24 : 24 * 7) * 3600_000,
      ).toISOString();

      // Online now
      const { count: online } = await (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_online', true)
        .or('is_seed.is.null,is_seed.eq.false');

      // Salas ativas
      let rooms_active = 0;
      try {
        const { data } = await (supabase as any).rpc('aura_rooms_metrics_admin');
        rooms_active = (data || []).filter((r: any) => (r.presence ?? 0) > 0).length;
      } catch {
        /* ignore */
      }

      // Matches 24h (best-effort)
      let matches_24h: number | null = null;
      try {
        const { count } = await (supabase as any)
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', cutoff);
        matches_24h = count ?? null;
      } catch {
        matches_24h = null;
      }

      return {
        online_now: online ?? 0,
        rooms_active,
        matches_24h,
        storms_24h: null,
      };
    },
  });
}
