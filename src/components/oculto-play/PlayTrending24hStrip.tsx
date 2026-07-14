/**
 * PlayTrending24hStrip — Etapa 53.3
 *
 * Faixa horizontal "Em Alta nas Últimas 24h" para o hub do Oculto Play.
 * Ranking real: views_24h * 1 + likes_24h * 3.
 * Cada card exibe os contadores das últimas 24h para o usuário entender
 * o porquê da posição.
 */
import { Flame, Play as PlayIcon, Eye, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayTrending24h, type TrendingItem } from '@/hooks/useOcultoPlayTrending24h';

interface Props {
  onOpen: (item: TrendingItem) => void;
  className?: string;
}

export function PlayTrending24hStrip({ onOpen, className }: Props) {
  const { data, loading } = useOcultoPlayTrending24h();

  const toneFor = (it: TrendingItem) => {
    if (it.kind === 'audio') return 'border-fuchsia-400/70 hover:border-fuchsia-200 shadow-[0_0_18px_-10px_rgba(217,70,239,0.95)]';
    if (it.kind === 'short_video' || it.kind === 'vip_teaser') return 'border-amber-300/80 hover:border-yellow-100 shadow-[0_0_18px_-10px_rgba(251,191,36,0.95)]';
    if (it.kind === 'link' && it.is_adult) return 'border-red-400/80 hover:border-red-100 shadow-[0_0_18px_-10px_rgba(248,113,113,0.95)]';
    if (it.kind === 'link') return 'border-sky-400/80 hover:border-cyan-100 shadow-[0_0_18px_-10px_rgba(56,189,248,0.95)]';
    if (it.kind === 'community_post') return 'border-emerald-400/70 hover:border-emerald-100 shadow-[0_0_18px_-10px_rgba(52,211,153,0.9)]';
    return 'border-orange-400/70 hover:border-orange-100 shadow-[0_0_18px_-10px_rgba(251,146,60,0.9)]';
  };

  if (loading) {
    return (
      <div className={cn('px-4 py-3', className)}>
        <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    );
  }
  if (data.length === 0) return null;

  return (
    <section className={cn('w-full', className)}>
      <div className="flex items-center gap-2 px-4 mb-2">
        <Flame className="h-4 w-4 text-orange-400" />
        <h2 className="text-sm font-semibold">Em Alta nas Últimas 24h</h2>
        <span className="text-[10px] text-muted-foreground">
          · {data.length} itens
        </span>
      </div>
      <div className="overflow-x-auto px-4 pb-2">
        <div className="flex gap-3 min-w-min">
          {data.map((it, i) => (
            <button
              key={it.id}
              onClick={() => onOpen(it)}
              className={cn(
                'group relative w-32 shrink-0 rounded-xl overflow-hidden text-left',
                'border-2 bg-card',
                'transition-colors',
                toneFor(it),
              )}
            >
              <div className="aspect-[3/4] bg-black/40 relative">
                {it.thumb_url ? (
                  <img
                    src={it.thumb_url}
                    alt={it.title ?? ''}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                    <PlayIcon className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute top-1 left-1 text-[10px] font-bold rounded-full bg-orange-500 text-white px-1.5 py-0.5">
                  #{i + 1}
                </div>
                <div className="absolute top-1 right-1 flex flex-col gap-0.5 items-end">
                  <span className="text-[10px] rounded-full bg-black/70 text-white px-1.5 py-0.5 backdrop-blur flex items-center gap-0.5" title="Visualizações totais">
                    <Eye className="h-2.5 w-2.5" /> {it.view_count ?? 0}
                  </span>
                  <span className="text-[10px] rounded-full bg-black/70 text-pink-200 px-1.5 py-0.5 backdrop-blur flex items-center gap-0.5" title="Curtidas totais">
                    <Heart className="h-2.5 w-2.5" /> {it.like_count ?? 0}
                  </span>
                </div>
                <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/85 to-transparent text-white">
                  {it.title && (
                    <p className="text-[11px] font-semibold line-clamp-2">{it.title}</p>
                  )}
                  <p className="text-[10px] opacity-80 line-clamp-1">
                    {it.author_username ? `@${it.author_username}` : (it.author_display_name ?? 'Alguém')}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
