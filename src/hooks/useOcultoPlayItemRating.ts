/**
 * useOcultoPlayItemRating — avaliação 1–5 estrelas por item do Oculto Play.
 * Usa RPC `oculto_play_rating_summary` + `oculto_play_rate_item` no Supabase externo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

export interface PlayRatingSummary {
  avg: number;
  total: number;
  my_stars: number | null;
}

export function useOcultoPlayItemRating(itemId?: string | null) {
  const qc = useQueryClient();

  const query = useQuery<PlayRatingSummary>({
    queryKey: ['oculto-play-rating', itemId],
    enabled: !!itemId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('oculto_play_rating_summary', {
        p_item_id: itemId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        avg: Number(row?.avg ?? 0),
        total: Number(row?.total ?? 0),
        my_stars: row?.my_stars ?? null,
      };
    },
  });

  const rate = useMutation({
    mutationFn: async (stars: number) => {
      if (!itemId) throw new Error('Item inválido');
      const { error } = await (supabase as any).rpc('oculto_play_rate_item', {
        p_item_id: itemId,
        p_stars: stars,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Avaliação registrada!');
      qc.invalidateQueries({ queryKey: ['oculto-play-rating', itemId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao avaliar'),
  });

  return { ...query, rate };
}
