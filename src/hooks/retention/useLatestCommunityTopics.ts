/**
 * useLatestCommunityTopics — busca o último tópico publicado de cada
 * comunidade ativa. Usado pelo CentralAuraModal para mostrar um card
 * rotativo "Último tópico em [Comunidade]" que muda a cada abertura.
 *
 * Implementação enxuta — uma única query no externo, ordenada por
 * created_at desc, agrupada client-side por community_id (mantém apenas
 * o primeiro/mais recente por comunidade).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

const sb = supabase as any;

export interface LatestCommunityTopic {
  topic_id: string;
  topic_title: string;
  topic_created_at: string;
  community_id: string;
  community_slug: string;
  community_title: string;
  community_cover: string | null;
}

export function useLatestCommunityTopics(limit = 20) {
  return useQuery<LatestCommunityTopic[]>({
    queryKey: ['retention', 'latest-community-topics', limit],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // 1) Busca tópicos publicados recentes (mais que o limite p/ ter variedade)
      const { data: topics, error } = await sb
        .from('oculto_community_topics')
        .select('id,title,created_at,community_id,status')
        .in('status', ['published'])
        .order('created_at', { ascending: false })
        .limit(limit * 4);
      if (error || !topics?.length) return [];

      // 2) Mantém apenas o primeiro (mais recente) por comunidade
      const byCommunity = new Map<string, any>();
      for (const t of topics as any[]) {
        if (!t?.community_id || !t?.id) continue;
        if (!byCommunity.has(t.community_id)) byCommunity.set(t.community_id, t);
        if (byCommunity.size >= limit) break;
      }
      const uniqueTopics = Array.from(byCommunity.values());
      if (!uniqueTopics.length) return [];

      // 3) Resolve dados da comunidade em batch
      const cIds = uniqueTopics.map((t) => t.community_id);
      const { data: comms } = await sb
        .from('oculto_communities')
        .select('id,slug,title,cover_url,avatar_url,status')
        .in('id', cIds)
        .eq('status', 'active');
      const commMap = new Map<string, any>();
      (comms ?? []).forEach((c: any) => commMap.set(c.id, c));

      return uniqueTopics
        .map((t: any): LatestCommunityTopic | null => {
          const c = commMap.get(t.community_id);
          if (!c || !c.slug) return null;
          return {
            topic_id: t.id,
            topic_title: t.title ?? 'Novo tópico',
            topic_created_at: t.created_at,
            community_id: c.id,
            community_slug: c.slug,
            community_title: c.title ?? 'Comunidade',
            community_cover: c.cover_url ?? c.avatar_url ?? null,
          };
        })
        .filter(Boolean) as LatestCommunityTopic[];
    },
  });
}
