/**
 * useStoryMetricsRealtime — assina story_likes / story_dislikes / story_views
 * e invalida queries de contagem/lista para o storyId fornecido.
 *
 * Garante que os contadores (👍 👎 👁) atualizem em tempo real conforme outros
 * usuários interagem, sem precisar fechar e reabrir o viewer.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeTable } from '@/lib/realtimeBus';

export function useStoryMetricsRealtime(storyId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!storyId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['story-like-count', storyId] });
      qc.invalidateQueries({ queryKey: ['story-dislike-count', storyId] });
      qc.invalidateQueries({ queryKey: ['story-view-count', storyId] });
      qc.invalidateQueries({ queryKey: ['story-likers', storyId] });
      qc.invalidateQueries({ queryKey: ['story-dislikers', storyId] });
      qc.invalidateQueries({ queryKey: ['story-views', storyId] });
    };

    const match = (payload: any) =>
      (payload?.new?.story_id === storyId) || (payload?.old?.story_id === storyId);

    const unsubLikes = subscribeTable('story_likes', (p: any) => { if (match(p)) invalidate(); });
    const unsubDislikes = subscribeTable('story_dislikes', (p: any) => { if (match(p)) invalidate(); });
    const unsubViews = subscribeTable('story_views', (p: any) => { if (match(p)) invalidate(); });

    return () => {
      unsubLikes();
      unsubDislikes();
      unsubViews();
    };
  }, [storyId, qc]);
}
