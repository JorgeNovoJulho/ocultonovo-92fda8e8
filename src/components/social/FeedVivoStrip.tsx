import { memo } from 'react';
import { useFeedVivo } from '@/social-universe';

const KIND_EMOJI: Record<string, string> = {
  noite: '🌙', tempestade: '⚡', season: '🌌',
  destiny: '💞', hidden: '🔮', real_exp: '📍', milestone: '🏆',
};

/**
 * FeedVivoStrip — tira horizontal compacta de "movimentos do universo".
 * Cap de 8 itens, scroll-snap. Não polui o feed: aparece UMA vez no topo.
 */
function FeedVivoStripComp() {
  const { data: items = [] } = useFeedVivo(8);
  if (!items.length) return null;

  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollSnapType: 'x mandatory' }}
      aria-label="Feed vivo"
    >
      {items.map((it) => {
        const tint = `hsl(${it.hue ?? 280} 70% 25% / 0.5)`;
        const title = (it.payload?.title as string) || (it.payload?.message as string) || it.kind;
        return (
          <div
            key={it.id}
            className="shrink-0 snap-start rounded-xl border border-white/10 px-2.5 py-1.5 text-[11px] text-white/85"
            style={{ background: tint }}
          >
            <span className="mr-1" aria-hidden>{it.emoji || KIND_EMOJI[it.kind] || '✨'}</span>
            {title}
          </div>
        );
      })}
    </div>
  );
}

export const FeedVivoStrip = memo(FeedVivoStripComp);
