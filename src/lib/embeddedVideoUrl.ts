/**
 * embeddedVideoUrl — normalização e parsing de URLs de vídeo embutível.
 *
 * Suporta:
 *  - YouTube (youtu.be, youtube.com/watch, /shorts/, /embed/, /v/, com timestamps)
 *  - Vimeo (vimeo.com/ID, player.vimeo.com/video/ID, channels/groups/album)
 *  - Arquivos diretos e streams (.mp4, .webm, .mov, .m3u8, .mpd, .mkv, .avi etc.)
 *  - Magnet links (magnet:?xt=urn:btih:...), abertos por app externo compatível
 *
 * O objetivo é centralizar a detecção/parsing e evitar falsos positivos —
 * por exemplo `https://example.com/page.mp4-info.html` NÃO deve ser
 * considerado vídeo direto (a regex agora exige fim de path).
 */

export type EmbeddedVideoKind = 'youtube' | 'vimeo' | 'tiktok' | 'direct' | 'embed' | 'magnet';

export interface ParsedEmbeddedVideo {
  kind: EmbeddedVideoKind;
  id: string;          // youtube/vimeo/tiktok id, ou a URL normalizada para direct
  embedSrc: string;    // src pronto para usar em iframe/<video>
  startSeconds?: number;
  originalUrl: string;
  thumbnailUrl?: string; // melhor thumbnail conhecida (quando disponível)
}


/**
 * Detecta snippets de embed completos (iframe/script/object/embed) e extrai
 * a primeira URL `src`/`data`/`data-src` encontrada. Retorna a URL crua se
 * a entrada não parecer um snippet — assim pode ser usada de forma idempotente
 * em qualquer input que aceite "URL ou código de embed".
 *
 * Aceita formatos como:
 *   <iframe src="https://..."></iframe>
 *   <script src='https://...'></script>
 *   <object data="https://..."></object>
 *   <embed src="https://...">
 */
export function extractUrlFromEmbedSnippet(input: string): string {
  if (!input) return '';
  const raw = input.trim();
  if (!raw) return '';
  // Não parece HTML? devolve como está.
  if (!/<\s*(iframe|script|object|embed)\b/i.test(raw)) return raw;
  // Tenta atributos comuns: src | data-src | data
  const attrMatch = raw.match(/\b(?:src|data-src|data)\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/i);
  const candidate = attrMatch ? (attrMatch[2] || attrMatch[3] || attrMatch[4] || '') : '';
  if (candidate) return candidate.trim();
  // Fallback: primeira URL http(s) dentro do snippet
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i);
  return urlMatch ? urlMatch[0] : raw;
}

/** Normaliza a URL: trim, remove fragmento de tracker, baixa o host. */
export function normalizeVideoUrl(raw: string): string {
  if (!raw) return '';
  let v = raw.trim();
  // remove caracteres de pontuação coladas no fim (vindo de texto)
  v = v.replace(/[)>\]"',.;]+$/, '');
  try {
    const u = new URL(v);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    // remove utm_* para canonicalizar
    [...u.searchParams.keys()].forEach((k) => {
      if (/^utm_/i.test(k) || k === 'fbclid' || k === 'gclid') u.searchParams.delete(k);
    });
    return u.toString();
  } catch {
    return v;
  }
}

