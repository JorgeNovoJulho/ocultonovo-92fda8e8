/**
 * PlayPersonalMixStrip — Etapa 30.
 * Carrossel "Mix Surpresa" no topo do PLAY. Itens com alta afinidade
 * (kinds + autores curtidos + frescor) que o usuário ainda não viu.
 * Click abre o item via deep-link.
 */
import { Shuffle, Eye, Heart, Sparkles } from 'lucide-react';
import { useOcultoPlayPersonalMix } from '@/hooks/useOcultoPlayPersonalMix';
import { openPlayItemDeepLink } from './PlayItemDeepLinkSheet';
import { Skeleton } from '@/components/ui/skeleton';

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n ?? 0);

export function PlayPersonalMixStrip() {
  const { data, isLoading } = useOcultoPlayPersonalMix();

  if (isLoading) {
    return (
      <div className="mb-4">
        <div className="h-3 w-32 rounded mb-2 bg-muted/40 animate-pulse" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-20 rounded-lg shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-fuchsia-500/30 to-violet-500/30 text-fuchsia-200">
          <Shuffle className="h-3 w-3" />
        </div>
        <h3 className="text-xs font-bold text-foreground/90">Mix Surpresa</h3>
        <span className="text-[10px] text-muted-foreground">· feito pra você</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.map((it) => (
          <button
            key={it.id}
            onClick={() => openPlayItemDeepLink(it.id)}
            className="relative h-28 w-20 shrink-0 rounded-lg overflow-hidden border border-fuchsia-500/30 bg-card group"
          >
            {it.thumb_url || it.media_url ? (
              <img
                src={it.thumb_url || it.media_url!}
                alt={it.title ?? ''}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-fuchsia-500/10 text-fuchsia-300">
                <Sparkles className="h-5 w-5" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-between text-[9px] text-white/90">
                <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{fmt(it.view_count)}</span>
                <span className="flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" />{fmt(it.like_count)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
