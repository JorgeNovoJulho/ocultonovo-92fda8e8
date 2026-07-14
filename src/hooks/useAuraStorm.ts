import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface AuraStorm {
  id: string;
  kind: 'tempestade' | 'aurora' | 'eclipse' | 'meteoros';
  starts_at: string;
  ends_at: string;
  intensity: number;
  message: string | null;
  remaining_seconds: number;
}

/**
 * Polling visibility-aware (60s) sobre `aura_current_storm()`.
 * Pausa quando aba escondida. Sem realtime.
 */
export function useAuraStorm(intervalMs = 60_000) {
  const [storm, setStorm] = useState<AuraStorm | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const { data } = await (supabase as any).rpc('aura_current_storm');
        if (!cancelled) setStorm((data && data[0]) || null);
      } catch {
        if (!cancelled) setStorm(null);
      }
    };

    const start = () => {
      fetchOnce();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(fetchOnce, intervalMs);
    };
    const stop = () => {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    };

    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVis);
    if (!document.hidden) start();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, [intervalMs]);

  return storm;
}
