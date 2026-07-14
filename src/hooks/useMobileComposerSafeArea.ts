import { useEffect, useRef, useState } from 'react';

/**
 * useMobileComposerSafeArea
 * ─────────────────────────
 * Garante que o composer (campo de digitação) NUNCA fique escondido em mobile,
 * independente de:
 *   • altura da tela (320–926 CSS px)
 *   • orientação (portrait/landscape)
 *   • abertura/fechamento do teclado virtual (iOS/Android)
 *   • notch / safe-area-inset-bottom
 *   • barras flutuantes (MobileNavbar fixa z-60)
 *
 * Estratégia:
 *   1. Lê visualViewport (height + offsetTop) para detectar teclado.
 *   2. Calcula `keyboardOffset` = quanto o composer precisa subir.
 *   3. Em paralelo, agenda uma **validação runtime** (rAF) que chama
 *      `getBoundingClientRect()` no composer real — se ainda estiver fora
 *      da visualViewport, recalcula e força scroll do input para a vista.
 *   4. Reage a `orientationchange`, `resize` e `focusin` no input.
 *
 * Retorno:
 *   - keyboardOffset: número de pixels para subir o composer
 *   - composerRef: anexar ao container do composer
 *   - inputRef: anexar ao <input>/<textarea> para validar visibilidade
 *   - validate(): chama manualmente a validação (ex: ao receber mensagem)
 */
export function useMobileComposerSafeArea(opts?: {
  /** Altura mínima do teclado para considerar aberto (px). Default 80. */
  threshold?: number;
  /** Callback chamado quando composer foi reposicionado para ficar visível. */
  onAdjust?: (offset: number) => void;
}) {
  const threshold = opts?.threshold ?? 80;
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const lastOffsetRef = useRef(0);

  const validate = () => {
    if (typeof window === 'undefined') return;
    const composer = composerRef.current;
    if (!composer) return;

    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const visualHeight = vv?.height ?? window.innerHeight;
    const visualTop = vv?.offsetTop ?? 0;
    const visualBottom = visualTop + visualHeight;

    const rect = composer.getBoundingClientRect();
    // Se o composer está abaixo da visualViewport, calcula o quanto subir.
    const overflow = rect.bottom - visualBottom;
    const newOffset = overflow > 0 ? Math.ceil(overflow) : 0;

    // Suaviza: ignora flicker < 4px
    if (Math.abs(newOffset - lastOffsetRef.current) >= 4) {
      lastOffsetRef.current = newOffset;
      setKeyboardOffset(newOffset);
      if (newOffset > 0) opts?.onAdjust?.(newOffset);
    }

    // Se o input está focado, garante que ele esteja na vista.
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      const ir = input.getBoundingClientRect();
      if (ir.bottom > visualBottom - 8) {
        // Scrolla a página/parent para revelar o input.
        try { input.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' }); } catch {}
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = (window as any).visualViewport as VisualViewport | undefined;

    const update = () => {
      const visualHeight = vv?.height ?? window.innerHeight;
      const visualTop = vv?.offsetTop ?? 0;
      // Estimativa de altura do teclado.
      const kb = Math.max(0, window.innerHeight - visualHeight - visualTop);
      const offset = kb > threshold ? kb : 0;
      lastOffsetRef.current = offset;
      setKeyboardOffset(offset);
      // Validação runtime no próximo frame (após DOM atualizar).
      requestAnimationFrame(validate);
    };

    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);

    // Quando qualquer input recebe foco dentro do composer, valida.
    const onFocusIn = (e: FocusEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && composerRef.current?.contains(tgt)) {
        // Pequeno delay para o teclado virtual subir antes de medir.
        setTimeout(() => requestAnimationFrame(validate), 250);
      }
    };
    const onFocusOut = () => {
      // Quando o input perde foco, reseta após o teclado fechar.
      setTimeout(update, 200);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [threshold]);

  return { keyboardOffset, composerRef, inputRef, validate };
}
