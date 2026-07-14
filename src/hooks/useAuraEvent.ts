import { useEffect, useState } from 'react';
import { computeAuraEvent, type AuraEventState } from '@/lib/auraEvents';

/**
 * Reavalia o evento ativo a cada 60s.
 * Sem rede, sem realtime, sem rAF.
 */
export function useAuraEvent(onlineCount: number): AuraEventState {
  const [state, setState] = useState<AuraEventState>(() => computeAuraEvent(onlineCount));

  useEffect(() => {
    setState(computeAuraEvent(onlineCount));
    const id = window.setInterval(() => {
      setState(computeAuraEvent(onlineCount));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [onlineCount]);

  return state;
}
