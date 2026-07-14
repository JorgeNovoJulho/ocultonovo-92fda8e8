/**
 * Video chunker — fatia um vídeo do cliente em "capítulos" sequenciais
 * (default 15s), até um limite total (default 90s = 1:30).
 *
 * Usa <video> + canvas.captureStream() + MediaRecorder. Sem deps externas.
 * O processo roda em tempo (real-time playback) — para 90s leva ~90s.
 *
 * NÃO chame em loop de UI: dispara onProgress para atualizar a barra global.
 * Falhas silenciosas retornam array vazio — o caller deve cair p/ fallback.
 */

export interface ChunkResult {
  file: File;
  index: number;     // 1-based
  totalChunks: number;
  startSec: number;
  endSec: number;
}

export interface ChunkOptions {
  chunkSeconds?: number;   // default 15
  maxTotalSeconds?: number; // default 90
  /** 0..100 progresso global, inclui todos os chunks */
  onProgress?: (percent: number) => void;
  /** chamada assim que cada chunk fica pronto (envio paralelo opcional) */
  onChunk?: (chunk: ChunkResult) => void;
}

const isSupported = () =>
  typeof MediaRecorder !== 'undefined' &&
  (MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ||
    MediaRecorder.isTypeSupported('video/webm'));

export async function sliceVideoIntoChapters(
  file: File,
  options: ChunkOptions = {},
): Promise<ChunkResult[]> {
  const { chunkSeconds = 15, maxTotalSeconds = 90, onProgress, onChunk } = options;

  if (!isSupported()) {
    console.warn('[videoChunker] MediaRecorder não suportado');
    return [];
  }

  const videoEl = document.createElement('video');
  // IMPORTANTE: manter volume normal para a faixa gravada.
  // O elemento não toca nos alto-falantes porque o áudio é roteado só para a stream gravada.
  videoEl.muted = false;
  videoEl.volume = 1;
  videoEl.playsInline = true;
  videoEl.preload = 'auto';
  videoEl.crossOrigin = 'anonymous';
  const url = URL.createObjectURL(file);
  videoEl.src = url;

  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error('Falha ao ler vídeo'));
      setTimeout(() => reject(new Error('Timeout metadata')), 15_000);
    });

    const duration = Math.min(videoEl.duration, maxTotalSeconds);
    if (!isFinite(duration) || duration <= 0) {
      throw new Error('Duração inválida');
    }

    const totalChunks = Math.max(1, Math.ceil(duration / chunkSeconds));
    const origW = videoEl.videoWidth;
    const origH = videoEl.videoHeight;

    // Limita a 720p para preservar memória em mobile <4GB
    const maxDim = 720;
    let w = origW, h = origH;
    if (origW > maxDim || origH > maxDim) {
      const s = Math.min(maxDim / origW, maxDim / origH);
      w = Math.round(origW * s); h = Math.round(origH * s);
      w = w % 2 === 0 ? w : w - 1;
      h = h % 2 === 0 ? h : h - 1;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível');

    const videoStream = canvas.captureStream(24);

    // ── Captura de áudio (silenciado para o usuário, mas presente na faixa) ──
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        const source = audioCtx.createMediaElementSource(videoEl);
        audioDest = audioCtx.createMediaStreamDestination();
        const gain = audioCtx.createGain();
        gain.gain.value = 1; // áudio vai inteiro para a stream gravada
        source.connect(gain);
        gain.connect(audioDest);
        // NÃO conectar ao audioCtx.destination — usuário não ouve.
        const audioTrack = audioDest.stream.getAudioTracks()[0];
        if (audioTrack) videoStream.addTrack(audioTrack);
      } else {
        console.warn('[videoChunker] AudioContext indisponível — chunks sem áudio');
      }
    } catch (e) {
      console.warn('[videoChunker] Falha ao capturar áudio:', e);
    }

    // Preferir codecs com áudio (opus). Cai para webm puro se necessário.
    const candidateMimes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mime = candidateMimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    const results: ChunkResult[] = [];
    const baseName = file.name.replace(/\.[^.]+$/, '');

    let raf = 0;
    const startDraw = () => {
      const draw = () => {
        if (videoEl.paused || videoEl.ended) return;
        ctx.drawImage(videoEl, 0, 0, w, h);
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    };


    onProgress?.(2);

    for (let i = 0; i < totalChunks; i++) {
      const startSec = i * chunkSeconds;
      const endSec = Math.min((i + 1) * chunkSeconds, duration);

      // Seek to start
      await new Promise<void>((resolve) => {
        const onSeek = () => { videoEl.removeEventListener('seeked', onSeek); resolve(); };
        videoEl.addEventListener('seeked', onSeek);
        videoEl.currentTime = startSec;
      });

      const recorder = new MediaRecorder(videoStream, { mimeType: mime, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 96_000 });
      const blobs: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) blobs.push(e.data); };

      const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      try { if (audioCtx?.state === 'suspended') await audioCtx.resume(); } catch { /* noop */ }
      try { await videoEl.play(); } catch { /* mobile autoplay */ }
      recorder.start(250);
      startDraw();

      // Para no endSec
      await new Promise<void>((resolve) => {
        const tick = () => {
          if (videoEl.currentTime >= endSec - 0.05 || videoEl.ended) {
            videoEl.pause();
            cancelAnimationFrame(raf);
            try { recorder.stop(); } catch { /* noop */ }
            resolve();
            return;
          }
          // progresso global (chunk atual + chunks anteriores)
          const chunkProg = (videoEl.currentTime - startSec) / Math.max(0.1, endSec - startSec);
          const global = ((i + Math.min(1, Math.max(0, chunkProg))) / totalChunks) * 95 + 2;
          onProgress?.(Math.min(97, Math.round(global)));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      await done;

      const blob = new Blob(blobs, { type: mime });
      const chunkFile = new File(
        [blob],
        `${baseName}_cap${String(i + 1).padStart(2, '0')}.webm`,
        { type: blob.type || mime || 'video/webm' },
      );
      const result: ChunkResult = {
        file: chunkFile,
        index: i + 1,
        totalChunks,
        startSec,
        endSec,
      };
      results.push(result);
      onChunk?.(result);
    }

    onProgress?.(100);
    return results;
  } catch (err) {
    console.warn('[videoChunker] Falhou:', err);
    return [];
  } finally {
    try { videoEl.pause(); } catch { /* noop */ }
    try { await audioCtx?.close(); } catch { /* noop */ }
    URL.revokeObjectURL(url);
  }
}

/** Lê a duração do vídeo em segundos. */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(v.src);
      resolve(isFinite(d) ? d : 0);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}
