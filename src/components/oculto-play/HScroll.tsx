/**
 * Rolagem lateral que funciona no computador sem estragar o celular.
 *
 *  - Celular: igual antes — arrasta com o dedo, barra invisível.
 *  - Computador (mouse): setas ‹ › aparecem quando há mais conteúdo dos
 *    lados, e dá para arrastar segurando o botão do mouse.
 *
 * `useDesktopDragScroll(root)` liga o "arrastar com o mouse" em QUALQUER
 * fileira com rolagem lateral dentro de `root` (um único ouvinte).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const finePointer = () => {
  try { return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false; } catch { return false; }
};

export function HScroll({ children, className, innerClassName }: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [desktop, setDesktop] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    setDesktop(finePointer());
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [update]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.85), behavior: 'smooth' });
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        className={cn('flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', innerClassName)}
      >
        {children}
      </div>
      {desktop && canLeft && (
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label="Rolar para a esquerda"
          className="absolute left-0 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white shadow-lg ring-1 ring-white/20 hover:bg-black/90"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {desktop && canRight && (
        <button
          type="button"
          onClick={() => page(1)}
          aria-label="Rolar para a direita"
          className="absolute right-0 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white shadow-lg ring-1 ring-white/20 hover:bg-black/90"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

/** Arrastar com o mouse em qualquer fileira lateral dentro de `root`. */
export function useDesktopDragScroll(root: HTMLElement | null) {
  useEffect(() => {
    if (!root || !finePointer()) return;
    let target: HTMLElement | null = null;
    let startX = 0;
    let startLeft = 0;
    let moved = false;

    const findScroller = (el: HTMLElement | null): HTMLElement | null => {
      while (el && el !== root) {
        if (el.scrollWidth > el.clientWidth + 4) {
          const ox = getComputedStyle(el).overflowX;
          if (ox === 'auto' || ox === 'scroll') return el;
        }
        el = el.parentElement;
      }
      return null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable="true"],video,[role="slider"]')) return;
      target = findScroller(t);
      if (!target) return;
      startX = e.clientX;
      startLeft = target.scrollLeft;
      moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!target) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 6) return;
      moved = true;
      target.scrollLeft = startLeft - dx;
      target.style.cursor = 'grabbing';
      target.style.userSelect = 'none';
    };
    const onUp = () => {
      if (!target) return;
      target.style.cursor = '';
      target.style.userSelect = '';
      target = null;
    };
    // Depois de arrastar, o soltar do mouse não pode "clicar" no card.
    const onClickCapture = (e: MouseEvent) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    };
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    root.addEventListener('click', onClickCapture, true);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      root.removeEventListener('click', onClickCapture, true);
    };
  }, [root]);
}
