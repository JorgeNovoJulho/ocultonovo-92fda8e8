/**
 * Helpers para detectar tipo de mídia a partir da URL/extensão e gerar
 * o atributo MIME correto para a tag <video>.
 *
 * Suporta os formatos solicitados (GIF, MOV) além dos formatos legados
 * já reconhecidos no projeto.
 */

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|3gp|mpeg|mpg|wmv|flv|qt|hevc|m3u8)(\?|#|$)/i;
const GIF_EXT_RE = /\.gif(\?|#|$)/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|svg|heic|ico)(\?|#|$)/i;

export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return VIDEO_EXT_RE.test(url);
}

export function isGifUrl(url?: string | null): boolean {
  if (!url) return false;
  return GIF_EXT_RE.test(url);
}

export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return IMAGE_EXT_RE.test(url);
}

/**
 * Returns a MIME type suitable for use in `<source type="...">`.
 * Falls back to `video/mp4` to maximize browser compatibility.
 */
export function getVideoMimeType(url?: string | null): string {
  if (!url) return "video/mp4";
  const m = url.match(VIDEO_EXT_RE);
  const ext = (m?.[1] || "mp4").toLowerCase();
  switch (ext) {
    case "webm":
      return "video/webm";
    case "mov":
    case "qt":
      return "video/quicktime";
    case "m4v":
      return "video/x-m4v";
    case "ogv":
    case "ogg":
      return "video/ogg";
    case "mkv":
      return "video/x-matroska";
    case "avi":
      return "video/x-msvideo";
    case "3gp":
      return "video/3gpp";
    case "mpeg":
    case "mpg":
      return "video/mpeg";
    case "wmv":
      return "video/x-ms-wmv";
    case "flv":
      return "video/x-flv";
    case "hevc":
      return "video/mp4; codecs=hvc1";
    case "m3u8":
      return "application/vnd.apple.mpegurl";
    default:
      return "video/mp4";
  }
}

/**
 * Retorna a extensão de vídeo (lowercase, sem ponto) detectada na URL,
 * ou `null` quando não houver match.
 */
export function getVideoExtension(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(VIDEO_EXT_RE);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Paleta de cores (gradient HSL) por extensão para gerar uma capa visual
 * agradável e identificável mesmo antes do vídeo carregar.
 */
const EXT_PALETTE: Record<string, [string, string, string]> = {
  mp4:  ["260 70% 18%", "280 70% 30%", "MP4"],
  webm: ["170 60% 18%", "190 60% 30%", "WEBM"],
  mov:  ["220 70% 18%", "240 70% 30%", "MOV"],
  qt:   ["220 70% 18%", "240 70% 30%", "MOV"],
  m4v:  ["210 70% 18%", "230 70% 30%", "M4V"],
  ogv:  ["30 70% 18%",  "50 70% 30%",  "OGG"],
  ogg:  ["30 70% 18%",  "50 70% 30%",  "OGG"],
  mkv:  ["340 60% 18%", "360 60% 30%", "MKV"],
  avi:  ["0 60% 18%",   "20 60% 30%",  "AVI"],
  "3gp":["120 50% 18%", "140 50% 30%", "3GP"],
  mpeg: ["300 60% 18%", "320 60% 30%", "MPG"],
  mpg:  ["300 60% 18%", "320 60% 30%", "MPG"],
  wmv:  ["200 60% 18%", "220 60% 30%", "WMV"],
  flv:  ["10 60% 18%",  "30 60% 30%",  "FLV"],
  hevc: ["260 70% 18%", "280 70% 30%", "HEVC"],
  m3u8: ["190 60% 18%", "210 60% 30%", "HLS"],
};

const DEFAULT_PALETTE: [string, string, string] = ["240 30% 15%", "260 40% 25%", "VIDEO"];

/**
 * Gera um thumbnail "mock" (data URI SVG) para um vídeo a partir da extensão.
 * Útil como fallback quando não há `thumbnail_url` salvo no banco — mantém
 * cards e galerias visualmente consistentes antes do vídeo carregar.
 */
// Cache em memória — evita regenerar o mesmo SVG (e re-encode) para a mesma extensão.
const MOCK_THUMB_CACHE = new Map<string, string>();
// Cache de URLs já marcadas como inválidas — evita refazer download/erro repetido.
const INVALID_THUMB_CACHE = new Set<string>();

export function isThumbnailKnownInvalid(url?: string | null): boolean {
  if (!url) return true;
  return INVALID_THUMB_CACHE.has(url);
}

export function markThumbnailInvalid(url?: string | null): void {
  if (url) INVALID_THUMB_CACHE.add(url);
}

export function getMockVideoThumbnail(url?: string | null): string {
  const ext = getVideoExtension(url) || "_default";
  const cached = MOCK_THUMB_CACHE.get(ext);
  if (cached) return cached;

  const [from, to, label] = (ext !== "_default" && EXT_PALETTE[ext]) || DEFAULT_PALETTE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${from})"/>
        <stop offset="100%" stop-color="hsl(${to})"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#g)"/>
    <g opacity="0.18" fill="#fff">
      <circle cx="400" cy="225" r="80"/>
    </g>
    <g transform="translate(400 225)" fill="#fff" opacity="0.95">
      <polygon points="-22,-30 -22,30 30,0"/>
    </g>
    <text x="40" y="410" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="#ffffff" opacity="0.75" letter-spacing="2">${label}</text>
  </svg>`;
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  MOCK_THUMB_CACHE.set(ext, dataUri);
  return dataUri;
}

/**
 * Retorna o thumbnail "ideal": o salvo no banco quando existir, senão o mock
 * gerado a partir da extensão.
 */
export function resolveVideoThumbnail(
  thumbnailUrl?: string | null,
  mediaUrl?: string | null,
): string {
  if (thumbnailUrl && !INVALID_THUMB_CACHE.has(thumbnailUrl)) return thumbnailUrl;
  return getMockVideoThumbnail(mediaUrl);
}

/**
 * Combina o `media_type` salvo no banco (quando disponível) com a heurística
 * de extensão. Útil para posts antigos onde apenas a URL existe.
 */
export function resolveMediaKind(
  mediaType?: string | null,
  mediaUrl?: string | null,
): "video" | "gif" | "image" | "unknown" {
  if (mediaType === "video" || isVideoUrl(mediaUrl)) return "video";
  if (isGifUrl(mediaUrl)) return "gif";
  if (mediaType === "image" || isImageUrl(mediaUrl)) return "image";
  return "unknown";
}
