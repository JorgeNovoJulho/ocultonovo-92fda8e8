/**
 * Mantém o Oculto Play em tempo real sem sobrecarregar celular modesto:
 *  - canal criado/editado  → atualiza as faixas "Canais" e páginas de canal;
 *  - item publicado, apagado, congelado ou editado → atualiza as seções.
 *
 * Mudanças só de contadores (views, curtidas) chegam o tempo todo e NÃO
 * disparam recarga: comparamos uma "assinatura" dos campos que importam.
 * Tudo com espera de 2,5 s para agrupar várias mudanças numa só recarga.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeTable } from '@/lib/realtimeBus';
import { PLAY_CHANNELS_KEY } from '@/hooks/usePlayChannels';

const signature = (row: any) =>
  row ? [row.is_published, row.is_frozen, row.channel_id, row.title, row.thumb_url, row.media_url, row.is_adult, row.kind].join('|') : '';

export function usePlayRealtimeSync(enabled = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const seen = new Map<string, string>();
    let itemsTimer: number | null = null;
    let channelsTimer: number | null = null;

    const refreshItems = () => {
      if (itemsTimer) return;
      itemsTimer = window.setTimeout(() => {
        itemsTimer = null;
        qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
        qc.invalidateQueries({ queryKey: ['oculto-play', 'direct-links'] });
        qc.invalidateQueries({ queryKey: PLAY_CHANNELS_KEY });
      }, 2500);
    };
    const refreshChannels = () => {
      if (channelsTimer) return;
      channelsTimer = window.setTimeout(() => {
        channelsTimer = null;
        qc.invalidateQueries({ queryKey: PLAY_CHANNELS_KEY });
      }, 1500);
    };

    const offItems = subscribeTable('oculto_play_items', (payload: any) => {
      const type = payload?.eventType;
      const row = payload?.new ?? null;
      const id = row?.id ?? payload?.old?.id;
      if (type === 'INSERT' || type === 'DELETE') {
        if (id) seen.delete(id);
        refreshItems();
        return;
      }
      if (type === 'UPDATE' && id) {
        const sig = signature(row);
        const prev = seen.get(id);
        seen.set(id, sig);
        if (seen.size > 2000) seen.clear();
        // Primeira vez que vemos o item: só recarrega se ele saiu do ar.
        if (prev === undefined ? row?.is_published === false : prev !== sig) refreshItems();
      }
    });
    const offChannels = subscribeTable('oculto_play_channels', () => refreshChannels());

    return () => {
      offItems();
      offChannels();
      if (itemsTimer) window.clearTimeout(itemsTimer);
      if (channelsTimer) window.clearTimeout(channelsTimer);
    };
  }, [enabled, qc]);
}
