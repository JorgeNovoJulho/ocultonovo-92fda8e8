/**
 * Extrai um frame de um vídeo (data URL JPEG) para usar como capa.
 * Cacheado em memória por URL para não reprocessar.
 * Tolera falhas de CORS — devolve null nesse caso.
 */
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function extractVideoFrame(
  url: string,
  opts: { seekTo?: number; maxWidth?: number; quality?: number } = {},
): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  if (inflight.has(url)) return inflight.get(url)!;

  const { seekTo = 0.5, maxWidth = 640, quality = 0.72 } = opts;

  const p = new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      cache.set(url, result);
      inflight.delete(url);
      try {
        video.pause();
        video.src = '';
        video.removeAttribute('src');
        video.load();
        video.remove();
      } catch {}
      resolve(result);
    };

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    (video as any).playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';

    const timeout = setTimeout(() => finish(null), 8000);

    const onSeeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return finish(null);
        const scale = Math.min(1, maxWidth / w);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', quality);
        clearTimeout(timeout);
        finish(data);
      } catch {
        clearTimeout(timeout);
        finish(null);
      }
    };

    video.addEventListener('loadedmetadata', () => {
      try {
        const t = Math.min(seekTo, Math.max(0, (video.duration || 1) - 0.05));
        video.currentTime = isFinite(t) && t > 0 ? t : 0;
      } catch {
        finish(null);
      }
    });
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', () => { clearTimeout(timeout); finish(null); });

    video.src = url;
    try { document.body.appendChild(video); } catch {}
  });

  inflight.set(url, p);
  return p;
}
