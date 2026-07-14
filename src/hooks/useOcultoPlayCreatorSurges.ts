/**
 * useOcultoPlayCreatorSurges — Etapa 28.
 * Detecta itens do criador atual com surge de views recente
 * (pico agora). Refresca a cada 2min.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorSurgeItem {
  item_id: string;
  title: string | null;
  thumb_url: string | null;
  kind: string;
  recent_views: number;
  baseline_views: number;
  surge_ratio: number;
}

export function useOcultoPlayCreatorSurges(opts?: {
  windowMin?: number;
  minRatio?: number;
  minRecent?: number;
  limit?: number;
}) {
  const { user } = useAuth();
  const windowMin = opts?.windowMin ?? 30;
  const minRatio = opts?.minRatio ?? 2.5;
  const minRecent = opts?.minRecent ?? 5;
  const limit = opts?.limit ?? 5;

  return useQuery({
    queryKey: ['oculto-play', 'creator-surges', user?.id, windowMin, minRatio, minRecent, limit],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<CreatorSurgeItem[]> => {
      const { data, error } = await supabase.rpc(
        'oculto_play_creator_surges' as never,
        {
          p_window_min: windowMin,
          p_min_ratio: minRatio,
          p_min_recent: minRecent,
          p_limit: limit,
          p_user_id: user!.id,
        } as never,
      );
      if (error || !data) return [];
      return (data as any[]).map((r) => ({
        item_id: r.item_id,
        title: r.title,
        thumb_url: r.thumb_url,
        kind: r.kind,
        recent_views: Number(r.recent_views ?? 0),
        baseline_views: Number(r.baseline_views ?? 0),
        surge_ratio: Number(r.surge_ratio ?? 0),
      }));
    },
  });
}
