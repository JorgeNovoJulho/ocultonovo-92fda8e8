/**
 * Processamento client-side do Oculto Play.
 *
 * Publica o arquivo já com o corte aplicado e adiciona o card final OCULTO
 * por 2s. Também reencoda para dimensões/bitrate menores, reduzindo
 * travamentos no feed vertical em celulares com pouca RAM.
 */

export type OcultoPlayQualityPreset = 'smaller' | 'balanced' | 'best';

export interface ProcessOcultoPlayVideoOptions {
  trimStart: number;
  trimEnd: number;
  duration: number;
  outroImageUrl: string;
  outroSeconds?: number;
  maxDimension?: number;
  fps?: number;
  /** Preset de qualidade x tamanho escolhido pelo usuário. Padrão: balanced. */
  qualityPreset?: OcultoPlayQualityPreset;
  onProgress?: (pct: number) => void;
}

export const OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS = 300;

interface RecorderFormat {
  mimeType: string;
  extension: string;
}

const SAFARI_RECORDER_FORMATS: RecorderFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

const CHROMIUM_RECORDER_FORMATS: RecorderFormat[] = [
  // Chrome/Edge recentes anunciam MP4 no MediaRecorder, mas o muxer ainda pode
  // gerar timestamps de áudio/vídeo não monotônicos em gravações longas/canvas.
  // WebM/VP8 sai mais consistente e evita vídeos com áudio seguindo e imagem travada.
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
];

function pickRecorderFormat(): RecorderFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const ua = navigator.userAgent || '';
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/i.test(ua);
  const formats = isSafari ? SAFARI_RECORDER_FORMATS : CHROMIUM_RECORDER_FORMATS;
  return formats.find((f) => MediaRecorder.isTypeSupported(f.mimeType)) ?? null;
}

function even(n: number) {
  const r = Math.max(2, Math.round(n));
  return r % 2 === 0 ? r : r - 1;
}

