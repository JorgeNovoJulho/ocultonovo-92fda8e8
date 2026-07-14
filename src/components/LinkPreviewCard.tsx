/**
 * LinkPreviewCard — preview rico de OpenGraph para posts (imagem + título + host).
 *
 * - Detecta a primeira URL no texto.
 * - Busca metadados via API pública `api.microlink.io` (gratuita, sem chave,
 *   CORS aberto). Resiste a sites com anti-bot — extrai OG/Twitter/oEmbed.
 * - Cache in-memory por URL para evitar refetch durante a digitação.
 * - Debounce de 500ms na URL para não bombardear o serviço a cada tecla.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Link2, X, Loader2, ImageOff } from 'lucide-react';
import { extractFirstUrl } from '@/components/chat/LinkPreview';
import {
  parseEmbeddedVideo,
  getYouTubeId as parseYouTubeId,
  getVimeoId as parseVimeoId,
  isDirectVideoUrl as parseIsDirectVideoUrl,
} from '@/lib/embeddedVideoUrl';
import { useFeedEmbedEngagementStore } from '@/store/useFeedEmbedEngagementStore';

export interface LinkPreviewData {
  url: string;
  host: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const cache = new Map<string, LinkPreviewData | null>();
const inflight = new Map<string, Promise<LinkPreviewData | null>>();

interface MicrolinkResponse {
  status: 'success' | 'fail';
  data?: {
    title?: string | null;
    description?: string | null;
    publisher?: string | null;
    url?: string | null;
    image?: { url?: string | null } | string | null;
    logo?: { url?: string | null } | string | null;
  };
}

function pickImageUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v && 'url' in (v as Record<string, unknown>)) {
    const u = (v as { url?: unknown }).url;
    if (typeof u === 'string') return u;
  }
  return null;
}

/** Descarta imagens pequenas/favicon que não fazem sentido como hero do card. */
function isUsableImage(v: unknown): boolean {
  if (!v) return false;
  if (typeof v === 'string') {
    return !/\.(ico)(\?|#|$)/i.test(v);
  }
  if (typeof v === 'object' && v) {
    const o = v as { url?: string; type?: string; width?: number; height?: number };
    if (o.type && /^ico$/i.test(o.type)) return false;
    if ((o.width && o.width < 200) || (o.height && o.height < 200)) return false;
    return !!o.url && !/\.(ico)(\?|#|$)/i.test(o.url);
  }
  return false;
}

/** Remove títulos vazios/lixo ("- SITE", " | SITE", apenas whitespace). */
function cleanTitle(raw: string | null | undefined, publisher?: string | null): string | null {
  if (!raw) return null;
  let t = raw.trim();
  if (!t) return null;
  if (publisher) {
    const pubRe = new RegExp(`^[\\s\\-\\|·•:]*${publisher.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\-\\|·•:]*$`, 'i');
    if (pubRe.test(t)) return null;
    t = t.replace(new RegExp(`\\s*[\\-\\|·•]\\s*${publisher.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i'), '').trim();
  }
  if (!t || /^[\s\-\|·•:]+$/.test(t)) return null;
  return t;
}


/** Extrai o ID do vídeo do YouTube — delegado para o parser centralizado. */
function getYouTubeId(rawUrl: string): string | null {
  return parseYouTubeId(rawUrl)?.id ?? null;
}

/** Extrai o ID do Vimeo — delegado para o parser centralizado. */
function getVimeoId(rawUrl: string): string | null {
  return parseVimeoId(rawUrl);
}

/** Detecta link direto para arquivo de vídeo — delegado para o parser centralizado. */
function isDirectVideoUrl(rawUrl: string): boolean {
  return parseIsDirectVideoUrl(rawUrl);
}
function hostOf(rawUrl: string): string {
  try { return new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { return rawUrl; }
}

function tweetIdFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');
    if (!/(^|\.)(x|twitter)\.com$/.test(host)) return null;
    return u.pathname.match(/\/(?:i\/)?status(?:es)?\/(\d+)/)?.[1] || null;
  } catch { return null; }
}

/** X/Twitter: fxtwitter/vxtwitter costuma devolver thumbnail/título onde Microlink/noembed falham. */
async function tryFxTwitter(url: string): Promise<LinkPreviewData | null> {
  const tweetId = tweetIdFromUrl(url);
  if (!tweetId) return null;
  const endpoints = [
    `https://api.fxtwitter.com/status/${encodeURIComponent(tweetId)}`,
    `https://api.vxtwitter.com/status/${encodeURIComponent(tweetId)}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(endpoint, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const json = await res.json();
      const t = json?.tweet || json;
      const media = Array.isArray(t?.media_extended) ? t.media_extended[0] : Array.isArray(t?.mediaDetails) ? t.mediaDetails[0] : null;
      const authorAvatar =
        t?.author?.avatar_url ||
        t?.author?.profile_image_url_https ||
        t?.user?.profile_image_url_https ||
        null;
      // Avatar do X vem em _normal (48px); pega versão maior (400x400) para virar capa.
      const bigAvatar = typeof authorAvatar === 'string'
        ? authorAvatar.replace(/_(normal|bigger|mini)\./, '_400x400.')
        : null;
      const image =
        media?.thumbnail_url ||
        media?.media_url_https ||
        t?.poster ||
        json?.poster ||
        bigAvatar ||
        null;
      const author = t?.author?.screen_name || t?.user_screen_name || t?.user_name || null;
      const text = t?.text || json?.text || null;
      if (image || text) {
        return {
          url,
          host: hostOf(url),
          title: author ? `@${author} no X / Twitter` : 'Publicação no X / Twitter',
          description: text ? String(text).slice(0, 220) : null,
          image,
          siteName: 'X / Twitter',
        };
      }
    } catch { /* tenta próximo endpoint */ }
  }
  return null;
}

/** Tenta microlink (rico). Pode falhar por rate-limit / CORS / 4xx — retornamos null pra cair no fallback. */
async function tryMicrolink(url: string): Promise<LinkPreviewData | null> {
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}&audio=false&video=false&iframe=false&meta=true`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(endpoint, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as MicrolinkResponse;
    if (json.status !== 'success' || !json.data) return null;
    const d = json.data;
    const publisher = d.publisher || null;
    const imageUsable = isUsableImage(d.image) ? pickImageUrl(d.image) : null;
    const logoUsable = isUsableImage(d.logo) ? pickImageUrl(d.logo) : null;
    const image = imageUsable || logoUsable;
    return {
      url: d.url || url,
      host: hostOf(d.url || url),
      title: cleanTitle(d.title, publisher),
      description: d.description || null,
      image,
      siteName: publisher,
    };
  } catch {
    return null;
  }
}

/** noembed.com — oEmbed gratuito sem chave, CORS aberto. Cobre YouTube, Vimeo, Twitter, SoundCloud etc. */
async function tryNoembed(url: string): Promise<LinkPreviewData | null> {
  try {
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(endpoint, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const d = await res.json() as {
      title?: string; author_name?: string; provider_name?: string;
      thumbnail_url?: string; url?: string; error?: string;
    };
    if (d.error) return null;
    if (!d.title && !d.thumbnail_url) return null;
    return {
      url: d.url || url,
      host: hostOf(d.url || url),
      title: cleanTitle(d.title, d.provider_name) || d.title || null,
      description: d.author_name ? `por ${d.author_name}` : null,
      image: d.thumbnail_url || null,
      siteName: d.provider_name || null,
    };
  } catch {
    return null;
  }
}

/** Fallback determinístico p/ YouTube — thumb sempre disponível mesmo offline da API. */
function youTubeFallback(url: string): LinkPreviewData | null {
  const id = getYouTubeId(url);
  if (!id) return null;
  return {
    url,
    host: 'youtube.com',
    title: 'Vídeo do YouTube',
    description: null,
    image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    siteName: 'YouTube',
  };
}

async function fetchPreview(url: string): Promise<LinkPreviewData | null> {
  if (cache.has(url)) return cache.get(url)!;
  if (inflight.has(url)) return inflight.get(url)!;

  const p = (async (): Promise<LinkPreviewData | null> => {
    try {
      // 1) X/Twitter primeiro (fxtwitter/vxtwitter) — devolve título e, quando há mídia, a thumb.
      let preview = await tryFxTwitter(url);
      // 2) Se ainda não há imagem, tenta microlink (rico) para puxar capa de OG/Twitter cards.
      if (!preview || !preview.image) {
        const ml = await tryMicrolink(url);
        if (ml) {
          preview = preview
            ? { ...preview, image: preview.image || ml.image, description: preview.description || ml.description }
            : ml;
        }
      }
      // 3) noembed (oEmbed) — bom p/ YouTube, Vimeo, Twitter, etc.
      if (!preview || !preview.image) {
        const ne = await tryNoembed(url);
        if (ne) {
          preview = preview
            ? { ...preview, image: preview.image || ne.image, description: preview.description || ne.description }
            : ne;
        }
      }
      // 4) YouTube fallback determinístico (thumb sempre disponível).
      if (!preview || !preview.image) {
        const yt = youTubeFallback(url);
        if (yt) preview = { ...(preview || yt), image: preview?.image || yt.image, title: preview?.title || yt.title, siteName: preview?.siteName || yt.siteName, host: yt.host };
      }
      cache.set(url, preview);
      return preview;
    } catch {
      cache.set(url, null);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

/**
 * Helper público para reutilizar a mesma resolução de preview que o
 * LinkPreviewCard usa no modal. Devolve a imagem (poster) resolvida ou null.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  return fetchPreview(url);
}


/**
 * Player de iframe embutido (YouTube/Vimeo) com:
 *  - Skeleton/placeholder enquanto o iframe carrega (sem piscadas).
 *  - Sandbox restritivo + `referrerPolicy` + `allow` mínimo necessário.
 *  - Botão "remover prévia" opcional.
 */
function EmbeddedFramePlayer({
  src,
  title,
  readOnly,
  onDismiss,
  engagementKey,
}: { src: string; title: string; readOnly?: boolean; onDismiss?: () => void; engagementKey?: string }) {
  const [ready, setReady] = useState(false);
  const trackHover = useFeedEmbedEngagementStore((s) => s.trackHover);
  const trackPlay = useFeedEmbedEngagementStore((s) => s.trackPlay);

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-xl border border-border/60 bg-black shadow-sm"
      onMouseEnter={engagementKey ? () => trackHover(engagementKey) : undefined}
      onPointerDownCapture={engagementKey ? () => trackPlay(engagementKey) : undefined}
    >
      {!readOnly && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Remover prévia"
          className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur transition hover:bg-background hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {/* aspect-video reservado SEMPRE — evita layout shift entre skeleton e player */}
      <div className="relative aspect-video w-full bg-card">
        {!ready && (
          <div
            aria-hidden
            aria-label="Carregando player…"
            className="absolute inset-0 z-10 aspect-video animate-pulse bg-gradient-to-br from-card via-muted/40 to-card"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
            </div>
          </div>
        )}
        <iframe
          src={src}
          title={title}
          loading="lazy"
          onLoad={() => setReady(true)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  );
}

interface Props {
  /** Texto bruto do post — o componente extrai a primeira URL. */
  text: string;
  /** Callback opcional quando o usuário fecha o preview. */
  onDismiss?: () => void;
  /** Entrega ao modal a mesma prévia exibida, para salvar capa/título no post. */
  onPreviewResolved?: (preview: LinkPreviewData | null) => void;
  /** Quando true, mostra a prévia sem permitir saída para site externo. */
  disableExternalLink?: boolean;
  /** Quando true, oculta o botão de fechar (modo leitura — tópicos/respostas). */
  readOnly?: boolean;
}

export function LinkPreviewCard({ text, onDismiss, onPreviewResolved, disableExternalLink = false, readOnly = false }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Debounce: só busca depois de 500ms parado.
  useEffect(() => {
    const detected = extractFirstUrl(text);
    const t = setTimeout(() => setUrl(detected), 500);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (!url) { setData(null); setLoading(false); onPreviewResolved?.(null); return; }
    if (url === dismissed) { setData(null); setLoading(false); onPreviewResolved?.(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchPreview(url).then((preview) => {
      if (cancelled) return;
      setData(preview);
      onPreviewResolved?.(preview);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [url, dismissed, onPreviewResolved]);

  if (!url) return null;
  if (url === dismissed) return null;

  if (loading && !data) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Buscando prévia do link…
      </div>
    );
  }

  // Sem dados — fallback mínimo com host.
  const host = data?.host || (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
  const title = data?.title || data?.siteName || host;
  const image = data?.image || null;
  const description = data?.description || null;

  const handleDismiss = () => {
    setDismissed(url);
    onPreviewResolved?.(null);
    onDismiss?.();
  };

  // Vídeo embutível (YouTube / Vimeo / arquivo direto) — parser unificado.
  const embedded = parseEmbeddedVideo(url);
  if (embedded) {
    const engagementKey = `${embedded.kind}:${embedded.id}`;

    if (embedded.kind === 'youtube' || embedded.kind === 'vimeo') {
      return (
        <EmbeddedFramePlayer
          title={data?.title || (embedded.kind === 'youtube' ? 'Vídeo do YouTube' : 'Vídeo do Vimeo')}
          src={embedded.embedSrc}
          readOnly={readOnly}
          onDismiss={handleDismiss}
          engagementKey={engagementKey}
        />
      );
    }

    // Arquivo direto — player nativo, mesma proporção e tracking.
    return (
      <div
        className="relative mt-3 overflow-hidden rounded-xl border border-border/60 bg-black shadow-sm"
        onMouseEnter={() => useFeedEmbedEngagementStore.getState().trackHover(engagementKey)}
      >
        {!readOnly && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Remover prévia"
            className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur transition hover:bg-background hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="relative aspect-video w-full bg-card">
          <video
            src={embedded.embedSrc}
            controls
            playsInline
            preload="metadata"
            onPlay={() => useFeedEmbedEngagementStore.getState().trackPlay(engagementKey)}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>
    );
  }




  // Algumas origens (X/Twitter, CDNs com hotlink-protection) retornam 403/CORB
  // quando a imagem é carregada de outro domínio direto no <img>. Roteamos
  // pelo nosso proxy `/api/link-cover-image` (mesmo domínio, CORS aberto,
  // cache CDN) para garantir que a thumb apareça no preview do modal.
  const proxiedImage = image
    ? (image.startsWith('/') || image.startsWith(window.location.origin)
        ? image
        : `/api/link-cover-image?url=${encodeURIComponent(image)}`)
    : null;

  const content = (
    <>
      {proxiedImage ? (
        <div className="relative aspect-[1.91/1] w-full overflow-hidden bg-muted">
          <img
            src={proxiedImage}
            alt={title || 'Prévia do link'}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              // Fallback final: tenta o src original direto se o proxy falhar.
              if (image && el.src !== image) { el.src = image; return; }
              el.style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="flex aspect-[5/1] w-full items-center justify-center bg-muted/40 text-muted-foreground">
          <ImageOff className="h-5 w-5" />
        </div>
      )}

      <div className="space-y-1 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{host}</span>
          {!disableExternalLink && <ExternalLink className="ml-auto h-3 w-3 shrink-0" />}
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {title}
        </p>
        {description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm">
      {!readOnly && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Remover prévia"
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur transition hover:bg-background hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {disableExternalLink ? (
        <div className="block">{content}</div>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {content}
        </a>
      )}
    </div>
  );
}
