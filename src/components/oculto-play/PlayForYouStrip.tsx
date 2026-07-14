/**
 * PlayForYouStrip — Etapa 11
 *
 * Trilho horizontal "Recomendado para você" no topo da aba Para Você.
 * Cada cartão mostra o motivo da recomendação (explicável).
 */
import { Sparkles, Heart, Eye, Loader2, Flame } from 'lucide-react';
import {
  useOcultoPlayRecommendations,
  type OcultoPlayRecommendation,
} from '@/hooks/useOcultoPlayRecommendations';
import { useOcultoPlayActions } from '@/hooks/useOcultoPlayContent';
import { useOcultoPlayXpActions } from '@/hooks/useOcultoPlayGamification';
import { cn } from '@/lib/utils';

export function PlayForYouStrip() {
  const { data, isLoading } = useOcultoPlayRecommendations(15);
  const actions = useOcultoPlayActions();
  const { grant } = useOcultoPlayXpActions();

  if (isLoading) {
    return (
      <div className="mb-4 rounded-2xl border border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-500/5 to-primary/5 p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <section
      aria-label="Recomendado para você"
      className="mb-4 rounded-2xl border border-fuchsia-500/25 bg-gradient-to-r from-fuchsia-500/8 via-primary/5 to-transparent p-3"
    >
      <header className="flex items-center gap-2 mb-2 px-1">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-fuchsia-500/20 text-fuchsia-200">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Recomendado para você</h2>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Baseado no que você curte, salva e segue — explicável e ajustável.
          </p>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory">
        {data.map((item) => (
          <RecoCard
            key={item.id}
            item={item}
            onLike={() => {
              actions.toggleLike.mutate(item.id);
              if (!item.liked_by_me) grant('like', item.id);
            }}
          />
        ))}
      </div>
    </section>
  );
}

function RecoCard({
  item,
  onLike,
}: {
  item: OcultoPlayRecommendation;
  onLike: () => void;
}) {
  const isNew =
    item.published_at &&
    Date.now() - new Date(item.published_at).getTime() < 24 * 60 * 60 * 1000;

  return (
    <article className="snap-start shrink-0 w-[140px] md:w-[160px] rounded-xl overflow-hidden bg-card border border-border/40 flex flex-col">
      <div className="relative aspect-[3/4] bg-black/30">
        {isNew && (
          <span className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-400 text-black px-1.5 py-0.5 rounded-full shadow-md">
            <Flame className="h-2.5 w-2.5" /> Novo hoje
          </span>
        )}
        {item.thumb_url || item.media_url ? (
          <img
            src={item.thumb_url || item.media_url!}
            alt={item.title ?? 'Recomendação'}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs">
            sem prévia
          </div>
        )}

        <span className="absolute top-1.5 left-1.5 max-w-[85%] truncate text-[9px] uppercase tracking-wide bg-fuchsia-500/85 text-white px-1.5 py-0.5 rounded backdrop-blur-sm">
          {item.reco_reason}
        </span>

        <div className="absolute bottom-0 inset-x-0 p-1.5 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent">
          <div className="flex items-center gap-2 text-[10px] text-white/90">
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" /> {item.view_count}
            </span>
            <span className="flex items-center gap-0.5">
              <Heart
                className={cn(
                  'h-3 w-3',
                  item.liked_by_me && 'fill-rose-400 text-rose-400',
                )}
              />
              {item.like_count}
            </span>
          </div>
          <button
            onClick={onLike}
            className="grid place-items-center h-6 w-6 rounded-full bg-black/60 text-white hover:bg-rose-500/70"
            title="Curtir"
          >
            <Heart
              className={cn(
                'h-3 w-3',
                item.liked_by_me && 'fill-rose-400 text-rose-400',
              )}
            />
          </button>
        </div>
      </div>

      <div className="p-2 min-h-[44px]">
        {item.title && (
          <p className="text-[11px] font-medium line-clamp-2 leading-tight">{item.title}</p>
        )}
        {item.author_username && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            @{item.author_username}
          </p>
        )}
      </div>
    </article>
  );
}
