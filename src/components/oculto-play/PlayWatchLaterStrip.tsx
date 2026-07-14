/**
 * PlayWatchLaterStrip — Etapa 32
 *
 * Strip horizontal com os últimos itens salvos em "Assistir Depois".
 * Clique abre o deep-link do item; botão lateral remove da fila.
 */
import { Clock, X } from 'lucide-react';
import { useOcultoPlayWatchLater } from '@/hooks/useOcultoPlayWatchLater';
import { openPlayItemDeepLink } from '@/components/oculto-play/PlayItemDeepLinkSheet';

export function PlayWatchLaterStrip() {
  const { data, isLoading, remove } = useOcultoPlayWatchLater({ limit: 24 });

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold text-sky-200">
        <Clock className="h-3.5 w-3.5" />
        Assistir Depois
        <span className="text-[10px] text-muted-foreground font-normal">
          ({data.length})
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.map((it) => (
          <div
            key={it.item_id}
            className="relative shrink-0 w-[84px] cursor-pointer group"
            onClick={() => openPlayItemDeepLink(it.item_id)}
          >
            <div className="relative w-[84px] h-[116px] rounded-lg overflow-hidden bg-card border border-border/40">
              {it.thumb_url || it.media_url ? (
                <img
                  src={it.thumb_url || it.media_url || ''}
                  alt={it.title ?? ''}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                  <Clock className="h-6 w-6" />
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove.mutate(it.item_id);
                }}
                className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {it.title && (
              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-tight">
                {it.title}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
