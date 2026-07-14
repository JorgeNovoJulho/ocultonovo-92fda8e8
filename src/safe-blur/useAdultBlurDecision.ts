/**
 * useAdultBlurDecision — fonte única de verdade para "este post deve
 * ficar com blur de proteção?".
 *
 * Combina:
 *  • useFeedExperienceMode → modo do usuário ('adult_only' | 'complete')
 *  • useSafeBlur (Zustand)  → estado global do Modo Blur Seguro + posts revelados
 *
 * Regra final (espelhada em desktop e mobile, sem props divergentes):
 *  - APENAS +18 (adult_only):     shouldBlur = false  → conteúdo aparece inteiro
 *  - EXPERIÊNCIA COMPLETA + +18:  shouldBlur = true   → cobre mídia E texto
 *  - Post não-+18:                shouldBlur = false  → nunca cobre
 *
 * RealFeed / RealPostCard / AdultMediaBlurOverlay devem consumir esta
 * decisão; nenhum componente recalcula o booleano sozinho.
 */
import { useFeedExperienceMode } from '@/hooks/useFeedExperienceMode';
import { useSafeBlur } from '@/safe-blur/SafeBlurProvider';

interface Input {
  postId: string;
  isAdult: boolean | null | undefined;
}

interface Decision {
  /** Post é marcado como +18 pelo autor. */
  postIsAdult: boolean;
  /** O blur de proteção deve ser aplicado a este post (mídia e texto). */
  shouldBlur: boolean;
  /** Estado atual do Modo Blur Seguro (botão "Blur" do topo do feed). */
  safeBlurOn: boolean;
  /** Este post específico já foi revelado pelo usuário. */
  revealed: boolean;
  /** Texto/mídia precisam ficar cobertos AGORA (shouldBlur && safeBlurOn && !revealed). */
  covered: boolean;
  /** Revelar este post (clica no overlay). */
  reveal: () => void;
}

export function useAdultBlurDecision({ postId, isAdult }: Input): Decision {
  const { isAdultOnly } = useFeedExperienceMode();
  const { safeBlurOn, isRevealed, revealPost } = useSafeBlur();

  const postIsAdult = isAdult === true;
  // No modo "Apenas +18" o feed já é 100% adulto: blur de proteção é redundante.
  const shouldBlur = postIsAdult && !isAdultOnly;
  const revealed = isRevealed(postId);
  const covered = shouldBlur && safeBlurOn && !revealed;

  return {
    postIsAdult,
    shouldBlur,
    safeBlurOn,
    revealed,
    covered,
    reveal: () => revealPost(postId),
  };
}
