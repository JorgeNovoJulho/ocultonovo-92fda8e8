/**
 * Aura V3 — Micro Recompensas Sociais
 * Dispara um pulse leve em uma bolha alvo via CustomEvent global.
 * Throttle interno: 1 reação por alvo a cada 5s.
 */

export type MicroRewardKind = 'view' | 'approach' | 'energy' | 'echo';

const lastFiredRef: Record<string, number> = {};

export function fireAuraMicroReward(targetId: string, kind: MicroRewardKind = 'view') {
  if (!targetId) return;
  const now = Date.now();
  const last = lastFiredRef[targetId] || 0;
  if (now - last < 5000) return;
  lastFiredRef[targetId] = now;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('aura:micro-reward', { detail: { targetId, kind } })
  );
}

export const MICRO_REWARD_EVENT = 'aura:micro-reward';
