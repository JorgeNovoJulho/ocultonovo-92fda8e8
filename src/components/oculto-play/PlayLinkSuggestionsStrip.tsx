/**
 * PlayLinkSuggestionsStrip — sugestões de "próximos vídeos" exibidas no modal
 * de foco quando o item atual é do tipo `link`.
 *
 * Regras:
 *  - Estética em degradê vermelho com texto em alto contraste.
 *  - Mostra apenas a capa/preview do vídeo (sem badge de provedor).
 *  - Quando o item atual é +18, só sugere outros +18.
 *    Quando o item atual NÃO é +18, esconde os +18.
 *  - Prioriza vídeos do mesmo provedor (mantém proporção 9:16 vs 16:9).
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import { Sparkles, Plus, Play } from 'lucide-react';
import { useOcultoPlayFeed } from '@/hooks/useOcultoPlayContent';
import type { OcultoPlayItem as OPItem } from '@/hooks/useOcultoPlayContent';
import { parseEmbeddedVideo } from '@/lib/embeddedVideoUrl';
import { cn } from '@/lib/utils';

interface Props {
  currentItem: OPItem;
  onSelect: (item: OPItem) => void;
}

function getProvider(it: OPItem): string {
  const src = (it as any).source_url || it.media_url || '';
  const p = (it as any).link_provider || parseEmbeddedVideo(src)?.kind || '';
  return String(p).toLowerCase();
}

function isAdultItem(it: OPItem): boolean {
  return (it as any).is_adult === true;
}

const PAGE_SIZE = 8;
const PREFETCH_AHEAD = 4;

export function PlayLinkSuggestionsStrip({ currentItem, onSelect }: Props) {
  const { data, isLoading } = useOcultoPlayFeed('normal', 'link', 200);
  const currentProvider = getProvider(currentItem);
  const currentAdult = isAdultItem(currentItem);
  const isVertical = currentProvider === 'tiktok';
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [currentItem.id]);

  const ordered = useMemo(() => {
    const all = (data ?? []).filter((it) => {
      if (it?.kind !== 'link' || it.id === currentItem.id) return false;
      // Filtro +18: respeita o modo do item atual sendo reproduzido.
      return isAdultItem(it) === currentAdult;
    });
    const same = all.filter((it) => getProvider(it) === currentProvider);
    const others = all.filter((it) => getProvider(it) !== currentProvider);
    return [...same, ...others];
  }, [data, currentItem.id, currentProvider, currentAdult]);

  const suggestions = ordered.slice(0, visibleCount);
  const hasMore = ordered.length > visibleCount;

  useEffect(() => {
    const upcoming = ordered.slice(visibleCount, visibleCount + PREFETCH_AHEAD);
    upcoming.forEach((it) => {
      const url = it.thumb_url || (parseEmbeddedVideo((it as any).source_url || it.media_url || '')?.thumbnailUrl ?? null);
      if (!url || prefetchedRef.current.has(url)) return;
      prefetchedRef.current.add(url);
      try {
        const img = new Image();
        img.decoding = 'async';
        (img as any).loading = 'lazy';
        img.src = url;
      } catch { /* noop */ }
    });
  }, [ordered, visibleCount]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    const root = stripRef.current;
    if (!sentinel || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisibleCount((c) => Math.min(c + PAGE_SIZE, ordered.length));
          }
        }
      },
      { root, rootMargin: '0px 240px 0px 0px', threshold: 0.01 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, ordered.length, visibleCount]);

  if (suggestions.length === 0 && !isLoading) return null;

  return (
    <div className="mt-3 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-950/85 via-rose-900/55 to-red-800/30 p-2 shadow-[0_8px_30px_-12px_rgba(244,63,94,0.45)]">
      <div className="flex items-center justify-between gap-1.5 px-1 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-50 drop-shadow">
          <Sparkles className="h-3 w-3 text-red-200" /> Próximos vídeos sugeridos
        </div>
        <span className="text-[10px] font-medium text-red-100/80">{suggestions.length}/{ordered.length}</span>
      </div>
      <div ref={stripRef} className="flex gap-2 overflow-x-auto scrollbar-none pb-1">

        {suggestions.map((it) => {
          const prov = getProvider(it);
          const vertical = prov === 'tiktok';
          const aspect = vertical ? 'aspect-[9/16] w-20' : 'aspect-video w-36';
          const cover = it.thumb_url || (parseEmbeddedVideo((it as any).source_url || it.media_url || '')?.thumbnailUrl ?? null);
          const samePriority = prov === currentProvider;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it)}
              className={cn(
                'group relative shrink-0 overflow-hidden rounded-lg border bg-black/70 text-left transition active:scale-95',
                aspect,
                samePriority ? 'border-red-300/70 ring-1 ring-red-400/50' : 'border-red-500/25',
              )}
              title={it.title || it.caption || 'Vídeo'}
            >
              {cover ? (
                <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-red-900/60 to-black" />
              )}
              <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition bg-black/30">
                <Play className="h-5 w-5 text-white drop-shadow" fill="currentColor" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-1.5">
                <div className="text-[10px] font-semibold text-white line-clamp-2 drop-shadow">
                  {it.title || it.caption || 'Vídeo'}
                </div>
              </div>
            </button>
          );
        })}
        {hasMore && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className={cn(
              'shrink-0 grid place-items-center rounded-lg border border-dashed border-red-300/50 bg-red-500/10 text-red-50 hover:bg-red-500/20 transition active:scale-95',
              isVertical ? 'aspect-[9/16] w-20' : 'aspect-video w-36',
            )}
            aria-label="Carregar mais sugestões"
            title="Carregar mais"
          >
            <div className="flex flex-col items-center gap-1 text-[10px] font-semibold">
              <Plus className="h-4 w-4" />
              Mais
            </div>
          </button>
        )}
        {hasMore && <div ref={sentinelRef} aria-hidden className="shrink-0 w-1" />}

      </div>
      {isVertical && (
        <p className="mt-1 px-1 text-[9px] text-red-100/70">
          Priorizando vídeos verticais (mesmo formato).
        </p>
      )}
    </div>
  );
}
