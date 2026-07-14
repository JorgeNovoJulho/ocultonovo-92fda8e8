/**
 * Realtime para uma comunidade — invalida caches quando tópicos/replies/membros mudam.
 * Leve: 1 canal por comunidade, lifecycle preso ao componente.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export function useCommunityRealtime(communityId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!communityId) return;
    const channel = supabase
      .channel(`oculto_community_rt:${communityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_community_topics', filter: `community_id=eq.${communityId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['oculto_community_topics', communityId] });
          qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_community_members', filter: `community_id=eq.${communityId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['oculto_community_active_members', communityId] });
          qc.invalidateQueries({ queryKey: ['oculto_community_pending_members', communityId] });
          qc.invalidateQueries({ queryKey: ['oculto_community_pending_count', communityId] });
          qc.invalidateQueries({ queryKey: ['oculto_community_my_membership', communityId] });
          qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch { /* noop */ }
    };
  }, [communityId, qc]);
}

/**
 * Realtime para um tópico — atualiza replies em tempo real.
 */
export function useCommunityTopicRealtime(topicId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!topicId) return;
    const channel = supabase
      .channel(`oculto_community_topic_rt:${topicId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_community_replies', filter: `topic_id=eq.${topicId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['oculto_community_replies', topicId] });
          qc.invalidateQueries({ queryKey: ['oculto_community_topic', topicId] });
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch { /* noop */ }
    };
  }, [topicId, qc]);
}
