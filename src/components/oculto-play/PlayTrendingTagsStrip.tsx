/**
 * PlayTrendingTagsStrip — Etapa 31
 *
 * Strip horizontal de hashtags em alta nas últimas 48h.
 * Clique no chip ativa filtro por tag; clique novamente limpa.
 * Stateless visual, totalmente controlado pelo parent via `value/onChange`.
 */
import { Flame, X } from 'lucide-react';
import { useOcultoPlayTrendingTags } from '@/hooks/useOcultoPlayTrendingTags';
import { cn } from '@/lib/utils';

interface Props {
  value: string | null;
  onChange: (tag: string | null) => void;
  windowHours?: number;
  limit?: number;
}

export function PlayTrendingTagsStrip({ value, onChange, windowHours = 48, limit = 12 }: Props) {
  const { data, isLoading } = useOcultoPlayTrendingTags({ windowHours, limit });

  if (isLoading) {
    return (
      <div className="flex gap-2 mb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-muted/40 animate-pulse shrink-0" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-fuchsia-300/90 uppercase tracking-wider font-semibold">
        <Flame className="h-3 w-3" />
        Tags em alta
        {value && (
          <button
            onClick={() => onChange(null)}
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground normal-case tracking-normal"
          >
            <X className="h-3 w-3" /> Limpar filtro
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.map((t) => {
          const active = value === t.tag;
          return (
            <button
              key={t.tag}
              onClick={() => onChange(active ? null : t.tag)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap border transition-all flex items-center gap-1.5 shrink-0',
                active
                  ? 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-500/60'
                  : 'bg-card text-muted-foreground border-border/40 hover:text-foreground hover:border-border',
              )}
              title={`${t.item_count} item(ns) · ${t.total_views} views`}
            >
              <span className="text-fuchsia-300">#</span>
              {t.tag}
              <span className="text-[10px] text-muted-foreground/80">·{t.item_count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
