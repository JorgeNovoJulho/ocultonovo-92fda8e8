/**
 * CachedThumbImg — <img> que serve thumbs do Oculto Play a partir do
 * cache em 3 camadas (memória + sessionStorage + CacheStorage).
 *
 * Regra de ouro: ao remontar (voltar para a grade do Oculto Play),
 * a mesma capa NUNCA pode disparar request HTTP de novo. O primeiro
 * render SÍNCRONO já usa o blob: URL da L1 quando existir; somente
 * URLs inéditas aguardam a Promise do CacheStorage / rede.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getCachedThumbBlobSync,
  getCachedThumbUrl,
  isThumbCached,
  markThumbCached,
  prefetchThumb,
} from '@/lib/ocultoPlayMediaCache';

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  /** Mostra skeleton com gradient enquanto carrega (default true). */
  showSkeleton?: boolean;
}

function CachedThumbImgInner({ src, alt = '', className, showSkeleton = true }: Props) {
  // Lookup síncrono ANTES do primeiro render — sem isso o <img> renderiza
  // primeiro com a URL remota (= request HTTP) e só depois troca pro blob.
  const syncBlob = getCachedThumbBlobSync(src);
  const cachedFast = !!syncBlob || isThumbCached(src);
  const initial = syncBlob ?? (src ?? null);

  const [resolvedSrc, setResolvedSrc] = useState<string | null>(initial);
  const [loaded, setLoaded] = useState<boolean>(!!syncBlob || cachedFast);
  const lastSrcRef = useRef<string | null>(src ?? null);

  useEffect(() => {
    let cancelled = false;
    lastSrcRef.current = src ?? null;
    if (!src) { setResolvedSrc(null); setLoaded(false); return; }

    // Se já existe blob na memória, mantemos — NÃO sobrescrevemos com a URL
    // remota (era exatamente isso que disparava re-download a cada entrada).
    const memBlob = getCachedThumbBlobSync(src);
    if (memBlob) {
      setResolvedSrc(memBlob);
      setLoaded(true);
      return;
    }

    // Sem blob em memória: mostra placeholder/URL e tenta promover do disco.
    setResolvedSrc(src);
    setLoaded(isThumbCached(src));
    getCachedThumbUrl(src).then((blob) => {
      if (cancelled || lastSrcRef.current !== src) return;
      if (blob) {
        setResolvedSrc(blob);
        setLoaded(true);
        return;
      }
      const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      const schedule = w.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
      schedule(() => prefetchThumb(src), { timeout: 1500 });
    });
    return () => { cancelled = true; };
  }, [src]);

  if (!src || !resolvedSrc) return null;

  return (
    <>
      {showSkeleton && !loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-fuchsia-500/15 to-purple-500/15" />
      )}
      <img
        src={resolvedSrc}
        alt={alt}
        loading={cachedFast ? 'eager' : 'lazy'}
        decoding="async"
        // @ts-expect-error fetchpriority is valid HTML
        fetchpriority={cachedFast ? 'high' : 'low'}
        onLoad={() => { setLoaded(true); markThumbCached(src); }}
        className={cn(
          'transition-opacity duration-200',
          // Quando já temos blob em memória, mostramos imediatamente sem fade.
          (cachedFast || loaded) ? 'opacity-100' : 'opacity-0',
          className,
        )}
      />
    </>
  );
}

// memo: evita re-render desnecessário quando o pai (strip) re-renderiza
// sem mudar a src. Mantém estabilidade visual nas grades.
export const CachedThumbImg = memo(CachedThumbImgInner, (a, b) =>
  a.src === b.src && a.className === b.className && a.alt === b.alt && a.showSkeleton === b.showSkeleton
);
