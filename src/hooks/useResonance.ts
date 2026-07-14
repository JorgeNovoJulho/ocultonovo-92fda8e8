import { useMemo } from 'react';
import type { PairCard } from '@/hooks/usePerfectPair';
import { getAuraBoost } from '@/lib/auraMemory';

/**
 * V3-C — Ressonância (frontend-only):
 * Detecta auras "em ressonância" com o usuário usando sinais já disponíveis,
 * sem custo de backend:
 *   - score de afinidade >= 75
 *   - >= 2 tags compartilhadas
 *   - >= 3 interações locais acumuladas (auraMemory)
 *
 * Auras ressonantes recebem um pulso visual sincronizado com a aura central.
 * Retorna um Set<string> com os ids dos cards ressonantes.
 */
export function useResonance(
  cards: PairCard[],
  scores: Record<string, number>
): Set<string> {
  return useMemo(() => {
    const out = new Set<string>();
    for (const c of cards) {
      const score = scores[c.id] ?? 0;
      const tags = (c.shared_tags || []).length;
      const interactions = getAuraBoost(c.id);
      const matches =
        (score >= 75 ? 1 : 0) + (tags >= 2 ? 1 : 0) + (interactions >= 3 ? 1 : 0);
      if (matches >= 2) out.add(c.id);
    }
    return out;
  }, [cards, scores]);
}
