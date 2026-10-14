/**
 * Card de música expandido no centro da tela.
 *
 *  - Mostra o card completo (todas as informações e ações) do item escolhido.
 *  - Desliza para os lados (dedo, roda do mouse ou setas) para ir ao próximo
 *    ou voltar ao anterior da mesma fileira.
 *  - Botão de play fecha a expansão e abre o player (feito por quem renderiza
 *    o card, via `renderCard(item, close)`).
 *  - Botão X / Esc / tocar fora fecha e volta para a seção.
 *
 * Desempenho: só o card atual e os vizinhos são montados; os outros slots
 * ficam vazios (apenas reservam espaço para o deslizar com encaixe).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { OcultoPlayItem } from '@/hooks/useOcultoPlayContent';

export function AudioExpandViewer({ items, startIndex, onClose, renderCard }: {
  items: OcultoPlayItem[];
  startIndex: number;
  onClose: () => void;
  renderCard: (item: OcultoPlayItem, close: () => void) => ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(startIndex);

  // Começa já no card tocado (sem animação).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = startIndex * el.clientWidth;
  }, [startIndex]);

  // Trava a rolagem da página e fecha com Esc / setas do teclado.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((cur) => (cur === i ? cur : Math.max(0, Math.min(items.length - 1, i))));
  }, [items.length]);

  const go = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / el.clientWidth) + dir));
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[75] flex flex-col bg-black/85 animate-in fade-in duration-200" role="dialog" aria-modal="true">
      {/* Menus suspensos (3 pontinhos, etc.) usam z-50; sobem enquanto o card expandido está aberto. */}
      <style>{'[data-radix-popper-content-wrapper]{z-index:90!important}'}</style>
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 text-white">
        <span className="text-xs font-semibold opacity-80">{index + 1} / {items.length}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar e voltar"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 ring-1 ring-white/20 hover:bg-white/20 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((it, i) => (
            <div
              key={it.id}
              className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-y-auto px-4 py-2"
              onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
              {Math.abs(i - index) <= 1 && (
                <div className="w-full max-w-[420px] text-white">{renderCard(it, onClose)}</div>
              )}
            </div>
          ))}
        </div>

        {index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Anterior"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 hover:bg-black/85 [@media(hover:hover)]:grid"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próximo"
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 hover:bg-black/85 [@media(hover:hover)]:grid"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      <p className="pb-[max(env(safe-area-inset-bottom),10px)] pt-1 text-center text-[11px] text-white/60">
        Deslize para os lados para ver outras músicas
      </p>
    </div>,
    document.body,
  );
}
