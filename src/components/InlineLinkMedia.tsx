/**
 * InlineLinkMedia — player embedado dentro do feed para links de vídeo/áudio
 * (YouTube, Vimeo, TikTok, Spotify, SoundCloud, Twitch, Dailymotion).
 *
 * Estratégia "lite/façade" (mesma usada pelo lite-youtube-embed):
 * - Idle: renderiza apenas thumbnail + botão play (zero iframe, zero JS de terceiros).
 * - Ao clicar: monta o iframe com `?autoplay=1`. O clique conta como gesto
 *   do usuário, então o autoplay é permitido pelo navegador.
 *
 * Por quê: iframes do YT/TikTok carregam ~1–3 MB de JS cada. Em mobile de
 * baixa potência, ter 5 vídeos no feed = travamento. Fachada = 1 imagem.
 *
 * Performance-first:
 * - `loading="lazy"` + `decoding="async"` nas thumbs.
 * - Sem scripts externos (TikTok blockquote oficial pesa MB; usamos
 *   `tiktok.com/embed/v2/{id}` direto).
 * - Sem cookies de tracking (youtube-nocookie.com).
 * - Tamanho 100% responsivo via aspect-ratio CSS.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Music2, Video, ExternalLink, Loader2, Twitter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractFirstUrl } from '@/components/chat/LinkPreview';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';

type Provider =
  | 'youtube'
  | 'vimeo'
  | 'tiktok'
  | 'spotify'
  | 'soundcloud'
  | 'twitch'
  | 'dailymotion'
  | 'twitter'
  | 'xvideos';

interface MediaInfo {
  provider: Provider;
  id: string;            // ID canônico no provedor (vídeo, track, etc.)
  embedSrc: string;      // URL final para o iframe (já com autoplay/params)
  thumbnail: string | null;
  aspect: 'video' | 'square' | 'audio' | 'auto'; // controla a proporção do container
  label: string;         // nome exibido como fallback
  originalUrl?: string;
}

/* ───────────────────── detecção por URL ───────────────────── */

function parseUrl(raw: string): URL | null {
  try { return new URL(raw); } catch { return null; }
}

