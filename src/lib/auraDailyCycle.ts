/**
 * Aura V3 — Ciclos Diários
 * Determinístico por hora local. Sem rede, sem timer pesado.
 * O caller decide quando reavaliar (a cada 60s basta).
 */

export type DailyCycleKind = 'manha' | 'tarde' | 'noite' | 'madrugada';

export interface DailyCycle {
  kind: DailyCycleKind;
  name: string;
  emoji: string;
  /** Tons ambiente (HSL hue) usados pelo AuraField */
  hueA: number;
  hueB: number;
  hueC: number;
  /** Curiosidade: descrição emocional */
  vibe: string;
}

const CYCLES: Record<DailyCycleKind, DailyCycle> = {
  manha: {
    kind: 'manha',
    name: 'Manhã Suave',
    emoji: '🌅',
    hueA: 200, hueB: 260, hueC: 320,
    vibe: 'Auras leves circulando',
  },
  tarde: {
    kind: 'tarde',
    name: 'Tarde Magnética',
    emoji: '✨',
    hueA: 280, hueB: 220, hueC: 330,
    vibe: 'Conexões em alta densidade',
  },
  noite: {
    kind: 'noite',
    name: 'Noite Intensa',
    emoji: '🌙',
    hueA: 285, hueB: 235, hueC: 310,
    vibe: 'Energia social no pico',
  },
  madrugada: {
    kind: 'madrugada',
    name: 'Madrugada Rara',
    emoji: '🌌',
    hueA: 270, hueB: 240, hueC: 290,
    vibe: 'Auras incomuns por aí',
  },
};

export function getDailyCycle(now: Date = new Date()): DailyCycle {
  const h = now.getHours();
  if (h >= 5 && h < 12) return CYCLES.manha;
  if (h >= 12 && h < 18) return CYCLES.tarde;
  if (h >= 18 && h < 23) return CYCLES.noite;
  return CYCLES.madrugada;
}
