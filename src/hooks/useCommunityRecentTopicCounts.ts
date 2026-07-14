/**
 * useCommunityRecentTopicCounts — conta tópicos publicados nas últimas
 * 24h por comunidade. Usado pelo widget "Comunidades Ocultas" no feed
 * para destacar com um badge "novos hoje" e atrair cliques.
 *
 * Implementação leve: uma única query agrupada client-side por
 * community_id (Postgres não tem count(*) group by via PostgREST de
 * forma simples sem RPC, então fazemos contagem no client).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

const sb = supabase as any;

const SINCE_HOURS = 24;

export function useCommunityRecentTopicCounts(communityIds: string[]) {
  const ids = [...new Set(communityIds.filter(Boolean))].sort();
  const key = ids.join(',');
  return useQuery<Map<string, number>>({
    queryKey: ['community-recent-topics', SINCE_HOURS, key],
    enabled: ids.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const since = new Date(Date.now() - SINCE_HOURS * 3600_000).toISOString();
      const { data, error } = await sb
        .from('oculto_community_topics')
        .select('community_id,created_at,status')
        .in('community_id', ids)
        .in('status', ['published'])
        .gte('created_at', since)
        .limit(500);
      const map = new Map<string, number>();
      if (error || !data) return map;
      for (const row of data as Array<{ community_id: string }>) {
        map.set(row.community_id, (map.get(row.community_id) ?? 0) + 1);
      }
      return map;
    },
  });
}
