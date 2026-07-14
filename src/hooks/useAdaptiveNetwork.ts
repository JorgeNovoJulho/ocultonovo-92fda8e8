/**
 * useAdaptiveNetwork — detecta condições de rede e capacidade do device
 * (Network Information API + navigator.deviceMemory + hardwareConcurrency)
 * e devolve um perfil de prefetch para o Oculto Play.
 *
 * Tiers:
 *   - "low"  : 2g, slow-2g, saveData=true, deviceMemory<=2GB
 *   - "mid"  : 3g, deviceMemory<=4GB
 *   - "high" : 4g/5g, wifi, ethernet, deviceMemory>=6GB
 *
 * Resultado prático: limita itens montados na janela vertical e quantos
 * vídeos/thumbs pré-carregar. Reavalia ao trocar de rede (event 'change').
 */
import { useEffect, useState } from 'react';

export type NetworkTier = 'low' | 'mid' | 'high';

export interface AdaptiveProfile {
  tier: NetworkTier;
  /** Itens montados antes do ativo na janela vertical. */
  windowBefore: number;
  /** Itens montados depois do ativo. */
  windowAfter: number;
  /** Quantas thumbnails pré-carregar à frente. */
  thumbPrefetch: number;
  /** Quantos vídeos seguintes podem ser pré-carregados (max simultâneo). */
  videoPrefetch: number;
  /** Limite de itens buscados do feed (mobile vertical). */
  feedLimit: number;
  /** True quando o usuário sinalizou saveData ou rede ruim. */
  saveData: boolean;
}

type ConnectionLike = {
  effectiveType?: '2g' | 'slow-2g' | '3g' | '4g' | '5g';
  saveData?: boolean;
  downlink?: number;
  type?: string;
  addEventListener?: (ev: string, cb: () => void) => void;
  removeEventListener?: (ev: string, cb: () => void) => void;
};

function readConnection(): ConnectionLike | null {
  const n = navigator as Navigator & {
    connection?: ConnectionLike;
    mozConnection?: ConnectionLike;
    webkitConnection?: ConnectionLike;
  };
  return n.connection ?? n.mozConnection ?? n.webkitConnection ?? null;
}

function readDeviceMemory(): number {
  const n = navigator as Navigator & { deviceMemory?: number };
  return typeof n.deviceMemory === 'number' ? n.deviceMemory : 4;
}

function computeTier(conn: ConnectionLike | null, mem: number): NetworkTier {
  const et = conn?.effectiveType;
  const save = !!conn?.saveData;
  if (save || et === '2g' || et === 'slow-2g' || mem <= 2) return 'low';
  if (et === '3g' || mem <= 4) return 'mid';
  return 'high';
}

function profileFor(tier: NetworkTier, saveData: boolean): AdaptiveProfile {
  switch (tier) {
    case 'low':
      return {
        tier, saveData,
        windowBefore: 0, windowAfter: 1,
        thumbPrefetch: 1, videoPrefetch: 0,
        feedLimit: 6,
      };
    case 'mid':
      return {
        tier, saveData,
        windowBefore: 1, windowAfter: 1,
        thumbPrefetch: 2, videoPrefetch: 1,
        feedLimit: 10,
      };
    case 'high':
    default:
      return {
        tier, saveData,
        windowBefore: 1, windowAfter: 2,
        thumbPrefetch: 4, videoPrefetch: 1,
        feedLimit: 14,
      };
  }
}

export function useAdaptiveNetwork(): AdaptiveProfile {
  const [profile, setProfile] = useState<AdaptiveProfile>(() => {
    if (typeof navigator === 'undefined') return profileFor('high', false);
    const conn = readConnection();
    const mem = readDeviceMemory();
    return profileFor(computeTier(conn, mem), !!conn?.saveData);
  });

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const conn = readConnection();
    const mem = readDeviceMemory();
    const recompute = () => {
      const c = readConnection();
      setProfile(profileFor(computeTier(c, mem), !!c?.saveData));
    };
    if (conn?.addEventListener) {
      conn.addEventListener('change', recompute);
      return () => { try { conn.removeEventListener?.('change', recompute); } catch { /* noop */ } };
    }
    return;
  }, []);

  return profile;
}
