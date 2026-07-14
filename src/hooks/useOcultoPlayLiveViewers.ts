/**
 * useOcultoPlayLiveViewers — Etapa 51
 *
 * Conta espectadores simultâneos de um item do Oculto Play usando
 * Supabase Realtime Presence. Cada cliente entra no canal
 * `oculto-play-viewers:<itemId>` e o tamanho do estado de presença
 * é o número de "assistindo agora".
 *
 * Para preservar privacidade, só publicamos um id efêmero (uuid local).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

function ephemeralId(): string {
  try {
    const k = 'oculto_play_viewer_eid';
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function useOcultoPlayLiveViewers(itemId: string | null | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!itemId) { setCount(0); return; }
    const eid = ephemeralId();
    const channel = supabase.channel(`oculto-play-viewers:${itemId}`, {
      config: { presence: { key: eid } },
    });

    const recompute = () => {
      try {
        const state = channel.presenceState() as Record<string, unknown[]>;
        // contagem de chaves distintas (1 por viewer)
        setCount(Object.keys(state).length);
      } catch {
        setCount(0);
      }
    };

    channel
      .on('presence', { event: 'sync' }, recompute)
      .on('presence', { event: 'join' }, recompute)
      .on('presence', { event: 'leave' }, recompute)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ at: Date.now() });
        }
      });

    return () => {
      try { channel.untrack(); } catch {}
      supabase.removeChannel(channel);
    };
  }, [itemId]);

  return count;
}
