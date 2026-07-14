/**
 * Aura V3 — Estilos visuais por nível (Aura Evolutiva)
 * CSS-only. Sem WebGL, sem partículas reais.
 */

export interface LevelVisual {
  /** multiplicador de glow (1..1.6) */
  glow: number;
  /** anel extra (Tailwind class), opcional */
  ringClass?: string;
  /** label curto (mostrado no painel/tooltip) */
  label: string;
  /** cor do label (Tailwind) */
  labelColor: string;
  /** intensidade da pulsação (s) — menor = mais rápido */
  pulseSpeed: number;
}

export function levelVisual(level: number): LevelVisual {
  const lvl = Math.max(1, Math.min(99, Math.round(level || 1)));
  if (lvl >= 5) return {
    glow: 1.6,
    ringClass: 'ring-amber-300/80',
    label: 'Energia Rara',
    labelColor: 'text-amber-300',
    pulseSpeed: 2.5,
  };
  if (lvl === 4) return {
    glow: 1.4,
    ringClass: 'ring-fuchsia-300/70',
    label: 'Aura Magnética',
    labelColor: 'text-fuchsia-300',
    pulseSpeed: 3,
  };
  if (lvl === 3) return {
    glow: 1.2,
    ringClass: 'ring-pink-300/60',
    label: 'Sintonia Forte',
    labelColor: 'text-pink-300',
    pulseSpeed: 3.5,
  };
  if (lvl === 2) return {
    glow: 1.1,
    label: 'Vibração Ativa',
    labelColor: 'text-violet-300',
    pulseSpeed: 4,
  };
  return {
    glow: 1,
    label: 'Energia Inicial',
    labelColor: 'text-foreground',
    pulseSpeed: 4.5,
  };
}
