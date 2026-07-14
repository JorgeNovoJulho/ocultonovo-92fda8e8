/**
 * useOcultoPlayUpNext — Etapa 35
 *
 * Carrega a fila "Up Next" para autoplay sequencial a partir de um item-semente.
 * Backend explicável (oculto_play_up_next RPC).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import type { OcultoPlayItem } from './useOcultoPlayContent';

export interface OcultoPlayUpNextItem extends OcultoPlayItem {
  up_next_score: number;
  up_next_reason: string;
}

export function useOcultoPlayUpNext(
  seedItemId: string | null | undefined,
  exclude: string[] = [],
  limit = 10,
) {
  return useQuery<OcultoPlayUpNextItem[]>({
    queryKey: ['oculto-play', 'up-next', seedItemId, exclude.length, limit],
    enabled: !!seedItemId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!seedItemId) return [];
      const { data, error } = await (supabase as any).rpc('oculto_play_up_next', {
        p_seed_item_id: seedItemId,
        p_exclude: exclude,
        p_limit: limit,
      });
      if (error) {
        console.warn('[up-next] error', error.message);
        return [];
      }
      return (data ?? []) as OcultoPlayUpNextItem[];
    },
  });
}
