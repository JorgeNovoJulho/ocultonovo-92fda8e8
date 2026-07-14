/**
 * extractVideoFramesCandidates — extrai N frames distribuídos ao longo do vídeo
 * para o usuário escolher como capa. Roda 100% no cliente, leve para celulares
 * fracos (Realme C55): cria UM elemento <video> oculto, seeks sequenciais, e
 * pinta cada quadro em <canvas>.
 *
 * Devolve uma lista de objetos `{ time, dataUrl }`. Tolerante a CORS — se
 * falhar (toDataURL bloqueado), retorna lista vazia.
 */
export interface FrameCandidate {
  time: number;
  dataUrl: string;
}

export async function extractVideoFramesCandidates(
  url: string,
  opts: {
    /** Quantos frames extrair (distribuição linear). Default 6. */
    count?: number;
    /** Largura máxima do thumbnail. Default 480 (leve em mobile). */
    maxWidth?: number;
    /** Qualidade JPEG (0..1). Default 0.7. */
    quality?: number;
    /** Timeout total em ms. Default 15s. */
    timeoutMs?: number;
  } = {},
): Promise<FrameCandidate[]> {
  if (!url) return [];
  const { count = 6, maxWidth = 480, quality = 0.7, timeoutMs = 15000 } = opts;

  return new Promise<FrameCandidate[]>((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    (video as any).playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';

    const results: FrameCandidate[] = [];
    let cancelled = false;
    let idx = 0;
    let times: number[] = [];

    const cleanup = () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
      } catch { /* noop */ }
    };

    const timeout = window.setTimeout(() => {
      cancelled = true;
      cleanup();
      resolve(results);
    }, timeoutMs);

    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      window.clearTimeout(timeout);
      cleanup();
      resolve(results);
    };

    const captureCurrent = (t: number) => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return;
        const scale = Math.min(1, maxWidth / w);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl && dataUrl.length > 64) {
          results.push({ time: t, dataUrl });
        }
      } catch { /* CORS ou raster bloqueado */ }
    };

    const seekNext = () => {
      if (cancelled) return;
      if (idx >= times.length) return finish();
      const t = times[idx++];
      try { video.currentTime = t; } catch { finish(); }
    };

    video.addEventListener('loadedmetadata', () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      // Distribui N pontos evitando os extremos (que muitas vezes são pretos).
      const safeCount = Math.max(2, Math.min(12, count));
      const margin = Math.min(0.5, dur * 0.05);
      const usable = Math.max(0.01, dur - margin * 2);
      times = Array.from({ length: safeCount }, (_, i) => {
        const frac = safeCount === 1 ? 0.5 : i / (safeCount - 1);
        return margin + frac * usable;
      });
      seekNext();
    });


    video.addEventListener('seeked', () => {
      const t = times[Math.max(0, idx - 1)] ?? video.currentTime;
      captureCurrent(t);
      // Pequeno yield para não travar UI em devices fracos.
      setTimeout(seekNext, 16);
    });

    video.addEventListener('error', () => finish());

    video.src = url;
    try { document.body.appendChild(video); } catch { /* noop */ }
  });
}

/**
 * Captura UM frame do vídeo num tempo específico (segundos). Usado pela
 * scrub-bar de seleção manual de capa.
 */
export async function captureVideoFrameAt(
  url: string,
  time: number,
  opts: { maxWidth?: number; quality?: number; timeoutMs?: number } = {},
): Promise<FrameCandidate | null> {
  if (!url) return null;
  const { maxWidth = 480, quality = 0.7, timeoutMs = 8000 } = opts;
  return new Promise<FrameCandidate | null>((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    (video as any).playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px';
    let done = false;
    const finish = (val: FrameCandidate | null) => {
      if (done) return; done = true;
      try { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); } catch { /* noop */ }
      resolve(val);
    };
    const to = window.setTimeout(() => finish(null), timeoutMs);
    video.addEventListener('loadedmetadata', () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const t = Math.max(0, Math.min(dur - 0.05, time));
      try { video.currentTime = t; } catch { window.clearTimeout(to); finish(null); }
    });
    video.addEventListener('seeked', () => {
      try {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) { window.clearTimeout(to); return finish(null); }
        const scale = Math.min(1, maxWidth / w);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { window.clearTimeout(to); return finish(null); }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        window.clearTimeout(to);
        finish(dataUrl && dataUrl.length > 64 ? { time: video.currentTime, dataUrl } : null);
      } catch { window.clearTimeout(to); finish(null); }
    });
    video.addEventListener('error', () => { window.clearTimeout(to); finish(null); });
    video.src = url;
    try { document.body.appendChild(video); } catch { /* noop */ }
  });
}

/**
 * Converte data URL JPEG/PNG em File (para upload via supabase.storage).
 */
export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [head, b64] = dataUrl.split(',');
    if (!head || !b64) return null;
    const mimeMatch = /data:([^;]+);base64/.exec(head);
    const mime = mimeMatch?.[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}

