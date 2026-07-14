/**
 * PlayStarRating — Avaliação 1–5 estrelas em tons dourado/preto para
 * itens do Oculto Play. Mostra média + total e permite clicar para votar.
 */
import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayItemRating } from '@/hooks/useOcultoPlayItemRating';

interface Props {
  itemId: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function PlayStarRating({ itemId, size = 'sm', className }: Props) {
  const { data, rate, isLoading } = useOcultoPlayItemRating(itemId);
  const [hover, setHover] = useState<number>(0);

  const my = data?.my_stars ?? 0;
  const avg = data?.avg ?? 0;
  const total = data?.total ?? 0;
  const active = hover || my;
  const starSize = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/70 px-2.5 py-1 backdrop-blur-sm',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= active;
          const halfAvg = !active && n <= Math.round(avg);
          return (
            <button
              key={n}
              type="button"
              disabled={isLoading || rate.isPending}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onClick={(e) => { e.stopPropagation(); rate.mutate(n); }}
              aria-label={`Avaliar com ${n} estrela${n > 1 ? 's' : ''}`}
              className={cn(
                'p-0.5 rounded transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                rate.isPending && 'opacity-60',
              )}
            >
              <Star
                className={cn(
                  starSize,
                  'transition-colors drop-shadow-[0_0_4px_rgba(251,191,36,0.35)]',
                  filled || halfAvg
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-amber-400/30',
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-baseline gap-1 text-amber-300 tabular-nums">
        <span className="text-[11px] font-bold">{avg.toFixed(1)}</span>
        <span className="text-[10px] text-amber-200/60">({total})</span>
      </div>
    </div>
  );
}
