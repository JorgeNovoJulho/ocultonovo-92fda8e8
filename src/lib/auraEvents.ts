/**
 * Aura Events — engine determinística e leve.
 * - Sem realtime, sem websockets adicionais, sem timers contínuos pesados.
 * - Recomputa o evento ativo a partir de (hora local + day-of-year + onlineCount + tier).
 * - O caller decide quando reavaliar (a cada 60s basta).
 *
 * Eventos possíveis:
 *   - 'pico'        🔥 Pico de conexões perto de você  (mais glow + mais movimento)
 *   - 'noturno'     💜 Modo noturno ativo               (paleta roxo/azul, brilho menor)
 *   - 'raras'       🌌 Conexões raras disponíveis      (highlight em cards score>=85)
 *   - 'alta'        ⚡ Universo social em alta         (mais auras / banner)
 *   - null          (estado neutro)
 */

export type AuraEventKind = 'pico' | 'noturno' | 'raras' | 'alta';

export interface AuraEventState {
  kind: AuraEventKind | null;
  message: string;
  emoji: string;
  hue: number; // tom dominante para UI
  /** Multiplicador de glow/intensidade aplicado por AuraField/AuraBubble */
  glowBoost: number; // 1.0 neutro, até 1.4
  /** Override de paleta (ex.: noturno) */
  ambientHue?: number;
  /** Quando o evento expira (timestamp ms) — usado para mostrar contagem se quiser */
  expiresAt: number;
}

/** Cápsula determinística por janela de 30 min */
function hashWindow(now: Date, salt = 0): number {
  const minutes = now.getHours() * 60 + Math.floor(now.getMinutes() / 30) * 30;
  const day = Math.floor(now.getTime() / 86_400_000);
  let h = (day * 1440 + minutes + salt) >>> 0;
  h ^= h << 13; h >>>= 0;
  h ^= h >> 17; h >>>= 0;
  h ^= h << 5;  h >>>= 0;
  return h;
}

function nextWindowMs(now: Date): number {
  const next = new Date(now);
  const m = now.getMinutes();
  next.setMinutes(m < 30 ? 30 : 60, 0, 0);
  return next.getTime();
}

/**
 * Computa o evento ativo neste instante.
 * Lógica leve, sem rede:
 *   - 21h–05h: 70% chance de 'noturno', 30% 'raras'
 *   - 12h–14h e 19h–22h (horários sociais): 50% 'pico', 25% 'alta', 25% 'raras'
 *   - onlineCount >= 50: força 'alta' em 1/3 dos slots
 *   - 1/8 das janelas: nenhum evento (universo neutro)
 */
export function computeAuraEvent(
  onlineCount: number,
  now: Date = new Date(),
): AuraEventState {
  const h = now.getHours();
  const w = hashWindow(now);
  const dice = w % 100;
  const expiresAt = nextWindowMs(now);

  // 1/8 janelas neutras (descanso visual)
  if ((w >> 8) % 8 === 0) {
    return { kind: null, message: '', emoji: '', hue: 280, glowBoost: 1, expiresAt };
  }

  // Boost por densidade
  const dense = onlineCount >= 50;

  let kind: AuraEventKind;
  if (h >= 21 || h < 5) {
    kind = dice < 70 ? 'noturno' : 'raras';
  } else if ((h >= 12 && h < 14) || (h >= 19 && h < 22)) {
    if (dice < 50) kind = 'pico';
    else if (dice < 75) kind = 'alta';
    else kind = 'raras';
  } else {
    if (dense && dice < 33) kind = 'alta';
    else if (dice < 55) kind = 'pico';
    else if (dice < 80) kind = 'raras';
    else kind = 'alta';
  }

  switch (kind) {
    case 'pico':
      return {
        kind, expiresAt,
        message: 'Pico de conexões perto de você',
        emoji: '🔥', hue: 18, glowBoost: 1.35,
      };
    case 'noturno':
      return {
        kind, expiresAt,
        message: 'Universo noturno ativo',
        emoji: '💜', hue: 270, glowBoost: 0.85, ambientHue: 260,
      };
    case 'raras':
      return {
        kind, expiresAt,
        message: 'Novas vibrações raras disponíveis',
        emoji: '🌌', hue: 200, glowBoost: 1.15,
      };
    case 'alta':
      return {
        kind, expiresAt,
        message: 'Muitas conexões ativas agora',
        emoji: '⚡', hue: 50, glowBoost: 1.25,
      };
  }
}
