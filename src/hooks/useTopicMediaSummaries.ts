/**
 * useTopicMediaSummaries — busca em batch um "resumo seguro" de mídia
 * por tópico para a listagem da comunidade. NUNCA retorna a URL original
 * da mídia, apenas: { kind, cover_url, has_media }.
 *
 * Esse é o único dado exibido no listing — o link real só é resolvido
 * quando o usuário abre o modal de preview da mídia.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export type TopicMediaSummary = {
  kind: 'image' | 'video' | 'audio';
  cover_url: string | null;
  /** URL real da mídia — usada como fallback de preview na listagem
   *  quando cover_url está vazio (imagens são sua própria capa; vídeos
   *  antigos sem capa caem para <video preload="metadata">). */
  url: string | null;
};

export function useTopicMediaSummaries(topicIds: string[]) {
  const key = [...topicIds].sort().join(',');
  return useQuery({
    queryKey: ['oculto_community_topic_media_summary_v2', key],
    enabled: topicIds.length > 0,
    queryFn: async (): Promise<Map<string, TopicMediaSummary>> => {
      const { data, error } = await supabase
        .from('oculto_community_media')
        .select('topic_id,kind,cover_url,url,created_at')
        .in('topic_id', topicIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const map = new Map<string, TopicMediaSummary>();
      for (const row of (data as any[] | null) ?? []) {
        if (map.has(row.topic_id)) continue;
        const url = (row as any).url ?? null;
        // Para imagens, a própria URL é a capa.
        const cover = row.cover_url ?? (row.kind === 'image' ? url : null);
        map.set(row.topic_id, {
          kind: row.kind,
          cover_url: cover,
          url,
        });
      }
      return map;
    },
    staleTime: 30_000,
  });
}