function detect(raw: string): MediaInfo | null {
  const u = parseUrl(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, '');

  // ── YouTube (watch, youtu.be, shorts, embed) ──────────────
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return makeYouTube(id);
  }
  if (/(^|\.)youtube\.com$/.test(host)) {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      if (id) return makeYouTube(id);
    }
    const m = u.pathname.match(/^\/(shorts|embed|v)\/([^/?#]+)/);
    if (m) return makeYouTube(m[2]);
  }

  // ── Vimeo ────────────────────────────────────────────────
  if (/(^|\.)vimeo\.com$/.test(host)) {
    const m = u.pathname.match(/^\/(\d+)(?:\/([\w]+))?/);
    if (m) {
      const id = m[1];
      const h = m[2]; // hash para vídeos privados
      const src = `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1${h ? `&h=${h}` : ''}`;
      return {
        provider: 'vimeo', id, embedSrc: src, thumbnail: null,
        aspect: 'video', label: 'Vimeo',
      };
    }
  }

  // ── TikTok ───────────────────────────────────────────────
  if (/(^|\.)tiktok\.com$/.test(host)) {
    // /@user/video/123  •  /v/123  •  /embed/123
    const m =
      u.pathname.match(/\/video\/(\d+)/) ||
      u.pathname.match(/^\/v\/(\d+)/) ||
      u.pathname.match(/^\/embed\/v2\/(\d+)/);
    if (m) {
      const id = m[1];
      return {
        provider: 'tiktok', id,
        embedSrc: `https://www.tiktok.com/embed/v2/${id}?lang=pt-BR`,
        thumbnail: null,
        aspect: 'square', // TikTok costuma ser 9:16; usamos 'square' como base
        label: 'TikTok',
      };
    }
  }

  // ── Spotify (track/album/playlist/episode/show) ──────────
  if (/(^|\.)spotify\.com$/.test(host) || host === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
    if (m) {
      const kind = m[1], id = m[2];
      return {
        provider: 'spotify', id,
        embedSrc: `https://open.spotify.com/embed/${kind}/${id}?utm_source=oculto`,
        thumbnail: null,
        aspect: 'audio',
        label: 'Spotify',
      };
    }
  }

  // ── SoundCloud (qualquer URL pública) ────────────────────
  if (/(^|\.)soundcloud\.com$/.test(host) || host === 'soundcloud.com') {
    const encoded = encodeURIComponent(raw);
    return {
      provider: 'soundcloud', id: raw,
      embedSrc: `https://w.soundcloud.com/player/?url=${encoded}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false&color=%23ff0066`,
      thumbnail: null,
      aspect: 'audio',
      label: 'SoundCloud',
    };
  }

  // ── Twitch (clipes ou vídeos) ────────────────────────────
  if (/(^|\.)twitch\.tv$/.test(host)) {
    const parentHost = typeof window !== 'undefined' ? window.location.hostname : 'ocultoswing.com.br';
    const clip = u.pathname.match(/^\/(?:[^/]+\/)?clip\/([^/?#]+)/) || (host === 'clips.twitch.tv' ? u.pathname.match(/^\/([^/?#]+)/) : null);
    if (clip) {
      return {
        provider: 'twitch', id: clip[1],
        embedSrc: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip[1])}&parent=${parentHost}&autoplay=true`,
        thumbnail: null, aspect: 'video', label: 'Twitch',
      };
    }
    const vod = u.pathname.match(/^\/videos\/(\d+)/);
    if (vod) {
      return {
        provider: 'twitch', id: vod[1],
        embedSrc: `https://player.twitch.tv/?video=${vod[1]}&parent=${parentHost}&autoplay=true`,
        thumbnail: null, aspect: 'video', label: 'Twitch',
      };
    }
  }

  // ── Dailymotion ──────────────────────────────────────────
  if (host === 'dai.ly') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return makeDailymotion(id);
  }
  if (/(^|\.)dailymotion\.com$/.test(host)) {
    const m = u.pathname.match(/\/video\/([^/?#]+)/);
    if (m) return makeDailymotion(m[1]);
  }

  // ── Twitter / X (apenas /status/{id} — onde existe mídia) ──
  if (host === 'twitter.com' || host === 'x.com' || /(^|\.)twitter\.com$/.test(host) || /(^|\.)x\.com$/.test(host)) {
    const m = u.pathname.match(/\/(?:i\/)?status(?:es)?\/(\d+)/);
    if (m) {
      const id = m[1];
      // twitframe.com é o iframe oficial recomendado para embeds de tweets:
      // leve, sem JS no host, posta `{ height }` via postMessage para auto-resize.
      // Renderiza player nativo de vídeo/GIF quando o tweet tem mídia.
      const tweetUrl = `https://twitter.com/i/status/${id}`;
      return {
        provider: 'twitter', id,
        embedSrc: `https://twitframe.com/show?url=${encodeURIComponent(tweetUrl)}`,
        thumbnail: null,
        aspect: 'auto',
        label: 'X / Twitter',
        originalUrl: raw,
      };
    }
  }

  // ── XVideos (vídeo adulto) ───────────────────────────────
  // URLs: /video.ITHVHLD448D/slug  •  /videoITHVHLD448D/slug  •  /embedframe/ITHVHLD448D
  if (/(^|\.)xvideos\.com$/.test(host) || /(^|\.)xvideos\.red$/.test(host) || /(^|\.)xvideos2\.com$/.test(host)) {
    const m =
      u.pathname.match(/^\/embedframe\/([A-Za-z0-9]+)/) ||
      u.pathname.match(/^\/video\.?([A-Za-z0-9]+)/);
    if (m) {
      const id = m[1];
      return {
        provider: 'xvideos', id,
        embedSrc: `https://www.xvideos.com/embedframe/${id}`,
        thumbnail: null,
        aspect: 'video',
        label: 'XVideos',
        originalUrl: raw,
      };
    }
  }

  return null;
}


function makeYouTube(id: string): MediaInfo {
  return {
    provider: 'youtube',
    id,
    // youtube-nocookie + autoplay + sem related ao final (rel=0).
    embedSrc: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    // mqdefault (320x180 ~5KB) é o ideal pra feed mobile; o <img srcset>
    // promove pra hqdefault só em telas grandes/retina via mídia-query.
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    aspect: 'video',
    label: 'YouTube',
  };
}

function makeDailymotion(id: string): MediaInfo {
  return {
    provider: 'dailymotion',
    id,
    embedSrc: `https://www.dailymotion.com/embed/video/${id}?autoplay=1&queue-enable=false`,
    thumbnail: `https://www.dailymotion.com/thumbnail/video/${id}`,
    aspect: 'video',
    label: 'Dailymotion',
  };
}

/* ───────── helpers de performance ───────── */

// Preconnect "on demand" — só quando o usuário sinaliza intenção de tocar
// (hover/touchstart). Evita handshake TLS desnecessário para todos os cards.
const preconnected = new Set<string>();
function preconnect(origins: string[]) {
  if (typeof document === 'undefined') return;
  for (const origin of origins) {
    if (preconnected.has(origin)) continue;
    preconnected.add(origin);
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = origin;
    l.crossOrigin = '';
    document.head.appendChild(l);
  }
}

// video.twimg.com bloqueia hotlink (HTTP 403) quando o Referer NÃO é
// twitter.com/x.com. Forçamos referrer-policy=no-referrer no documento
// para que o browser omita o header Referer nas próximas requests de mídia.
// Idempotente — só injeta uma vez.
let referrerMetaInstalled = false;
function ensureNoReferrerMeta() {
  if (referrerMetaInstalled || typeof document === 'undefined') return;
  let m = document.querySelector('meta[name="referrer"]') as HTMLMetaElement | null;
  if (!m) {
    m = document.createElement('meta');
    m.name = 'referrer';
    document.head.appendChild(m);
  }
  m.content = 'no-referrer';
  referrerMetaInstalled = true;
}

function toTwitterVideoProxy(src: string): string {
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:' || u.hostname !== 'video.twimg.com') return src;
    if (typeof window === 'undefined') return src;
    const host = window.location.hostname;
    const isPreview = host.includes('id-preview--') || host.includes('lovable.app') || host.includes('lovableproject.com') || host === 'localhost' || host === '127.0.0.1';
    return isPreview ? src : `/api/twitter-video?url=${encodeURIComponent(src)}`;
  } catch {
    return src;
  }
}

const warmedTwitterVideos = new Set<string>();
function warmTwitterVideo(src: string) {
  if (!src || warmedTwitterVideos.has(src)) return;
  warmedTwitterVideos.add(src);
  try {
    fetch(src, {
      method: 'GET',
      cache: 'force-cache',
      credentials: 'omit',
      mode: src.startsWith('/api/') ? 'same-origin' : 'no-cors',
      headers: { Range: 'bytes=0-1048575' },
    }).catch(() => { /* noop */ });
  } catch { /* noop */ }
}


const providerOrigins: Record<Provider, string[]> = {
  youtube:     ['https://www.youtube-nocookie.com', 'https://i.ytimg.com', 'https://www.google.com'],
  vimeo:       ['https://player.vimeo.com', 'https://i.vimeocdn.com'],
  tiktok:      ['https://www.tiktok.com', 'https://www.tiktok.com'],
  spotify:     ['https://open.spotify.com', 'https://i.scdn.co'],
  soundcloud:  ['https://w.soundcloud.com', 'https://i1.sndcdn.com'],
  twitch:      ['https://player.twitch.tv', 'https://clips.twitch.tv'],
  dailymotion: ['https://www.dailymotion.com'],
  twitter:     ['https://video.twimg.com', 'https://pbs.twimg.com'],
  xvideos:     ['https://www.xvideos.com', 'https://img-egc.xvideos-cdn.com'],
};

// Hook: dispara um callback quando o nó entra (ou está perto de entrar) na viewport.
// rootMargin generoso para começar a aquecer antes de o usuário ver o card.
function useNearViewport<T extends HTMLElement>(
  ref: React.RefObject<T>,
  rootMargin = '400px 0px',
): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setNear(true); io.disconnect(); break; }
        }
      },
      { rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [ref, rootMargin, near]);
  return near;
}

