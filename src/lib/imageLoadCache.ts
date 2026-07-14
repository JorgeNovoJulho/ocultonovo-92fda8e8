/**
 * Cache leve de mídia do feed — memória + sessionStorage.
 * Normaliza URLs assinadas antes de marcar como carregadas para evitar flicker
 * quando o mesmo arquivo volta com token/querystring diferente.
 */
const MEM = new Set<string>();
const VIDEO_MEM = new Set<string>();
const PREFETCHING = new Set<string>();
const KEY = 'oculto:img-loaded:v2';
const VIDEO_KEY = 'oculto:video-meta-loaded:v1';
const MAX_ITEMS = 600;

export function normalizeMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url, window.location.origin);
    u.hash = '';
    const volatile = [
      'token', 'expires', 'expires_at', 'signature', 'download', 'cacheBust', 'cb', 't',
      'X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires',
      'X-Amz-SignedHeaders', 'X-Amz-Signature',
    ];
    volatile.forEach((k) => u.searchParams.delete(k));
    const sorted = new URLSearchParams();
    [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => sorted.append(k, v));
    u.search = sorted.toString();
    return u.toString();
  } catch {
    return String(url).split('#')[0].replace(/[?&](token|expires|expires_at|signature|download|cacheBust|cb|t)=[^&]+/gi, '');
  }
}

function loadFromSession(kind: 'image' | 'video' = 'image'): Set<string> {
  const target = kind === 'video' ? VIDEO_MEM : MEM;
  const key = kind === 'video' ? VIDEO_KEY : KEY;
  if (typeof window === 'undefined') return MEM;
  if (target.size > 0) return target;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      arr.forEach((u) => target.add(u));
    }
  } catch {
    /* noop */
  }
  return target;
}

function persist(kind: 'image' | 'video' = 'image') {
  if (typeof window === 'undefined') return;
  try {
    const set = kind === 'video' ? VIDEO_MEM : MEM;
    const key = kind === 'video' ? VIDEO_KEY : KEY;
    const arr = Array.from(set).slice(-MAX_ITEMS);
    window.sessionStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* noop */
  }
}

export function isImageCached(url: string | null | undefined): boolean {
  if (!url) return false;
  loadFromSession('image');
  return MEM.has(normalizeMediaUrl(url));
}

export function markImageCached(url: string | null | undefined) {
  if (!url) return;
  loadFromSession('image');
  const key = normalizeMediaUrl(url);
  if (MEM.has(key)) return;
  MEM.add(key);
  persist('image');
}

export function isVideoMetadataCached(url: string | null | undefined): boolean {
  if (!url) return false;
  loadFromSession('video');
  return VIDEO_MEM.has(normalizeMediaUrl(url));
}

export function markVideoMetadataCached(url: string | null | undefined) {
  if (!url) return;
  loadFromSession('video');
  const key = normalizeMediaUrl(url);
  if (VIDEO_MEM.has(key)) return;
  VIDEO_MEM.add(key);
  persist('video');
}

export function prefetchFeedMedia(url: string | null | undefined, kind: 'image' | 'video' = 'image') {
  if (!url || typeof window === 'undefined') return;
  const key = `${kind}:${normalizeMediaUrl(url)}`;
  if (PREFETCHING.has(key)) return;
  if (kind === 'image' && isImageCached(url)) return;
  if (kind === 'video' && isVideoMetadataCached(url)) return;
  PREFETCHING.add(key);
  const run = () => {
    if (kind === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => { markVideoMetadataCached(url); PREFETCHING.delete(key); video.removeAttribute('src'); video.load(); };
      video.onerror = () => PREFETCHING.delete(key);
      video.src = url;
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    img.onload = () => { markImageCached(url); PREFETCHING.delete(key); };
    img.onerror = () => PREFETCHING.delete(key);
    img.src = url;
  };
  const idle = (window as any).requestIdleCallback || ((cb: any) => window.setTimeout(cb, 500));
  idle(run, { timeout: 2000 });
}