function waitForEvent<T extends EventTarget>(target: T, event: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`timeout_${event}`));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, onOk as EventListener);
      target.removeEventListener('error', onError as EventListener);
    };
    const onOk = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`error_${event}`)); };
    target.addEventListener(event, onOk as EventListener, { once: true });
    target.addEventListener('error', onError as EventListener, { once: true });
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function loadImageWithRetry(
  src: string,
  opts: { retries?: number; baseDelayMs?: number; maxDelayMs?: number; onAttempt?: (attempt: number, err?: Error) => void } = {},
): Promise<HTMLImageElement> {
  const retries = opts.retries ?? 3;          // 3 tentativas por estratégia
  const baseDelay = opts.baseDelayMs ?? 400;  // 400ms inicial
  const maxDelay = opts.maxDelayMs ?? 4000;   // teto 4s

  // Estratégias de carregamento (resilientes a cache CORS):
  // 1) fetch() + Blob URL (evita taint do canvas e cache poisoning)
  // 2) <img crossOrigin="anonymous"> com cache-bust
  // 3) <img> sem crossOrigin (último recurso)
  const tryBlob = async (): Promise<HTMLImageElement> => {
    const res = await fetch(src, { mode: 'cors', cache: 'reload' });
    if (!res.ok) throw new Error(`outro_fetch_${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('outro_blob_decode_failed'));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  };
  const tryTag = (useCors: boolean): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(useCors ? 'outro_image_cors_failed' : 'outro_image_load_failed'));
      img.src = `${src}${src.includes('?') ? '&' : '?'}_=${Date.now()}`;
    });

  const strategies: Array<{ name: string; run: () => Promise<HTMLImageElement> }> = [
    { name: 'blob', run: tryBlob },
    { name: 'img-cors', run: () => tryTag(true) },
    { name: 'img-plain', run: () => tryTag(false) },
  ];

  let lastErr: Error | null = null;
  let attemptNo = 0;
  for (const strat of strategies) {
    for (let i = 0; i < retries; i++) {
      attemptNo += 1;
      try {
        return await strat.run();
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        opts.onAttempt?.(attemptNo, lastErr);
        console.warn(
          `[ocultoPlayVideoProcessor] loadImage ${strat.name} tentativa ${i + 1}/${retries} falhou: ${lastErr.message}`,
        );
        if (i < retries - 1) {
          // Backoff exponencial com jitter (full jitter)
          const expDelay = Math.min(maxDelay, baseDelay * 2 ** i);
          const jittered = Math.floor(Math.random() * expDelay);
          await sleep(jittered);
        }
      }
    }
  }
  throw lastErr ?? new Error('outro_image_load_failed');
}

// Mantém o nome curto usado no restante do arquivo.
const loadImage = (src: string) => loadImageWithRetry(src);


function drawContainImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const ratio = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * ratio;
  const dh = img.naturalHeight * ratio;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export async function processOcultoPlayVideoForUpload(
  file: File,
  options: ProcessOcultoPlayVideoOptions,
): Promise<File> {
  const format = pickRecorderFormat();
  if (!format) throw new Error('Seu navegador não suporta o processamento de vídeo necessário para publicar no Oculto Play.');

  const outroSeconds = options.outroSeconds ?? 2;
  // fps real é decidido adaptivamente abaixo (profile + options.fps).
  const srcUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.muted = false;
  video.volume = 1;
  video.src = srcUrl;

  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  let raf = 0;
  let stream: MediaStream | null = null;

  try {
    options.onProgress?.(2);
    await waitForEvent(video, 'loadedmetadata');
    const sourceDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : options.duration;
    const trimStart = Math.max(0, Math.min(options.trimStart || 0, Math.max(0, sourceDuration - 0.1)));
    const requestedEnd = options.trimEnd && options.trimEnd > trimStart ? options.trimEnd : sourceDuration;
    const trimEnd = Math.max(
      trimStart + 0.2,
      Math.min(requestedEnd, sourceDuration, trimStart + OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS),
    );
    const clipSeconds = trimEnd - trimStart;
    if (!Number.isFinite(clipSeconds) || clipSeconds <= 0.2) throw new Error('Corte de vídeo inválido.');

    const originalW = video.videoWidth || 720;
    const originalH = video.videoHeight || 1280;
    const sourceLongEdge = Math.max(originalW, originalH);

    // ===== Compressão ADAPTATIVA por resolução detectada =====
    // Escolhe automaticamente maxDimension/fps/bitrate em função da resolução
    // de origem. Vídeos pequenos não são "esticados" e os grandes são
    // reduzidos só o suficiente pra rodar fluido em mobile fraco — sem perda
    // perceptível em feed vertical.
    type Profile = { maxDim: number; fps: number; bppFactor: number; minBps: number; maxBps: number; audioBps: number };
    let profile: Profile;
    if (sourceLongEdge <= 480) {
      // SD ou inferior: mantém perto da resolução original, bitrate suficiente p/ decoder mobile.
      profile = { maxDim: Math.min(480, sourceLongEdge), fps: 24, bppFactor: 1.10, minBps: 600_000, maxBps: 1_000_000, audioBps: 80_000 };
    } else if (sourceLongEdge <= 720) {
      // HD vertical (até 720p): "sweet spot" — bitrate alto o bastante p/ não engasgar no meio do vídeo.
      profile = { maxDim: 720, fps: 30, bppFactor: 1.25, minBps: 900_000, maxBps: 1_700_000, audioBps: 96_000 };
    } else if (sourceLongEdge <= 1080) {
      // Full HD: reduz pra 720p, mantém fps 30 pra preservar suavidade.
      profile = { maxDim: 720, fps: 30, bppFactor: 1.40, minBps: 1_100_000, maxBps: 2_000_000, audioBps: 96_000 };
    } else {
      // 4K / 1440p+: agressivo no downscale, bitrate enxuto mas estável.
      profile = { maxDim: 720, fps: 30, bppFactor: 1.50, minBps: 1_200_000, maxBps: 2_200_000, audioBps: 96_000 };
    }
    // Aplica preset escolhido pelo usuário (Tamanho menor / Equilibrado / Melhor qualidade).
    const preset: OcultoPlayQualityPreset = options.qualityPreset ?? 'balanced';
    if (preset === 'smaller') {
      profile = {
        ...profile,
        maxDim: Math.min(profile.maxDim, 540),
        fps: Math.min(profile.fps, 24),
        bppFactor: profile.bppFactor * 0.70,
        minBps: Math.round(profile.minBps * 0.75),
        maxBps: Math.round(profile.maxBps * 0.70),
        audioBps: Math.max(56_000, Math.round(profile.audioBps * 0.85)),
      };
    } else if (preset === 'best') {
      profile = {
        ...profile,
        // Permite até 1080p de saída quando o source é >=1080.
        maxDim: Math.min(1080, Math.max(profile.maxDim, sourceLongEdge)),
        fps: Math.max(profile.fps, 30),
        bppFactor: profile.bppFactor * 1.45,
        minBps: Math.round(profile.minBps * 1.3),
        maxBps: Math.round(profile.maxBps * 1.6),
        audioBps: Math.max(profile.audioBps, 128_000),
      };
    }
    // Permite override explícito vindo do caller (opcional).
    const maxDimension = Math.min(profile.maxDim, options.maxDimension ?? profile.maxDim);
    const scale = Math.min(1, maxDimension / sourceLongEdge);
    const width = even(originalW * scale);
    const height = even(originalH * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas indisponível para processar vídeo.');

    const requestedFps = options.fps ?? profile.fps;
    const captureFps = Math.max(12, Math.min(profile.fps, requestedFps));
    stream = canvas.captureStream(captureFps);
    const canvasTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        const source = audioCtx.createMediaElementSource(video);
        const gain = audioCtx.createGain();
        audioDest = audioCtx.createMediaStreamDestination();
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(audioDest);
        const track = audioDest.stream.getAudioTracks()[0];
        if (track) stream?.addTrack(track);
      }
    } catch {
      // Se o browser bloquear captura de áudio, ainda publica vídeo com corte/outro.
    }

    const chunks: Blob[] = [];
    const pixels = width * height;
    const videoBitsPerSecond = Math.max(
      profile.minBps,
      Math.min(profile.maxBps, Math.round(pixels * profile.bppFactor)),
    );
    if (!stream) throw new Error('Falha ao inicializar stream de vídeo.');
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond,
      audioBitsPerSecond: profile.audioBps,
    });
    recorder.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
    const recorderDone = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

    // Carrega o outro ANTES de iniciar o MediaRecorder. Antes isso acontecia
    // com o gravador aberto; qualquer retry/CORS lento inseria dezenas de
    // segundos de faixa sem frames, gerando áudio andando e imagem congelada.
    let outro: HTMLImageElement | null = null;
    if (outroSeconds > 0) {
      try {
        options.onProgress?.(5);
        outro = await loadImage(options.outroImageUrl);
      } catch (err) {
        console.warn('[ocultoPlayVideoProcessor] outro skipped:', (err as Error)?.message);
      }
    }

    const frameIntervalMs = Math.max(33, Math.round(1000 / captureFps));
    let frameTimer: number | null = null;
    let framePumpStopped = false;
    const drawVideoFrame = () => {
      try {
        ctx.drawImage(video, 0, 0, width, height);
      } catch { /* noop */ }
      try { canvasTrack?.requestFrame?.(); } catch { /* noop */ }
    };
    const pumpVideoFrames = () => {
      if (framePumpStopped) return;
      if (!video.paused && !video.ended) drawVideoFrame();
      frameTimer = window.setTimeout(pumpVideoFrames, frameIntervalMs);
    };
    const stopFramePump = () => {
      framePumpStopped = true;
      if (frameTimer != null) {
        window.clearTimeout(frameTimer);
        frameTimer = null;
      }
    };

    await new Promise<void>((resolve) => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = trimStart;
    });

    options.onProgress?.(8);
    try { if (audioCtx?.state === 'suspended') await audioCtx.resume(); } catch { /* noop */ }
    drawVideoFrame();
    // Timeslice curto (500ms) força chunks/keyframes mais frequentes →
    // playback no feed vertical recupera-se rápido de seeks e não trava no meio.
    recorder.start(500);
    await video.play();
    pumpVideoFrames();

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (video.currentTime >= trimEnd - 0.035 || video.ended) {
          try { video.pause(); } catch { /* noop */ }
          stopFramePump();
          cancelAnimationFrame(raf);
          resolve();
          return;
        }
        const pct = ((video.currentTime - trimStart) / Math.max(0.1, clipSeconds)) * 72 + 8;
        options.onProgress?.(Math.max(8, Math.min(80, Math.round(pct))));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    // Outro é opcional — se a imagem falhou no preload acima, seguimos sem
    // quebrar a publicação inteira nem manter o gravador aberto em espera.
    if (outro) {
      const outroStart = performance.now();
      await new Promise<void>((resolve) => {
        const drawOutro = () => {
          const elapsed = (performance.now() - outroStart) / 1000;
          drawContainImage(ctx, outro!, width, height);
          canvasTrack?.requestFrame?.();
          options.onProgress?.(80 + Math.min(15, Math.round((elapsed / outroSeconds) * 15)));
          if (elapsed >= outroSeconds) { resolve(); return; }
          frameTimer = window.setTimeout(drawOutro, frameIntervalMs);
        };
        drawOutro();
      });
    } else {
      options.onProgress?.(95);
    }

    cancelAnimationFrame(raf);
    recorder.stop();
    await recorderDone;
    options.onProgress?.(98);

    const blob = new Blob(chunks, { type: format.mimeType });
    if (!blob.size) throw new Error('Falha ao gerar vídeo processado.');
    const base = file.name.replace(/\.[^.]+$/, '') || 'oculto-play-video';
    options.onProgress?.(100);
    return new File([blob], `${base}_oculto.${format.extension}`, { type: blob.type || format.mimeType });
  } finally {
    try { video.pause(); } catch { /* noop */ }
    try { cancelAnimationFrame(raf); } catch { /* noop */ }
    try { stream?.getTracks?.().forEach((track) => track.stop()); } catch { /* noop */ }
    try { await audioCtx?.close(); } catch { /* noop */ }
    URL.revokeObjectURL(srcUrl);
  }
}

export interface ProcessOcultoPlayTrailerOptions {
  trimStart: number;
  trimEnd: number;
  duration: number;
  onProgress?: (pct: number) => void;
}

/**
 * Gera um arquivo físico de trailer a partir de um trecho do vídeo, sem inserir
 * a tela final/outro do Oculto Play. O recorte salvo é o que será usado nas
 * páginas públicas de compartilhamento.
 */
export async function processOcultoPlayTrailerForUpload(
  file: File,
  options: ProcessOcultoPlayTrailerOptions,
): Promise<File> {
  const start = Math.max(0, Number(options.trimStart || 0));
  const sourceDuration = Math.max(0, Number(options.duration || 0));
  const requestedEnd = Math.max(start + 0.2, Number(options.trimEnd || sourceDuration || 0));
  const end = Math.min(requestedEnd, sourceDuration || requestedEnd, start + 90);
  if (!Number.isFinite(end - start) || end - start <= 0.2) {
    throw new Error('Recorte de trailer inválido.');
  }

  const processed = await processOcultoPlayVideoForUpload(file, {
    trimStart: start,
    trimEnd: end,
    duration: sourceDuration || end,
    outroImageUrl: '',
    outroSeconds: 0,
    maxDimension: 720,
    fps: 30,
    qualityPreset: 'balanced',
    onProgress: options.onProgress,
  });
  const base = file.name.replace(/\.[^.]+$/, '') || 'oculto-play-trailer';
  const ext = processed.name.split('.').pop() || 'webm';
  return new File([processed], `${base}_trailer.${ext}`, { type: processed.type || 'video/webm' });
}