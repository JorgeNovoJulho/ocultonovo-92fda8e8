/**
 * Helper centralizado para progresso de missões diárias do Aura.
 *
 * - Funciona fora de React (hooks, services, mutations).
 * - Anti-duplicidade: ignora chamadas repetidas para a mesma `key` dentro
 *   de uma janela curta (default 1500ms) — evita que um re-render ou um
 *   toque acidental múltiplo avance a mesma missão duas vezes.
 * - `reason`: motivo legível do avanço. É propagado no evento
 *   `aura-quest:progressed` para a UI exibir e o usuário confirmar que
 *   o trigger correto disparou (ex.: "tap rare aura: demeter").
 * - Swallow de erros: nunca interrompe o fluxo do usuário.
 */
import { supabase } from '@/lib/supabaseExternal';

export type AuraQuestKey =
  | 'visit_aura'
  | 'tap_3_auras'
  | 'send_super_dm'
  | 'resonance_3'
  | 'visit_room'
  | 'send_echo'
  | 'view_5_profiles'
  | 'tap_rare_aura'
  | 'send_3_dms'
  | 'join_storm'
  | 'randomize_aura'
  | 'send_gift'
  | 'follow_profile'
  | 'like_post'
  | 'save_post'
  | 'vote_poll'
  | 'comment_post'
  | 'visit_notifications'
  | 'visit_vitrine_vip'
  | 'visit_canal_vip';

export const AURA_QUEST_EVENT = 'aura-quest:progressed';

export interface AuraQuestProgressedDetail {
  key: AuraQuestKey | string;
  amount: number;
  reason?: string;
  at: number;
}

interface ProgressOptions {
  /** Texto curto exibido no painel — ajuda a confirmar qual trigger disparou. */
  reason?: string;
  /**
   * Janela (ms) em que chamadas repetidas da MESMA key+reason são ignoradas.
   * Útil para evitar double-fire por re-render. Default 1500ms.
   */
  windowMs?: number;
  /**
   * Quando true, ignora o lock e força o progresso (use para casos
   * legitimamente repetíveis, como `send_3_dms` em rajada controlada).
   */
  bypassLock?: boolean;
}

const lastFireAt: Record<string, number> = {};

function makeLockKey(key: string, reason?: string): string {
  return reason ? `${key}::${reason}` : key;
}

export async function progressAuraQuest(
  key: AuraQuestKey | string,
  amount = 1,
  options: ProgressOptions = {},
): Promise<{ skipped: boolean; reason?: string }> {
  const windowMs = Math.max(0, options.windowMs ?? 1500);
  const lockKey = makeLockKey(key, options.reason);
  const now = Date.now();

  if (!options.bypassLock && windowMs > 0) {
    const last = lastFireAt[lockKey] ?? 0;
    if (now - last < windowMs) {
      return { skipped: true, reason: 'debounced' };
    }
  }
  lastFireAt[lockKey] = now;

  try {
    await (supabase as any).rpc('aura_progress_quest', {
      p_quest_key: key,
      p_amount: Math.max(amount, 1),
    });
  } catch {
    /* silencioso: missão é progressão acessória, nunca bloqueia UX */
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent<AuraQuestProgressedDetail>(AURA_QUEST_EVENT, {
          detail: { key, amount, reason: options.reason, at: now },
        }),
      );
    } catch { /* noop */ }
  }
  return { skipped: false };
}