// Detecta "Save-Data" / conexão lenta — pula o fetch agressivo de syndication.
function prefersDataSaving(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  const et = String(c.effectiveType || '');
  return et === '2g' || et === 'slow-2g';
}

function prefersLightVideoVariant(): boolean {
  if (prefersDataSaving()) return true;
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } };
  const et = String(nav.connection?.effectiveType || '');
  const lowCpu = (nav.hardwareConcurrency || 4) <= 4;
  const lowRam = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const narrowScreen = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  return lowCpu || lowRam || narrowScreen || et === '3g' || et === '4g';
}

/* ───────────── helper: dados do tweet via syndication ───────────── */

interface TweetVideoInfo {
  src: string;          // melhor MP4
  poster?: string;
  width?: number;
  height?: number;
  isGif: boolean;
}

type TweetPreviewInfo = {
  title?: string | null;
  author?: string | null;
  poster?: string | null;
};

type TweetState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'video'; video: TweetVideoInfo }
  | { kind: 'text-only'; preview?: TweetPreviewInfo }
  | { kind: 'unknown' };

// Cache global por id de tweet — evita refetch quando o usuário rola pra cima/baixo.
const tweetCache = new Map<string, TweetState>();
const tweetInflight = new Map<string, Promise<TweetState>>();

type LooseObject = Record<string, unknown>;
const asObject = (v: unknown): LooseObject => (v && typeof v === 'object' ? v as LooseObject : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const get = (obj: unknown, key: string): unknown => asObject(obj)[key];

function pickBestMp4(variants: unknown[]): { src: string; bitrate: number } | null {
  if (!Array.isArray(variants)) return null;
  const mp4s = variants
    .map((raw) => {
      const v = asObject(raw);
      return {
      src: (v.src || v.url) as string | undefined,
      bitrate: Number(v.bitrate) || 0,
      type: v.type || v.content_type || (v.container === 'mp4' ? 'video/mp4' : undefined),
    };
    })
    .filter(v => String(v.type).includes('video/mp4') && typeof v.src === 'string' && /^https:\/\/video\.twimg\.com\//.test(v.src))
    .map(v => ({ src: v.src as string, bitrate: v.bitrate }));
  if (!mp4s.length) return null;
  // Performance mobile first: prioriza MP4 leve para evitar travar/desincronizar
  // em celular fraco/rede ruim. Nunca cai no maior bitrate como fallback.
  mp4s.sort((a, b) => a.bitrate - b.bitrate);
  if (prefersDataSaving()) return mp4s[0];
  const maxBitrate = prefersLightVideoVariant() ? 700_000 : 1_200_000;
  const capped = mp4s.filter(v => v.bitrate > 0 && v.bitrate <= maxBitrate);
  if (capped.length) return capped[capped.length - 1];
  const withBitrate = mp4s.filter(v => v.bitrate > 0);
  return withBitrate[0] || mp4s[0];
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 7000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

function parseTweetPayload(j: unknown): TweetState | null {
  if (!j) return null;
  const payload = asObject(j);
  const root = asObject(payload.tweet || j);
  const rootMedia = asObject(root.media);
  const extendedEntities = asObject(root.extended_entities);
  const media: unknown[] = [
    ...asArray(root.mediaDetails),
    ...asArray(payload.mediaDetails),
    ...asArray(extendedEntities.media),
    ...asArray(rootMedia.all),
    ...asArray(rootMedia.videos),
    ...asArray(payload.media_extended),
  ];
  const videoRoot = asObject(root.video || payload.video);
  const vidMediaRaw = media.find((m) => {
    const item = asObject(m);
    return item.type === 'video' || item.type === 'animated_gif' || String(item.format).includes('video');
  });
  const vidMedia = asObject(vidMediaRaw);
  const videoInfo = asObject(vidMedia.video_info);
  const videoInfoCamel = asObject(vidMedia.videoInfo);
  const variants = [
    ...asArray(videoRoot.variants),
    ...asArray(videoInfo.variants),
    ...asArray(videoInfoCamel.variants),
    ...asArray(vidMedia.variants),
    ...asArray(vidMedia.formats),
    ...(vidMedia.url ? [{ url: vidMedia.url, content_type: vidMedia.format || 'video/mp4', bitrate: vidMedia.bitrate }] : []),
    ...asArray(payload.mediaURLs).map((url) => ({ url, content_type: 'video/mp4', bitrate: 0 })),
  ];
  const best = pickBestMp4(variants);
  if (best) {
    const aspect = asArray(videoRoot.aspectRatio).length
      ? asArray(videoRoot.aspectRatio)
      : asArray(videoInfo.aspect_ratio).length
        ? asArray(videoInfo.aspect_ratio)
        : asArray(videoInfoCamel.aspectRatio);
    const [rw, rh] = aspect;
    const size = asObject(vidMedia.size);
    const originalInfo = asObject(vidMedia.original_info);
    const poster = [videoRoot.poster, vidMedia.thumbnail_url, vidMedia.media_url_https, vidMedia.mediaUrlHttps, vidMedia.media_url]
      .find((value): value is string => typeof value === 'string' && value.length > 0);
    const width = Number(vidMedia.width || size.width || originalInfo.width || rw || 16);
    const height = Number(vidMedia.height || size.height || originalInfo.height || rh || 9);
    return {
      kind: 'video',
      video: {
        src: best.src,
        poster,
        width: width || 16,
        height: height || 9,
        isGif: vidMedia.type === 'animated_gif',
      },
    };
  }
  const authorObj = asObject(root.author);
  const userObj = asObject(root.user);
  const title = typeof root.text === 'string' ? root.text : typeof payload.text === 'string' ? payload.text : null;
  const author = typeof authorObj.screen_name === 'string'
    ? authorObj.screen_name
    : typeof userObj.screen_name === 'string'
      ? userObj.screen_name
      : typeof payload.user_screen_name === 'string'
        ? payload.user_screen_name
        : null;
  const posterMedia = asObject(media.find((m) => {
    const item = asObject(m);
    return item.thumbnail_url || item.media_url_https || item.mediaUrlHttps || item.media_url;
  }));
  const previewPoster = [posterMedia.thumbnail_url, posterMedia.media_url_https, posterMedia.mediaUrlHttps, posterMedia.media_url]
    .find((value): value is string => typeof value === 'string' && value.length > 0) || null;
  return { kind: 'text-only', preview: { title, author, poster: previewPoster } };
}

async function fetchTweetFromSources(id: string): Promise<TweetState> {
  // Apenas fontes públicas — nenhuma edge function necessária
  const sources = [
    `https://api.fxtwitter.com/status/${encodeURIComponent(id)}`,
    `https://api.vxtwitter.com/status/${encodeURIComponent(id)}`,
  ];
  let textOnly: TweetState | null = null;
  for (const url of sources) {
    try {
      const parsed = parseTweetPayload(await fetchJsonWithTimeout(url));
      if (parsed?.kind === 'video') return parsed;
      if (parsed?.kind === 'text-only') textOnly = parsed;
    } catch {
      // Source indisponível (404/timeout/CORS) — tenta próxima
    }
  }
  return textOnly || { kind: 'unknown' };
}

async function fetchTweet(id: string): Promise<TweetState> {
  const cached = tweetCache.get(id);
  if (cached) return cached;
  const flying = tweetInflight.get(id);
  if (flying) return flying;
  const p = fetchTweetFromSources(id)
    .then((s) => {
      // Não cacheia falha transitória: se a rede/API oscilar, o próximo render tenta de novo.
      if (s.kind !== 'unknown') tweetCache.set(id, s);
      tweetInflight.delete(id);
      return s;
    });
  tweetInflight.set(id, p);
  return p;
}

function useTweetData(id: string | null, enabled: boolean): TweetState {
  const [state, setState] = useState<TweetState>(() => {
    if (!id) return { kind: 'unknown' };
    return tweetCache.get(id) || { kind: 'idle' };
  });
  useEffect(() => {
    if (!id || !enabled) return;
    const cached = tweetCache.get(id);
    if (cached) { setState(cached); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchTweet(id).then((s) => { if (!cancelled) setState(s); });
    return () => { cancelled = true; };
  }, [id, enabled]);
  return state;
}

/* ───────────────────── componente ───────────────────── */

interface Props {
  /** Texto bruto do post — extrai a 1ª URL. */
  text: string;
  className?: string;
}

export function InlineLinkMedia({ text, className }: Props) {
  const info = useMemo(() => {
    const url = extractFirstUrl(text);
    return url ? detect(url) : null;
  }, [text]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Só começa a fazer trabalho pesado (fetch/decodificar imagens) quando
  // o card chega perto da viewport — em feeds longos isso é decisivo.
  const nearViewport = useNearViewport(containerRef);

  const [activated, setActivated] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [tweetPlayError, setTweetPlayError] = useState(false);
  const [tweetBuffering, setTweetBuffering] = useState(false);
  const [dynamicThumb, setDynamicThumb] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // XVideos não devolve thumbnail no `detect()` — buscamos o og:image via
  // microlink (gratuito, CORS aberto) só quando o card entra na viewport.
  useEffect(() => {
    if (!nearViewport) return;
    if (!info || info.provider !== 'xvideos') return;
    if (dynamicThumb) return;
    const url = info.originalUrl;
    let cancelled = false;
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}&audio=false&video=false&iframe=false&meta=true`;
    fetch(endpoint).then(r => r.ok ? r.json() : null).then((j: any) => {
      if (cancelled || !j) return;
      const img = typeof j?.data?.image === 'string' ? j.data.image : j?.data?.image?.url;
      if (typeof img === 'string' && img) setDynamicThumb(img);
    }).catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [nearViewport, info, dynamicThumb]);

  const isTwitter = info?.provider === 'twitter';
  const tweet = useTweetData(isTwitter ? info!.id : null, nearViewport);
  const playableTweetSrc = useMemo(
    () => (isTwitter && tweet.kind === 'video' ? toTwitterVideoProxy(tweet.video.src) : null),
    [isTwitter, tweet],
  );

  useEffect(() => {
    if (!nearViewport || !playableTweetSrc) return;
    const idle = (cb: () => void) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(cb, { timeout: 900 });
      } else {
        globalThis.setTimeout(cb, 120);
      }
    };
    idle(() => warmTwitterVideo(playableTweetSrc));
  }, [nearViewport, playableTweetSrc]);

  useEffect(() => {
    setActivated(false);
    setIframeLoading(true);
    setTweetPlayError(false);
    setTweetBuffering(false);
    const el = videoRef.current;
    if (el) {
      try { el.pause(); } catch { /* noop */ }
      try { el.removeAttribute('src'); el.load(); } catch { /* noop */ }
    }
  }, [info?.provider, info?.id]);

  // Aquece DNS/TLS dos provedores SÓ quando o usuário aponta/toca o player.
  const warmUp = () => { if (info) preconnect(providerOrigins[info.provider]); };

  // Estilos comuns: contain layout + content-visibility para skip de paint offscreen.
  // `contain-intrinsic-size` reserva ~220px de altura, evitando shifts (CLS).
  const perfStyle: React.CSSProperties & {
    contentVisibility?: string;
    containIntrinsicSize?: string;
    contain?: string;
  } = {
    contentVisibility: 'auto',
    containIntrinsicSize: '220px 100%',
    contain: 'layout paint style',
  };

  // YouTube thumb: srcset com mqdefault em mobile e hqdefault em desktop/retina.
  const ytSrcSet = info?.provider === 'youtube'
    ? `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg 320w, https://i.ytimg.com/vi/${info.id}/hqdefault.jpg 480w`
    : undefined;

  if (!info) return null;

  // ── Twitter: roteia conforme o tipo de conteúdo do tweet ──
  if (isTwitter) {
    // Antes do card chegar perto da viewport, renderiza um placeholder leve
    // (sem fetch, sem imagem) que reserva altura para evitar layout shift.
    if (!nearViewport || tweet.kind === 'idle' || tweet.kind === 'loading') {
      return (
        <div
          ref={containerRef}
          className={cn('relative w-full overflow-hidden rounded-xl border border-border/60 bg-black/40 h-[180px]', className)}
          style={perfStyle}
        >
          {tweet.kind === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
      );
    }
    if (tweet.kind === 'text-only' || tweet.kind === 'unknown') {
      // Tweet sem MP4 detectável → prévia interna sem clique externo.
      return <div ref={containerRef}><LinkPreviewCard text={text} disableExternalLink /></div>;
    }

    // ── Tweet com vídeo/gif: player NATIVO HTML5 (sem iframe, máxima perf) ──
    // Mobile exige que video.play() aconteça no MESMO gesto do usuário.
    // Por isso o <video> já fica montado atrás da capa; o clique só libera o play.
    ensureNoReferrerMeta(); // evita HTTP 403 hotlink do video.twimg.com
    const v = tweet.video;
    const ratio = v.width && v.height ? `${v.width} / ${v.height}` : '16 / 9';
    const isPortraitTweet = Boolean(v.width && v.height && v.height > v.width);
    const shouldUseTallTweetFrame = isPortraitTweet || !v.width || !v.height;
    const playableSrc = playableTweetSrc || toTwitterVideoProxy(v.src);

    const playTweetVideo = () => {
      warmUp();
      setActivated(true);
      setTweetPlayError(false);
      setTweetBuffering(true);
      const el = videoRef.current;
      if (!el) return;
      el.pause();
      el.controls = !v.isGif;
      el.playsInline = true;
      el.autoplay = false;
      el.loop = false;
      el.muted = false;
      el.volume = 1;
      if (el.getAttribute('src') !== playableSrc) el.src = playableSrc;
      if (el.ended || (Number.isFinite(el.duration) && el.currentTime >= el.duration - 0.15)) {
        try { el.currentTime = 0; } catch { /* noop */ }
      }
      if (!el.currentSrc || el.readyState === 0) {
        try { el.load(); } catch { /* noop */ }
      }
      const attempt = el.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.then(() => { setTweetPlayError(false); setTweetBuffering(false); }).catch(() => {
          setTweetBuffering(false);
          setTweetPlayError(true);
        });
      }
    };
    return (
      <div
        ref={containerRef}
        className={cn(
          'relative w-full overflow-hidden rounded-xl border border-border/60 bg-black',
          shouldUseTallTweetFrame ? 'h-[min(78vh,560px)] sm:h-auto sm:max-h-[80vh]' : 'max-h-[80vh]',
          className,
        )}
        style={{ aspectRatio: ratio, ...perfStyle }}
      >
        <video
          ref={videoRef}
          src={playableSrc}
          poster={v.poster}
          controls={activated && !v.isGif}
          playsInline
          {...({ 'webkit-playsinline': 'true', 'x5-playsinline': 'true' } as Record<string, string>)}
          muted={false}
          preload="auto"
          loop={false}
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onLoadedMetadata={() => warmTwitterVideo(playableSrc)}
          onCanPlay={() => setTweetBuffering(false)}
          onLoadedData={() => setTweetBuffering(false)}
          onWaiting={() => setTweetBuffering(true)}
          onStalled={() => setTweetBuffering(true)}
          onPlaying={() => { setActivated(true); setTweetBuffering(false); setTweetPlayError(false); }}
          onPause={() => setTweetBuffering(false)}
          onEnded={() => { setTweetBuffering(false); setActivated(false); }}
          onError={(e) => {
            const el = e.currentTarget;
            if (playableSrc !== v.src && el.getAttribute('src') !== v.src) {
              el.src = v.src;
              el.load();
              el.play()
                .then(() => { setTweetPlayError(false); setTweetBuffering(false); })
                .catch(() => { setTweetBuffering(false); setTweetPlayError(true); });
            } else {
              setTweetBuffering(false);
              setTweetPlayError(true);
            }
          }}
          className="absolute inset-0 h-full w-full bg-black object-contain"
        />



        {!activated ? (
          <button
            type="button"
            onPointerEnter={warmUp}
            onTouchStart={warmUp}
            onClick={(e) => {
              e.stopPropagation();
              playTweetVideo();
            }}
            aria-label="Reproduzir vídeo do X / Twitter"
            className="group absolute inset-0 flex items-center justify-center bg-black"
          >
            {v.poster ? (
              <img
                src={v.poster}
                alt="Capa do vídeo"
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain opacity-90 transition group-hover:opacity-70"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/40">
                <Twitter className="h-12 w-12" />
              </div>
            )}
            <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition group-hover:scale-110">
              <Play className="ml-0.5 h-7 w-7 fill-current" />
            </span>
            <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
              <Twitter className="h-3 w-3" /> X / Twitter
            </span>
          </button>
        ) : null}
        {activated && tweetBuffering && !tweetPlayError && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/20">
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          </div>
        )}
        {tweetPlayError && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-md bg-black/80 px-3 py-2 text-center text-xs text-white">
            <button type="button" onClick={playTweetVideo} className="font-semibold text-primary">
              Tentar reproduzir novamente
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Demais provedores: iframe lite façade ──
  const aspectClass =
    info.aspect === 'video' ? 'aspect-video'
    : info.aspect === 'square' ? 'aspect-[9/16] max-h-[70vh]'
    : 'h-[152px]';

  const ProviderIcon = info.aspect === 'audio' ? Music2 : Video;

  // Antes do card chegar perto da viewport, NEM carrega a thumb — só reserva altura.
  // Isso reduz drasticamente uso de rede/memória num feed com dezenas de cards.
  const shouldLoadThumb = nearViewport;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-border/60 bg-black/40',
        aspectClass,
        className,
      )}
      style={perfStyle}
    >
      {!activated ? (
        <button
          type="button"
          onPointerEnter={warmUp}
          onTouchStart={warmUp}
          onClick={(e) => { e.stopPropagation(); warmUp(); setActivated(true); }}
          aria-label={`Reproduzir ${info.label}`}
          className="group absolute inset-0 flex items-center justify-center bg-black"
        >
          {(info.thumbnail || dynamicThumb) && shouldLoadThumb ? (
            <img
              src={info.thumbnail || dynamicThumb || ''}
              srcSet={ytSrcSet}
              sizes="(max-width: 640px) 100vw, 600px"
              alt={`Capa do ${info.label}`}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:opacity-70"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800 text-white/40">
              <ProviderIcon className="h-12 w-12" />
            </div>
          )}
          <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition group-hover:scale-110">
            <Play className="ml-0.5 h-7 w-7 fill-current" />
          </span>
          <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            <ProviderIcon className="h-3 w-3" /> {info.label}
          </span>
        </button>
      ) : (
        <>
          {iframeLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          <iframe
            src={info.embedSrc}
            title={`${info.label} player`}
            loading="lazy"
            allow="accelerated-2d-canvas; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setIframeLoading(false)}
            className="absolute inset-0 h-full w-full border-0"
          />
        </>
      )}
    </div>
  );
}


/** Retorna true se a 1ª URL do texto puder ser embedada inline. */
export function hasEmbeddableLink(text?: string | null): boolean {
  const url = extractFirstUrl(text || '');
  if (!url) return false;
  return detect(url) !== null;
}

/** Exposto para o caso de querer abrir externamente como fallback. */
export function InlineMediaExternalLink({ text }: { text: string }) {
  const url = extractFirstUrl(text);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow"
       className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
      <ExternalLink className="h-3 w-3" /> Abrir original
    </a>
  );
}

