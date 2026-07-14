/**
 * useTopicReplyCount — contagem de respostas de um tópico de comunidade
 * com atualização em tempo real via Supabase Realtime.
 *
 * - Carga inicial: count via head select (sem trazer linhas).
 * - Realtime: subscribe filtrado por topic_id em oculto_community_replies.
 *   INSERT incrementa, DELETE decrementa, UPDATE de status pode mudar visibilidade.
 * - Falha silenciosa: se realtime cair, próximo refetch (focus/15s) reconcilia.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export function useTopicReplyCount(topicId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ['oculto_community_reply_count', topicId];

  const query = useQuery({
    queryKey,
    enabled: !!topicId,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      if (!topicId) return 0;
      const { count, error } = await supabase
        .from('oculto_community_replies')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .in('status', ['published']);
      if (error) return 0;
      return count ?? 0;
    },
  });

  // Otimismo via realtime (única assinatura compartilhada por topicId)
  useEffect(() => {
    if (!topicId) return;
    const unsub = subscribeTable('oculto_community_replies', (payload: any) => {
      const row = payload?.new || payload?.old;
      if (!row || row.topic_id !== topicId) return;
      const evt = payload?.eventType || payload?.event;
      qc.setQueryData(queryKey, (old: number | undefined) => {
        const cur = typeof old === 'number' ? old : 0;
        if (evt === 'INSERT') {
          if (payload?.new?.status && payload.new.status !== 'published') return cur;
          return cur + 1;
        }
        if (evt === 'DELETE') return Math.max(0, cur - 1);
        if (evt === 'UPDATE') {
          const before = payload?.old?.status;
          const after = payload?.new?.status;
          if (before === after) return cur;
          if (after === 'published' && before !== 'published') return cur + 1;
          if (before === 'published' && after !== 'published') return Math.max(0, cur - 1);
        }
        return cur;
      });
    });
    return () => { try { unsub(); } catch { /* noop */ } };
  }, [topicId, qc]);

  return query;
}
