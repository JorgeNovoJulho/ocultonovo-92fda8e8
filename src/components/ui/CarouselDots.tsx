import { memo } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  count: number;
  activeIndex: number;
  /** Limita visualmente o número de dots renderizados. Default: 10. */
  maxDots?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Indicadores compactos (dots) para carrosséis horizontais.
 * Quando count > maxDots, mantém a quantidade fixa e desloca uma "janela"
 * em volta do índice ativo para o usuário sempre ver onde está.
 */
function CarouselDotsComp({
  count,
  activeIndex,
  maxDots = 10,
  className,
  ariaLabel = 'Posição no carrossel',
}: Props) {
  if (count <= 1) return null;
  const total = Math.min(count, maxDots);
  // janela deslizante centrada no índice ativo
  const half = Math.floor(total / 2);
  let start = Math.max(0, activeIndex - half);
  if (start + total > count) start = Math.max(0, count - total);
  const dots = Array.from({ length: total }, (_, i) => start + i);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-center justify-center gap-1.5 pb-2', className)}
    >
      {dots.map((i) => {
        const isActive = i === activeIndex;
        return (
          <span
            key={i}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'h-1.5 rounded-full transition-all',
              isActive ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/40'
            )}
          />
        );
      })}
    </div>
  );
}

export const CarouselDots = memo(CarouselDotsComp);
