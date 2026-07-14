/**
 * OcultoPlayImageItem — card de imagem/meme com lazy load e cache persistente.
 *
 * Integra `ocultoPlayMediaCache` (L1 memória + L3 CacheStorage):
 *  - Se a capa já foi vista nesta ou em sessão anterior, é renderizada
 *    IMEDIATAMENTE como blob: URL (zero round-trip, sem skeleton).
 *  - Caso contrário, faz o load normal e marca no cache para o próximo acesso.
 *  - Evita re-fetch ao voltar para a grade — só capas NOVAS pagam latência.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getCachedThumbUrl,
  isThumbCached,
  markThumbCached,
  prefetchThumb,
} from '@/lib/ocultoPlayMediaCache';

interface Props {
  src: string;
  alt?: string;
  /** Visual mais lúdico para memes. */
  meme?: boolean;
  className?: string;
}

export function OcultoPlayImageItem({ src, alt = '', meme, className }: Props) {
  const cachedFast = isThumbCached(src);
  const [resolvedSrc, setResolvedSrc] = useState<string>(src);
  const [loaded, setLoaded] = useState<boolean>(cachedFast);
  const lastSrcRef = useRef<string>(src);

  useEffect(() => {
    let cancelled = false;
    lastSrcRef.current = src;
    if (!src) return;
    // Tenta servir do CacheStorage (blob:) — zero rede
    getCachedThumbUrl(src).then((blob) => {
      if (cancelled || lastSrcRef.current !== src) return;
      if (blob) {
        setResolvedSrc(blob);
        setLoaded(true);
        return;
      }
      // Não está no cache persistente — agenda prefetch idle p/ próxima vez
      const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      const schedule = w.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
      schedule(() => prefetchThumb(src), { timeout: 1500 });
    });
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl bg-muted/30',
        meme
          ? 'aspect-square ring-1 ring-fuchsia-400/20'
          : 'aspect-[9/14] sm:aspect-video',
        className,
      )}
    >
      {!loaded && <div className="absolute inset-0 bg-muted/40 animate-pulse" />}
      <img
        src={resolvedSrc}
        alt={alt}
        // Se já cacheado, libera carregamento imediato (sem lazy)
        loading={cachedFast ? 'eager' : 'lazy'}
        decoding="async"
        // @ts-expect-error fetchpriority is valid HTML
        fetchpriority={cachedFast ? 'high' : 'low'}
        onLoad={() => { setLoaded(true); markThumbCached(src); }}
        className={cn(
          'absolute inset-0 w-full h-full transition-opacity duration-150',
          meme ? 'object-contain bg-black' : 'object-cover',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
