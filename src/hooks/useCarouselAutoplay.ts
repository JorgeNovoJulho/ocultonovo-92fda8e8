import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface Options {
  itemCount: number;
  /** Seletor para localizar um card e medir largura. Default: filho direto. */
  itemSelector?: string;
  /** Gap horizontal entre cards (px). Default: 12. */
  gap?: number;
  /** Intervalo de autoplay (ms). Default: 5000. */
  intervalMs?: number;
  /** Tempo sem interação antes de retomar autoplay (ms). Default: 5000. */
  resumeDelayMs?: number;
}

/**
 * Hook reutilizável para carrosséis horizontais:
 * - Autoplay com loop (pausa em hover/touch/scroll MANUAL)
 * - Scroll programático (vindo do autoplay ou dos botões prev/next) NÃO pausa
 * - Retoma após N ms sem interação
 * - Desativado quando prefers-reduced-motion: reduce
 * - Calcula índice do card ativo a partir do scrollLeft
 */
export function useCarouselAutoplay<T extends HTMLElement = HTMLDivElement>({
  itemCount,
  itemSelector,
  gap = 12,
  intervalMs = 5000,
  resumeDelayMs = 5000,
}: Options) {
  const ref = useRef<T | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const pausedUntilRef = useRef<number>(0);
  /** Flag: marca quando o próximo evento de scroll veio do código (autoplay/botões). */
  const programmaticScrollRef = useRef<boolean>(false);
  const reduced = usePrefersReducedMotion();

  const measureStep = useCallback(() => {
    const el = ref.current;
    if (!el) return 0;
    const card = itemSelector
      ? el.querySelector<HTMLElement>(itemSelector)
      : (el.firstElementChild as HTMLElement | null);
    return (card?.offsetWidth ?? 240) + gap;
  }, [gap, itemSelector]);

  const pauseInteraction = useCallback(() => {
    pausedUntilRef.current = Date.now() + resumeDelayMs;
  }, [resumeDelayMs]);

  /** Helper exposto p/ botões prev/next chamarem antes do scroll programático. */
  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true;
    // O smooth scroll dispara múltiplos eventos; reseta após uma janela curta.
    window.setTimeout(() => { programmaticScrollRef.current = false; }, 900);
  }, []);

  // Autoplay DESATIVADO por solicitação do produto — o carrossel agora avança
  // somente por interação manual do usuário (swipe ou setas).


  // Index ativo a partir do scroll + pausa SÓ em scroll manual
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      // Scroll vindo do autoplay/botões: só atualiza o índice, NÃO pausa.
      if (!programmaticScrollRef.current) {
        pauseInteraction();
      }
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const step = measureStep();
        if (step <= 0) return;
        const idx = Math.round(el.scrollLeft / step);
        setActiveIndex((prev) => (prev === idx ? prev : Math.min(idx, Math.max(0, itemCount - 1))));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [itemCount, measureStep, pauseInteraction]);

  // Apenas eventos de pointer + mouse: cobre touch, mouse e caneta sem
  // duplicar o disparo (touchstart + pointerdown rodavam duas vezes para o
  // mesmo gesto no mobile, causando "gestos duplicados").
  const interactionHandlers = {
    onMouseEnter: pauseInteraction,
    onMouseLeave: () => {
      pausedUntilRef.current = Date.now() + Math.min(1500, resumeDelayMs);
    },
    onPointerDown: pauseInteraction,
  };

  return { ref, activeIndex, interactionHandlers, reduced, markProgrammaticScroll } as const;
}
