import { useEffect, useRef, useState } from 'react';
import { useAuraBoost } from '@/hooks/useAuraBoost';

/**
 * Região aria-live única para anunciar marcos do Aura Boost do próprio usuário.
 * Anuncia apenas: ativação, 10min restantes, 1min restante, expirado.
 * Throttle por marco: cada anúncio só ocorre uma vez por ciclo de boost.
 */
export function BoostLiveRegion() {
  const { status } = useAuraBoost();
  const [message, setMessage] = useState('');
  const announcedRef = useRef<Set<string>>(new Set());
  const cycleKeyRef = useRef<string>('');

  useEffect(() => {
    const key = status?.expires_at || '';
    // Reset marcos quando inicia um novo ciclo (novo expires_at)
    if (key !== cycleKeyRef.current) {
      cycleKeyRef.current = key;
      announcedRef.current = new Set();
    }
    if (!status?.active || !status.expires_at) return;

    const target = new Date(status.expires_at).getTime();

    const announce = (id: string, text: string) => {
      if (announcedRef.current.has(id)) return;
      announcedRef.current.add(id);
      setMessage(text);
    };

    // Marco "ativado" — única vez por ciclo
    announce('activated', 'Aura Boost ativado por 60 minutos.');

    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      if (diff <= 0) {
        announce('expired', 'Aura Boost expirado.');
        return;
      }
      if (diff <= 60_000) {
        announce('1min', 'Aura Boost termina em menos de 1 minuto.');
      } else if (diff <= 600_000) {
        announce('10min', 'Aura Boost termina em cerca de 10 minutos.');
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [status?.active, status?.expires_at]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
