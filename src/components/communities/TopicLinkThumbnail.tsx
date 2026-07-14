/**
 * TopicLinkThumbnail — miniatura 48px com badge "LINK" para tópicos cujo
 * corpo contém um link externo (sem mídia anexada). Busca OpenGraph image
 * via fetchLinkPreview e mostra skeleton enquanto carrega. Clique abre a
 * URL externa em nova aba (rel="noopener").
 */
import { useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { fetchLinkPreview, type LinkPreviewData } from '@/components/LinkPreviewCard';

interface Props {
  url: string;
}

// Cache leve em módulo — evita refetchar a mesma URL várias vezes no scroll.
const cache = new Map<string, LinkPreviewData | null>();

export function TopicLinkThumbnail({ url }: Props) {
  const [data, setData] = useState<LinkPreviewData | null | undefined>(() => cache.get(url));
  const [loading, setLoading] = useState(!cache.has(url));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (cache.has(url)) {
      setData(cache.get(url));
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchLinkPreview(url)
      .then((d) => {
        cache.set(url, d);
        if (mountedRef.current) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        cache.set(url, null);
        if (mountedRef.current) {
          setData(null);
          setLoading(false);
        }
      });
    return () => { mountedRef.current = false; };
  }, [url]);

  const host = (() => {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return 'link'; }
  })();

  const img = data?.image ?? null;

  return (
    <div className="shrink-0 flex flex-col items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className="relative h-12 w-12 rounded-md overflow-hidden border border-border/60 bg-black/60 grid place-items-center active:scale-95 transition-transform"
        aria-label={`Abrir link externo de ${host}`}
        title={host}
      >
        {loading ? (
          <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
        ) : img ? (
          <img
            src={img}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <Link2 className="h-5 w-5 text-cyan-300" />
        )}
      </a>
      <span className="text-[8px] leading-none px-1.5 py-0.5 rounded font-bold uppercase tracking-wide bg-cyan-600/85 text-white">
        Link
      </span>
    </div>
  );
}

/** Detecta a primeira URL externa "https?://" no corpo, ignorando media markdown. */
export function extractFirstExternalUrl(body: string | null | undefined): string | null {
  if (!body) return null;
  // Remove tokens de mídia primeiro para não capturar URLs internas.
  const cleaned = body
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[(?:vídeo|video|áudio|audio)\]\([^)]+\)/gi, '');
  const m = /(https?:\/\/[^\s<>"')\]]+)/i.exec(cleaned);
  return m ? m[1] : null;
}