/** Converte "1h2m3s", "90s", "75" em segundos. */
function parseTimestamp(t: string | null): number | undefined {
  if (!t) return undefined;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (m) {
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    const s = Number(m[3] || 0);
    const total = h * 3600 + min * 60 + s;
    return total > 0 ? total : undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function getYouTubeId(rawUrl: string): { id: string; start?: number } | null {
  try {
    const u = new URL(normalizeVideoUrl(rawUrl));
    const host = u.hostname;
    const start = parseTimestamp(u.searchParams.get('t') || u.searchParams.get('start'));
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id ? { id, start } : null;
    }
    if (/(^|\.)youtube\.com$/.test(host) || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v');
        return id ? { id, start } : null;
      }
      const m = u.pathname.match(/^\/(?:shorts|embed|v|live)\/([^/?#]+)/);
      if (m) return { id: m[1], start };
    }
  } catch { /* noop */ }
  return null;
}

export function getVimeoId(rawUrl: string): string | null {
  try {
    const u = new URL(normalizeVideoUrl(rawUrl));
    const host = u.hostname;
    if (!/(^|\.)vimeo\.com$/.test(host)) return null;
    if (host === 'player.vimeo.com') {
      const m = u.pathname.match(/^\/video\/(\d+)/);
      return m ? m[1] : null;
    }
    const m = u.pathname.match(/^\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|album\/\d+\/video\/)?(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  } catch { return null; }
}

/**
 * Detecta link direto para arquivo/stream de vídeo.
 * Extensões comuns de vídeo/stream. A extensão precisa estar no FIM do path
 * (antes de `?` ou `#`)
 * — evita falsos positivos como `/posts/something.mp4-review`.
 */
const DIRECT_VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|ts|m2ts|mpd|m3u8|flv|wmv|mpg|mpeg|3gp|3g2|mxf|asf|vob)$/i;

export function isDirectVideoUrl(rawUrl: string): boolean {
  try {
    const u = new URL(normalizeVideoUrl(rawUrl));
    return DIRECT_VIDEO_EXT_RE.test(u.pathname);
  } catch { return false; }
}

export function isMagnetVideoUrl(rawUrl: string): boolean {
  const v = extractUrlFromEmbedSnippet(rawUrl).trim();
  return /^magnet:\?xt=urn:btih:[a-f0-9]{32,40}(?:&|$)/i.test(v);
}

function getMagnetBtih(rawUrl: string): string | null {
  const v = extractUrlFromEmbedSnippet(rawUrl).trim();
  const m = v.match(/^magnet:\?xt=urn:btih:([a-f0-9]{32,40})(?:&|$)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Extrai o ID de um vídeo do TikTok (formato /@user/video/<id> ou vm.tiktok.com/<id>). */
export function getTikTokId(rawUrl: string): string | null {
  try {
    const u = new URL(normalizeVideoUrl(rawUrl));
    const host = u.hostname;
    if (!/tiktok\.com$/.test(host)) return null;
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) return m[1];
    // shortlinks vm.tiktok.com/<code> ou vt.tiktok.com/<code> — usa o code como id
    if (/^(vm|vt)\.tiktok\.com$/.test(host)) {
      const code = u.pathname.split('/').filter(Boolean)[0];
      return code || null;
    }
  } catch { /* noop */ }
  return null;
}

/** Parse unificado: devolve a melhor detecção para a URL ou null. */
export function parseEmbeddedVideo(rawUrl: string): ParsedEmbeddedVideo | null {
  if (!rawUrl) return null;
  const url = normalizeVideoUrl(extractUrlFromEmbedSnippet(rawUrl));

  const btih = getMagnetBtih(url);
  if (btih && isMagnetVideoUrl(url)) {
    return {
      kind: 'magnet',
      id: btih,
      embedSrc: url,
      originalUrl: url,
    };
  }

  const yt = getYouTubeId(url);
  if (yt) {
    const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
    if (yt.start) params.set('start', String(yt.start));
    return {
      kind: 'youtube',
      id: yt.id,
      embedSrc: `https://www.youtube-nocookie.com/embed/${yt.id}?${params.toString()}`,
      startSeconds: yt.start,
      originalUrl: url,
      thumbnailUrl: `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`,
    };
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return {
      kind: 'vimeo',
      id: vimeoId,
      embedSrc: `https://player.vimeo.com/video/${vimeoId}?dnt=1&pip=1&playsinline=1`,
      originalUrl: url,
      thumbnailUrl: `https://vumbnail.com/${vimeoId}.jpg`,
    };
  }

  const tkId = getTikTokId(url);
  if (tkId) {
    return {
      kind: 'tiktok',
      id: tkId,
      embedSrc: `https://www.tiktok.com/embed/v2/${tkId}`,
      originalUrl: url,
    };
  }

  if (isDirectVideoUrl(url)) {
    const direct = toDirectDownloadUrl(url);
    return {
      kind: 'direct',
      id: url,
      embedSrc: direct,
      originalUrl: url,
    };
  }

  // Fallback genérico: aceita qualquer URL https válida e tenta embutir via
  // iframe. Cobre provedores adicionais (Dailymotion, Streamable, Twitch,
  // Facebook, Rumble, Odysee, etc.) e ainda permite que sites com X-Frame
  // bloqueado mostrem ao menos a opção "abrir externamente".
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      const embedSrc = buildGenericEmbedSrc(u) ?? url;
      return {
        kind: 'embed',
        id: url,
        embedSrc,
        originalUrl: url,
      };
    }
  } catch { /* noop */ }

  return null;
}

/**
 * Links de compartilhamento que abrem uma PÁGINA em vez do arquivo: converte
 * para o endereço do arquivo bruto (assim o <video> consegue tocar).
 *  - Dropbox: ?dl=0 → dl.dropboxusercontent.com (arquivo direto)
 */
function toDirectDownloadUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'dropbox.com') {
      u.hostname = 'dl.dropboxusercontent.com';
      u.searchParams.delete('dl');
      u.searchParams.delete('raw');
      return u.toString();
    }
  } catch { /* noop */ }
  return raw;
}

