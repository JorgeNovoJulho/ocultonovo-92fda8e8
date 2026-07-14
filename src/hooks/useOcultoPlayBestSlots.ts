/**
 * useOcultoPlayBestSlots — Etapa 22.
 * Retorna top janelas (dia/hora BRT) com melhor histórico de views/item
 * para o tipo de conteúdo informado (ou geral).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface BestPublishSlot {
  dow: number;            // 0=Dom..6=Sáb
  hour: number;           // 0..23 BRT
  items_published: number;
  views_per_item: number;
  score: number;
}

export function useOcultoPlayBestSlots(opts?: {
  days?: number;
  kind?: string | null;
  limit?: number;
  enabled?: boolean;
}) {
  const days  = opts?.days  ?? 30;
  const kind  = opts?.kind  ?? null;
  const limit = opts?.limit ?? 5;

  return useQuery({
    queryKey: ['oculto-play', 'best-slots', days, kind, limit],
    enabled: opts?.enabled ?? true,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BestPublishSlot[]> => {
      const { data, error } = await supabase.rpc(
        'oculto_play_best_publish_slots' as never,
        { p_days: days, p_kind: kind, p_limit: limit } as never,
      );
      if (error) return [];
      return (data ?? []) as BestPublishSlot[];
    },
  });
}
