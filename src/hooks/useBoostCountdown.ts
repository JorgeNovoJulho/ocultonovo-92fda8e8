import { useEffect, useRef, useState } from 'react';

/**
 * Tick adaptativo para contagens regressivas do Aura Boost.
 * - <60s: tick 1s (segundos visíveis)
 * - <10min: tick 15s
 * - >=10min: tick 60s
 * Retorna ms restantes e label formatado consistente em todo o app.
 */
export interface BoostCountdown {
  ms: number;
  expired: boolean;
  /** "MM:SS" quando <10min, senão "Xh Ymin" / "Xmin" */
  label: string;
  /** Sempre "Xh Ymin" / "Xmin" / "<1 min" — útil para tooltips longos */
  longLabel: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function formatBoostShort(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  if (total < 600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${pad(m)}:${pad(s)}`;
  }
  const totalMin = Math.floor(total / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
}

export function formatBoostLong(ms: number): string {
  if (ms <= 0) return 'expirado';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin <= 0) return 'menos de 1 min';
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function useBoostCountdown(expiresAt: string | null | undefined): BoostCountdown {
  const target = expiresAt ? new Date(expiresAt).getTime() : 0;
  const [ms, setMs] = useState<number>(() => Math.max(0, target - Date.now()));
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!target) {
      setMs(0);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const diff = Math.max(0, target - Date.now());
      setMs(diff);
      if (diff <= 0) return;
      const interval = diff < 60_000 ? 1000 : diff < 600_000 ? 15_000 : 60_000;
      timerRef.current = window.setTimeout(tick, interval);
    };
    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [target]);

  return {
    ms,
    expired: ms <= 0,
    label: formatBoostShort(ms),
    longLabel: formatBoostLong(ms),
  };
}