/**
 * Constrói uma URL de embed amigável para provedores conhecidos que não têm
 * parser dedicado. Para provedores desconhecidos devolve null e o caller usa
 * a URL original — o iframe pode ainda renderizar se o site permitir.
 */
function buildGenericEmbedSrc(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;

  // Google Drive: /file/d/<id>/view → /preview (player do próprio Drive)
  if (host === 'drive.google.com') {
    const m = path.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || null;
    const id = m?.[1] || u.searchParams.get('id');
    if (id) return `https://drive.google.com/file/d/${id}/preview`;
  }

  // Dailymotion: /video/<id>
  if (/(^|\.)dailymotion\.com$/.test(host)) {
    const m = path.match(/\/video\/([A-Za-z0-9]+)/);
    if (m) return `https://www.dailymotion.com/embed/video/${m[1]}`;
  }
  if (host === 'dai.ly') {
    const id = path.split('/').filter(Boolean)[0];
    if (id) return `https://www.dailymotion.com/embed/video/${id}`;
  }

  // Streamable: /<id>
  if (host === 'streamable.com') {
    const id = path.split('/').filter(Boolean)[0];
    if (id) return `https://streamable.com/e/${id}`;
  }

  // Twitch: /videos/<id>  ou /<channel>
  if (host === 'twitch.tv' || host === 'm.twitch.tv') {
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const vm = path.match(/^\/videos\/(\d+)/);
    if (vm) return `https://player.twitch.tv/?video=${vm[1]}&parent=${parent}`;
    const channel = path.split('/').filter(Boolean)[0];
    if (channel) return `https://player.twitch.tv/?channel=${channel}&parent=${parent}`;
  }

  // Facebook Video / Watch
  if (/(^|\.)facebook\.com$/.test(host) || host === 'fb.watch') {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&show_text=0`;
  }

  // Rumble: /embed/<id> direto; páginas /v<id>-slug não têm endpoint público estável → cai no fallback
  if (/(^|\.)rumble\.com$/.test(host)) {
    if (/^\/embed\//.test(path)) return u.toString();
  }

  // Odysee: usa iframe padrão da página
  if (host === 'odysee.com') return u.toString();

  return null;
}

/** Gera múltiplas miniaturas oficiais do YouTube (default/mq/hq/maxres). */
export function getYouTubeThumbnailVariants(videoId: string): string[] {
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  ];
}

