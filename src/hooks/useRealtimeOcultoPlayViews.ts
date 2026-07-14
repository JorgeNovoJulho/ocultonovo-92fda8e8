/**
 * useRealtimeOcultoPlayViews — escuta UPDATEs realtime em
 * `oculto_play_items` para um item específico e propaga o `view_count`
 * para o store global de contadores (useOcultoPlayCountersStore).
 *
 * Assim, qualquer card visível (vídeo, áudio, link) que monte este hook
 * passa a refletir incrementos disparados por outros usuários ou outras
 * abas em tempo real — sem refresh.
 */
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayCountersStore } from '@/store/useOcultoPlayCountersStore';

export function useRealtimeOcultoPlayViews(
  itemId: string | null | undefined,
  initialViewCount?: number | null,
) {
  useEffect(() => {
    if (!itemId) return;
    const setView = useOcultoPlayCountersStore.getState().setView;

    if (initialViewCount != null && Number.isFinite(Number(initialViewCount))) {
      setView(itemId, Number(initialViewCount));
    }

    const channel = supabase
      .channel(`oculto-play-views:${itemId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'oculto_play_items',
          filter: `id=eq.${itemId}`,
        },
        (payload: any) => {
          const next = Number(payload?.new?.view_count ?? 0);
          if (Number.isFinite(next)) setView(itemId, next);
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
  }, [itemId, initialViewCount]);
}
