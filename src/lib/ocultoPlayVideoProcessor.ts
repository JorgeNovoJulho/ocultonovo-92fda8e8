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

type RecordProfile = { maxDim: number; fps: number; bppFactor: number; minBps: number; maxBps: number; audioBps: number };

/** Relatório de qualidade da gravação (para log/diagnóstico). */
export interface OcultoPlayRecordReport {
  width: number;
  height: number;
  fps: number;
  framesDrawn: number;
  droppedSlots: number;
  restarts: number;
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Perfis do mais pesado ao mais leve. Se o aparelho de quem envia não
 * conseguir acompanhar em tempo real (quadros perdidos), a gravação é
 * reiniciada automaticamente no perfil seguinte — melhor um vídeo 540p/24fps
 * liso do que um 720p picotado.
 */
function buildProfiles(sourceLongEdge: number, preset: OcultoPlayQualityPreset): RecordProfile[] {
  let base: RecordProfile;
  if (sourceLongEdge <= 480) {
    base = { maxDim: Math.min(480, sourceLongEdge), fps: 24, bppFactor: 1.10, minBps: 600_000, maxBps: 1_000_000, audioBps: 80_000 };
  } else if (sourceLongEdge <= 720) {
    base = { maxDim: 720, fps: 30, bppFactor: 1.25, minBps: 900_000, maxBps: 1_700_000, audioBps: 96_000 };
  } else {
    base = { maxDim: 720, fps: 30, bppFactor: 1.40, minBps: 1_100_000, maxBps: 2_000_000, audioBps: 96_000 };
  }
  if (preset === 'smaller') {
    base = { ...base, maxDim: Math.min(base.maxDim, 540), fps: Math.min(base.fps, 24), bppFactor: base.bppFactor * 0.7, minBps: Math.round(base.minBps * 0.75), maxBps: Math.round(base.maxBps * 0.7), audioBps: Math.max(56_000, Math.round(base.audioBps * 0.85)) };
  } else if (preset === 'best') {
    base = { ...base, maxDim: Math.min(1080, Math.max(base.maxDim, sourceLongEdge)), fps: Math.max(base.fps, 30), bppFactor: base.bppFactor * 1.45, minBps: Math.round(base.minBps * 1.3), maxBps: Math.round(base.maxBps * 1.6), audioBps: Math.max(base.audioBps, 128_000) };
  }
  const lighter: RecordProfile[] = [
    { maxDim: 540, fps: 24, bppFactor: 1.0, minBps: 700_000, maxBps: 1_200_000, audioBps: 80_000 },
    { maxDim: 480, fps: 20, bppFactor: 0.9, minBps: 500_000, maxBps: 900_000, audioBps: 64_000 },
  ];
  const list = [base];
  for (const p of lighter) {
    if (p.maxDim < list[list.length - 1].maxDim || p.fps < list[list.length - 1].fps) list.push(p);
  }
  return list;
}

export async function processOcultoPlayVideoForUpload(
  file: File,
  options: ProcessOcultoPlayVideoOptions & { onReport?: (r: OcultoPlayRecordReport) => void },
): Promise<File> {
  const format = pickRecorderFormat();
  if (!format) throw new Error('Seu navegador não suporta o processamento de vídeo necessário para publicar no Oculto Play.');

  const outroSeconds = options.outroSeconds ?? 2;
  const srcUrl = URL.createObjectURL(file);
  const video = document.createElement('video') as FrameCallbackVideo;
  video.preload = 'auto';
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.muted = false;
  video.volume = 1;
  video.src = srcUrl;

  let audioCtx: AudioContext | null = null;
  let audioTrack: MediaStreamTrack | null = null;
  const cleanups: Array<() => void> = [];

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
    const profiles = buildProfiles(sourceLongEdge, options.qualityPreset ?? 'balanced');

    // Áudio: o elemento só pode ser ligado ao AudioContext UMA vez; a mesma
    // faixa é reaproveitada em cada tentativa.
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        audioTrack = dest.stream.getAudioTracks()[0] ?? null;
      }
    } catch {
      // Sem captura de áudio: publica só o vídeo com corte/outro.
    }

    let outro: HTMLImageElement | null = null;
    if (outroSeconds > 0 && options.outroImageUrl) {
      try {
        options.onProgress?.(5);
        outro = await loadImage(options.outroImageUrl);
      } catch (err) {
        console.warn('[ocultoPlayVideoProcessor] outro skipped:', (err as Error)?.message);
      }
    }

    const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function';

    const recordOnce = async (profile: RecordProfile, canRestart: boolean) => {
      const scale = Math.min(1, Math.min(profile.maxDim, options.maxDimension ?? profile.maxDim) / sourceLongEdge);
      const width = even(originalW * scale);
      const height = even(originalH * scale);
      const fps = Math.max(12, Math.min(profile.fps, options.fps ?? profile.fps));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas indisponível para processar vídeo.');

      // Com requestFrame, o gravador só recebe os quadros que desenhamos —
      // nada de quadro repetido/atrasado por cronômetro.
      const probeStream = canvas.captureStream(0);
      const probeTrack = probeStream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
      const manualFrames = hasFrameCallback && typeof probeTrack?.requestFrame === 'function';
      let stream: MediaStream = probeStream;
      if (!manualFrames) {
        probeStream.getTracks().forEach((t) => t.stop());
        stream = canvas.captureStream(fps);
      }
      const canvasTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
      if (audioTrack) stream.addTrack(audioTrack);

      const videoBitsPerSecond = Math.max(profile.minBps, Math.min(profile.maxBps, Math.round(width * height * profile.bppFactor)));
      const recorder = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond, audioBitsPerSecond: profile.audioBps });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
      const recorderDone = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      const frameStep = 1 / fps;
      let lastDrawnMedia = -1;
      let framesDrawn = 0;
      let droppedSlots = 0;
      let finished = false;
      let aborted = false;
      let frameCbId: number | null = null;
      let pumpTimer: number | null = null;

      const draw = () => {
        try { ctx.drawImage(video, 0, 0, width, height); } catch { /* noop */ }
        try { canvasTrack?.requestFrame?.(); } catch { /* noop */ }
        framesDrawn += 1;
      };

      const pauseRec = () => { if (recorder.state === 'recording') { try { recorder.pause(); } catch { /* noop */ } } };
      const resumeRec = () => { if (recorder.state === 'paused' && !finished) { try { recorder.resume(); } catch { /* noop */ } } };

      // Engasgo do decodificador ou aba em segundo plano: PAUSA a gravação
      // (áudio e vídeo juntos) em vez de gravar som com imagem parada.
      const onWaiting = () => pauseRec();
      const onPlaying = () => resumeRec();
      const onVisibility = () => {
        if (document.hidden) {
          pauseRec();
          try { video.pause(); } catch { /* noop */ }
        } else if (!finished) {
          try { if (audioCtx?.state === 'suspended') void audioCtx.resume(); } catch { /* noop */ }
          video.play().catch(() => { /* noop */ });
        }
      };
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('seeking', onWaiting);
      video.addEventListener('playing', onPlaying);
      document.addEventListener('visibilitychange', onVisibility);
      const detach = () => {
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('seeking', onWaiting);
        video.removeEventListener('playing', onPlaying);
        document.removeEventListener('visibilitychange', onVisibility);
        if (frameCbId != null) { try { video.cancelVideoFrameCallback?.(frameCbId); } catch { /* noop */ } frameCbId = null; }
        if (pumpTimer != null) { window.clearTimeout(pumpTimer); pumpTimer = null; }
      };

      await new Promise<void>((resolve) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = trimStart;
      });

      const progressBase = 8;
      const progressSpan = 72;
      const done = new Promise<void>((resolve) => {
        const finish = () => {
          if (finished) return;
          finished = true;
          try { video.pause(); } catch { /* noop */ }
          resolve();
        };
        const onFrame = (_now: number, meta: { mediaTime: number }) => {
          frameCbId = null;
          if (finished) return;
          const t = Number(meta?.mediaTime ?? video.currentTime);
          if (t >= trimEnd - 0.02) { finish(); return; }
          if (recorder.state === 'recording' && t + 0.002 >= lastDrawnMedia + frameStep) {
            if (lastDrawnMedia >= 0) {
              const missed = Math.floor((t - lastDrawnMedia) / frameStep + 0.25) - 1;
              if (missed > 0) droppedSlots += missed;
            }
            lastDrawnMedia = t;
            draw();
            options.onProgress?.(Math.max(progressBase, Math.min(80, Math.round(((t - trimStart) / clipSeconds) * progressSpan + progressBase))));
            // Aparelho não acompanha o tempo real → reinicia num perfil mais leve.
            const elapsed = t - trimStart;
            if (canRestart && elapsed > 1.5 && droppedSlots / Math.max(1, framesDrawn + droppedSlots) > 0.1) {
              aborted = true;
              finish();
              return;
            }
          }
          try { frameCbId = video.requestVideoFrameCallback!(onFrame); } catch { finish(); }
        };
        const pump = () => {
          pumpTimer = null;
          if (finished) return;
          if (video.currentTime >= trimEnd - 0.035 || video.ended) { finish(); return; }
          if (recorder.state === 'recording' && !video.paused) draw();
          options.onProgress?.(Math.max(progressBase, Math.min(80, Math.round(((video.currentTime - trimStart) / clipSeconds) * progressSpan + progressBase))));
          pumpTimer = window.setTimeout(pump, Math.max(33, Math.round(1000 / fps)));
        };
        video.addEventListener('ended', finish, { once: true });
        if (manualFrames) {
          frameCbId = video.requestVideoFrameCallback!(onFrame);
        } else {
          pump();
        }
      });

      try { if (audioCtx?.state === 'suspended') await audioCtx.resume(); } catch { /* noop */ }
      draw();
      recorder.start(500);
      // Até o vídeo realmente tocar, o gravador fica pausado (sem buraco inicial).
      pauseRec();
      await video.play();
      if (!video.paused && video.readyState >= 3) resumeRec();
      await done;
      detach();

      if (!aborted && outro) {
        drawContainImage(ctx, outro, width, height);
        try { canvasTrack?.requestFrame?.(); } catch { /* noop */ }
        resumeRec();
        const outroStart = performance.now();
        await new Promise<void>((resolve) => {
          const tick = () => {
            const elapsed = (performance.now() - outroStart) / 1000;
            drawContainImage(ctx, outro!, width, height);
            try { canvasTrack?.requestFrame?.(); } catch { /* noop */ }
            options.onProgress?.(80 + Math.min(15, Math.round((elapsed / outroSeconds) * 15)));
            if (elapsed >= outroSeconds) { resolve(); return; }
            window.setTimeout(tick, 100);
          };
          tick();
        });
      }

      if (recorder.state !== 'inactive') recorder.stop();
      await recorderDone;
      stream.getVideoTracks().forEach((t) => t.stop());
      return { chunks, aborted, report: { width, height, fps, framesDrawn, droppedSlots, restarts: 0 } };
    };

    let result: Awaited<ReturnType<typeof recordOnce>> | null = null;
    for (let i = 0; i < profiles.length; i += 1) {
      const canRestart = i < profiles.length - 1;
      result = await recordOnce(profiles[i], canRestart);
      result.report.restarts = i;
      if (!result.aborted) break;
      console.warn(`[ocultoPlayVideoProcessor] aparelho não acompanhou ${profiles[i].maxDim}p/${profiles[i].fps}fps — refazendo mais leve`);
    }
    if (!result) throw new Error('Falha ao gerar vídeo processado.');
    try { options.onReport?.(result.report); } catch { /* noop */ }
    options.onProgress?.(98);

    const blob = new Blob(result.chunks, { type: format.mimeType });
    if (!blob.size) throw new Error('Falha ao gerar vídeo processado.');
    const base = file.name.replace(/\.[^.]+$/, '') || 'oculto-play-video';
    options.onProgress?.(100);
    return new File([blob], `${base}_oculto.${format.extension}`, { type: blob.type || format.mimeType });
  } finally {
    cleanups.forEach((fn) => { try { fn(); } catch { /* noop */ } });
    try { video.pause(); } catch { /* noop */ }
    try { audioTrack?.stop(); } catch { /* noop */ }
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