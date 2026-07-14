/**
 * useOcultoPlayProgressLogger — Etapa 44
 *
 * Loga progresso do viewer para analytics de retenção.
 * - Snapshot a cada 10s enquanto o media está reproduzindo.
 * - Flush no `ended` (marca completed=true).
 * - Flush também no unmount/troca de item.
 * Usa requestIdleCallback quando disponível para não competir com UI.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';

interface Options {
  itemId: string | null | undefined;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  /** Intervalo em ms entre logs periódicos. Default: 10_000. */
  intervalMs?: number;
}

async function logProgress(itemId: string, position: number, duration: number, completed: boolean) {
  try {
    await supabase.rpc('oculto_play_log_progress', {
      p_item_id: itemId,
      p_position_seconds: Math.round(position),
      p_duration_seconds: Math.round(duration),
      p_completed: completed,
    });
  } catch {
    /* silencioso — analytics não deve quebrar o player */
  }
}

function schedule(cb: () => void) {
  const ric = (window as any).requestIdleCallback as ((c: () => void) => number) | undefined;
  if (ric) ric(cb);
  else window.setTimeout(cb, 0);
}

export function useOcultoPlayProgressLogger({ itemId, mediaRef, intervalMs = 10_000 }: Options) {
  const lastLoggedPosRef = useRef(0);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !itemId) return;

    lastLoggedPosRef.current = 0;
    let timer: number | null = null;

    const tick = () => {
      if (!el || el.paused || el.ended) return;
      const pos = el.currentTime || 0;
      const dur = el.duration && isFinite(el.duration) ? el.duration : 0;
      // Evita ruído quando o usuário não andou
      if (Math.abs(pos - lastLoggedPosRef.current) < 1) return;
      lastLoggedPosRef.current = pos;
      schedule(() => logProgress(itemId, pos, dur, false));
    };

    const onEnded = () => {
      const dur = el.duration && isFinite(el.duration) ? el.duration : 0;
      schedule(() => logProgress(itemId, dur, dur, true));
    };

    timer = window.setInterval(tick, intervalMs);
    el.addEventListener('ended', onEnded);

    return () => {
      if (timer) window.clearInterval(timer);
      el.removeEventListener('ended', onEnded);
      // Flush final no unmount/troca
      const pos = el.currentTime || 0;
      const dur = el.duration && isFinite(el.duration) ? el.duration : 0;
      if (pos > 1) {
        schedule(() => logProgress(itemId, pos, dur, false));
      }
    };
  }, [itemId, mediaRef, intervalMs]);
}
