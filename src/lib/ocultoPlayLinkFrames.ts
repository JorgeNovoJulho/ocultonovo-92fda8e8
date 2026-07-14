/**
 * ocultoPlayLinkFrames — extrai até N frames de um vídeo direto (.mp4/.webm/...)
 * Funciona apenas para URLs que permitem CORS (typicamente arquivos do próprio
 * Storage ou hosts que devolvem Access-Control-Allow-Origin). YouTube/TikTok/Vimeo
 * NÃO permitem leitura via <canvas> — para essas plataformas usamos a thumbnail
 * oficial em vez de frames.
 */
export interface ExtractedFrame {
  blob: Blob;
  url: string; // objectURL — lembre-se de revogar quando descartar
  timeSec: number;
}

export async function extractFramesFromDirectVideo(
  srcUrl: string,
  maxFrames = 10,
): Promise<ExtractedFrame[]> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
  video.src = srcUrl;

  await new Promise<void>((resolve, reject) => {
    const onMeta = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('Falha ao carregar o vídeo para extração de frames.')); };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
  });

  const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  if (!dur) return [];

  const count = Math.max(1, Math.min(maxFrames, 10));
  const stamps: number[] = [];
  for (let i = 0; i < count; i++) {
    // distribui os frames evitando o primeiro e o último 5% (são geralmente preto/branding)
    stamps.push(Math.max(0.1, dur * (0.05 + (0.9 * (i / Math.max(1, count - 1))))));
  }

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 360;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const frames: ExtractedFrame[] = [];
  for (const t of stamps) {
    try {
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82),
      );
      if (blob) {
        frames.push({ blob, url: URL.createObjectURL(blob), timeSec: t });
      }
    } catch { /* segue para o próximo frame */ }
  }
  return frames;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('seek error')); };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    try { video.currentTime = Math.max(0, time); } catch { onErr(); }
  });
}
