/**
 * Social Universe — matchmaking barrel.
 * Onda B: scaffolding. A lógica de compatibilidade/energia/magnetismo
 * será plugada na Onda C reutilizando este namespace.
 */
export type {
  CompatibilitySignal,
  MagnetismTier,
  RarityTier,
} from '@/social-universe/types';

import type { CompatibilitySignal, MagnetismTier } from '@/social-universe/types';

/** Heurística leve para classificar magnetismo a partir de afinidade + recência. */
export function classifyMagnetism(affinity: number, recencySec: number): MagnetismTier {
  const recencyScore = recencySec < 60 * 5 ? 25 : recencySec < 60 * 60 ? 15 : 5;
  const total = affinity + recencyScore;
  if (total >= 100) return 'extreme';
  if (total >= 80) return 'high';
  if (total >= 50) return 'medium';
  return 'low';
}

export function rankSignals(signals: CompatibilitySignal[]): CompatibilitySignal[] {
  return [...signals].sort((a, b) => b.affinity - a.affinity);
}
