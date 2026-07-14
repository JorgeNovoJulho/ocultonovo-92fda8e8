/**
 * useOcultoPlayCreatorMilestones — Etapa 29.
 * Marcos cruzados pelos itens do criador (100/500/1k/5k/10k/50k views,
 * 10/50/100/500/1k likes). Stateless: o frontend decide o que já foi
 * mostrado via localStorage.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorMilestone {
  item_id: string;
  title: string | null;
  thumb_url: string | null;
  kind: string;
  metric: 'views' | 'likes';
  threshold: number;
  current_value: number;
  reached_recent: boolean;
}

export function useOcultoPlayCreatorMilestones(limit = 10) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto-play', 'creator-milestones', user?.id, limit],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CreatorMilestone[]> => {
      const { data, error } = await supabase.rpc(
        'oculto_play_creator_milestones' as never,
        { p_user_id: user!.id, p_limit: limit } as never,
      );
      if (error || !data) return [];
      return (data as any[]).map((r) => ({
        item_id: r.item_id,
        title: r.title,
        thumb_url: r.thumb_url,
        kind: r.kind,
        metric: r.metric,
        threshold: Number(r.threshold ?? 0),
        current_value: Number(r.current_value ?? 0),
        reached_recent: !!r.reached_recent,
      }));
    },
  });
}
