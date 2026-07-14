/**
 * useNoiteOculta — Onda C
 * Polling 60s do RPC `noite_oculta_current`. Pausa quando a aba está oculta.
 * Sem realtime, sem timers contínuos pesados.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface NoiteOculta {
  id: string;
  kind: 'madrugada_secreta' | 'eclipse_social' | 'tempestade_aura' | 'noite_vip';
  title: string;
  subtitle: string | null;
  starts_at: string;
  ends_at: string;
  hue: number;
  emoji: string;
  vip_only: boolean;
  intensity: number;
  effects: Record<string, unknown>;
  remaining_seconds: number;
}

export function useNoiteOculta(intervalMs = 60_000) {
  const [noite, setNoite] = useState<NoiteOculta | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const { data } = await (supabase as any).rpc('noite_oculta_current');
        if (!cancelled) setNoite((data && data[0]) || null);
      } catch {
        if (!cancelled) setNoite(null);
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

  return noite;
}
