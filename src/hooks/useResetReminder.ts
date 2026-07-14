import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Avisa o usuário quando estiver perto do reset diário (00:00 America/Sao_Paulo)
 * para que ele complete missões e faça check-in do streak antes de virar o dia.
 *
 * Dispara toasts em 30, 10 e 1 minuto antes do reset (uma única vez por dia).
 */
const STORAGE_KEY = 'aura_reset_reminder_fired_v1';
const THRESHOLDS = [30, 10, 1]; // minutos antes do reset

function minutesUntilSpMidnight(): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const h = parseInt(parts.hour, 10);
  const m = parseInt(parts.minute, 10);
  const s = parseInt(parts.second, 10);
  const elapsed = h * 60 + m + s / 60;
  return 24 * 60 - elapsed;
}

function todayKeySp(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
}

function readFired(): { day: string; fired: number[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { day: todayKeySp(), fired: [] };
    const parsed = JSON.parse(raw);
    if (parsed?.day !== todayKeySp()) return { day: todayKeySp(), fired: [] };
    return parsed;
  } catch {
    return { day: todayKeySp(), fired: [] };
  }
}

function writeFired(state: { day: string; fired: number[] }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function useResetReminder() {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const tick = () => {
      const remaining = minutesUntilSpMidnight();
      const state = readFired();
      for (const t of THRESHOLDS) {
        if (remaining <= t && remaining > 0 && !state.fired.includes(t)) {
          state.fired.push(t);
          writeFired(state);
          const label = t === 1 ? 'menos de 1 minuto' : `${t} minutos`;
          toast.warning(`Reset diário em ${label}`, {
            description: 'Complete missões e faça check-in do streak antes da meia-noite (America/São Paulo).',
            duration: 6000,
          });
          break;
        }
      }
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
}
