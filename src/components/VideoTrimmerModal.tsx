import { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Loader2, Scissors, Sparkles, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VideoTrimmerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File;
  maxSizeMB: number;
  onResult: (file: File) => void;
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getReliableDuration = (video: HTMLVideoElement): Promise<number> =>
  new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Não foi possível identificar a duração do vídeo'));
    };

    const tryResolve = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) finish(duration);
    };

    const onLoadedMetadata = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
        return;
      }

      try {
        video.currentTime = 1e9;
      } catch {
        fail();
      }
    };

    const onDurationChange = () => tryResolve();
    const onSeeked = () => tryResolve();
    const onError = () => fail();

    const timeoutId = window.setTimeout(() => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) finish(duration);
      else fail();
    }, 12000);

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    if (video.readyState >= 1) onLoadedMetadata();
  });

async function transcodeSegment(
  file: File,
  startSec: number,
  endSec: number,
  targetSizeMB: number,
  onProgress: (p: number) => void
): Promise<File> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder não suportado neste navegador');
  }

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  const cleanup = async (audioCtx: AudioContext | null) => {
    try {
      video.pause();
    } catch {}
    video.removeAttribute('src');
    video.load();
    if (audioCtx && audioCtx.state !== 'closed') {
      try {
        await audioCtx.close();
      } catch {}
    }
    URL.revokeObjectURL(url);
  };

  let audioCtx: AudioContext | null = null;

  try {
    const fullDuration = await getReliableDuration(video);
    const safeStart = Math.max(0, Math.min(startSec, Math.max(0, fullDuration - 0.1)));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(endSec, fullDuration));
    const duration = safeEnd - safeStart;

    if (duration <= 0) throw new Error('Intervalo inválido');

    const maxDim = 540;
    const ow = video.videoWidth;
    const oh = video.videoHeight;
    let tw = ow;
    let th = oh;

    if (Math.max(ow, oh) > maxDim) {
      const scale = maxDim / Math.max(ow, oh);
      tw = Math.round(ow * scale);
      th = Math.round(oh * scale);
    }

    tw -= tw % 2;
    th -= th % 2;

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Falha ao preparar canvas');

    const targetBits = targetSizeMB * 8 * 1024 * 1024 * 0.85;
    const videoBitrate = Math.max(300_000, Math.min(2_000_000, Math.floor(targetBits / duration)));
    const canvasStream = canvas.captureStream(24);

    let combinedStream: MediaStream = canvasStream;
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } catch {
      audioCtx = null;
    }

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: mime,
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: 64_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    video.currentTime = safeStart;
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
    });

    recorder.start(500);
    await video.play();

    await new Promise<void>((resolve) => {
      let raf = 0;
      const tick = () => {
        if (video.currentTime >= safeEnd || video.ended) {
          video.pause();
          cancelAnimationFrame(raf);
          try {
            recorder.stop();
          } catch {}
          resolve();
          return;
        }

        ctx.drawImage(video, 0, 0, tw, th);
        const progress = ((video.currentTime - safeStart) / duration) * 100;
        onProgress(Math.min(99, Math.max(0, progress)));
        raf = requestAnimationFrame(tick);
      };
      tick();
    });

    await new Promise<void>((resolve) => {
      if (recorder.state === 'inactive') resolve();
      else recorder.onstop = () => resolve();
    });

    const blob = new Blob(chunks, { type: 'video/webm' });
    const newName = file.name.replace(/\.[^.]+$/, '') + '_optimized.webm';
    return new File([blob], newName, { type: 'video/webm' });
  } finally {
    await cleanup(audioCtx);
  }
}

export function VideoTrimmerModal({ open, onOpenChange, file, maxSizeMB, onResult }: VideoTrimmerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const durationResolvedRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const stopInlinePreview = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.pause();
    } catch {}
    try {
      video.currentTime = 0;
    } catch {}
    video.removeAttribute('src');
    video.load();
  }, []);

  useEffect(() => {
    if (!open) return;

    durationResolvedRef.current = false;
    setDuration(0);
    setStart(0);
    setEnd(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setProcessing(false);
    setProgress(0);
    setStage('');

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      stopInlinePreview();
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [open, file, stopInlinePreview]);

  const capturePoster = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    try {
      const canvas = document.createElement('canvas');
      const maxWidth = 320;
      const ratio = video.videoHeight / video.videoWidth;
      canvas.width = maxWidth;
      canvas.height = Math.round(maxWidth * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setPosterUrl(canvas.toDataURL('image/jpeg', 0.7));
    } catch {}
  }, []);

  const applyDuration = useCallback((resolvedDuration: number) => {
    if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0 || durationResolvedRef.current) return;

    durationResolvedRef.current = true;
    setDuration(resolvedDuration);
    setCurrentTime(0);
    setStart(0);

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      const ratio = maxSizeMB / sizeMB;
      const suggestedEnd = Math.max(3, Math.min(resolvedDuration, resolvedDuration * ratio * 0.95));
      setEnd(suggestedEnd);
    } else {
      setEnd(resolvedDuration);
    }

    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = 0;
      } catch {}
      window.setTimeout(capturePoster, 120);
    }
  }, [capturePoster, file.size, maxSizeMB]);

  const onLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video || durationResolvedRef.current) return;

    const directDuration = video.duration;
    if (Number.isFinite(directDuration) && directDuration > 0) {
      applyDuration(directDuration);
      return;
    }

    const onDurationChange = () => {
      const nextDuration = video.duration;
      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        video.removeEventListener('durationchange', onDurationChange);
        video.removeEventListener('seeked', onSeeked);
        applyDuration(nextDuration);
      }
    };

    const onSeeked = () => {
      const nextDuration = video.duration;
      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        video.removeEventListener('durationchange', onDurationChange);
        video.removeEventListener('seeked', onSeeked);
        applyDuration(nextDuration);
      }
    };

    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('seeked', onSeeked);
    try {
      video.currentTime = 1e9;
    } catch {}
  }, [applyDuration]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || processing) return;

    if (video.paused) {
      if (video.currentTime < start || video.currentTime > end) video.currentTime = start;
      void video.play();
    } else {
      video.pause();
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);
    if (video.currentTime >= end) {
      video.pause();
      video.currentTime = start;
    }
  };

  const trimDuration = Math.max(0, end - start);
  const estimatedMB = duration > 0 ? (file.size / (1024 * 1024)) * (trimDuration / duration) : 0;

  const handleAutoCut = useCallback(() => {
    if (duration <= 0) return;

    const sizeMB = file.size / (1024 * 1024);
    const ratio = maxSizeMB / sizeMB;
    const newEnd = Math.max(3, Math.min(duration, duration * ratio * 0.9));
    setStart(0);
    setEnd(newEnd);
    toast({ title: 'Corte automático aplicado', description: `Vídeo cortado para ~${formatTime(newEnd)} para caber no limite.` });
  }, [duration, file.size, maxSizeMB, toast]);

  const handleProcess = async (mode: 'compress' | 'trim') => {
    capturePoster();
    stopInlinePreview();
    setIsPlaying(false);
    setProcessing(true);
    setProgress(0);
    setStage(mode === 'compress' ? 'Comprimindo vídeo completo...' : 'Cortando e otimizando...');

    try {
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
      const processStart = mode === 'compress' ? 0 : start;
      const processEnd = mode === 'compress' ? safeDuration : end;
      const target = maxSizeMB * 0.8;
      const result = await transcodeSegment(file, processStart, processEnd, target, (value) => setProgress(value));
      const resultMB = result.size / (1024 * 1024);

      if (result.size > maxSizeMB * 1024 * 1024) {
        toast({
          title: 'Ainda acima do limite',
          description: `Resultado: ${resultMB.toFixed(1)}MB. Tente cortar mais.`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Vídeo otimizado!',
        description: `${(file.size / (1024 * 1024)).toFixed(1)}MB → ${resultMB.toFixed(1)}MB`,
      });
      onResult(result);
      onOpenChange(false);
    } catch (error: any) {
      console.error('[VideoTrimmer] error', error);
      toast({
        title: 'Erro ao processar',
        description: error?.message || 'Não foi possível otimizar o vídeo.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !processing && onOpenChange(value)}>
      <DialogContent
        aria-describedby="video-trimmer-description"
        className="
          p-0 gap-0 overflow-hidden
          w-[100vw] max-w-[100vw] h-[100dvh] max-h-[100dvh] rounded-none
          sm:w-[95vw] sm:max-w-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-lg
          flex flex-col
        "
      >
        <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 shrink-0 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Scissors className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <span className="truncate">Otimizar vídeo ({(file.size / (1024 * 1024)).toFixed(1)}MB)</span>
          </DialogTitle>
          <DialogDescription id="video-trimmer-description" className="sr-only">
            Ajuste corte ou compressão do vídeo sem reprodução durante o processamento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 sm:px-6 sm:py-4 space-y-3 sm:space-y-4 overscroll-contain">
          <p className="text-xs sm:text-sm text-muted-foreground">
            O vídeo excede o limite de {maxSizeMB}MB. Ajuste o corte ou comprima automaticamente.
          </p>

          <div className="relative bg-black rounded-lg overflow-hidden mx-auto w-full" style={{ maxHeight: '38dvh' }}>
            {!processing && previewUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={previewUrl}
                  onLoadedMetadata={onLoaded}
                  onDurationChange={onLoaded}
                  onTimeUpdate={onTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onSeeked={capturePoster}
                  preload="metadata"
                  className="w-full object-contain block"
                  style={{ maxHeight: '38dvh' }}
                  playsInline
                  controls={false}
                />
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 active:bg-black/20 transition-colors"
                  aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
                >
                  {!isPlaying && <Play className="h-12 w-12 text-white drop-shadow-lg" />}
                </button>
              </>
            ) : (
              <div className="relative w-full flex items-center justify-center" style={{ minHeight: '20dvh', maxHeight: '38dvh' }}>
                {posterUrl ? (
                  <img loading="lazy" decoding="async"
                    src={posterUrl}
                    alt="Capa do vídeo"
                    className="w-full h-auto object-contain block"
                    style={{ maxHeight: '38dvh' }}
                  />
                ) : (
                  <div className="text-white/50 text-xs py-12">Carregando capa...</div>
                )}
              <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-3 pointer-events-none px-4">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <span className="text-[11px] sm:text-xs text-white/90 text-center">{stage || 'Processando — player desativado'}</span>
                  <div className="w-full max-w-[260px] space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full bg-primary transition-[width] duration-200 ease-out"
                        style={{ width: `${Math.max(2, Math.round(progress))}%` }}
                      />
                    </div>
                    <div className="text-center text-[10px] sm:text-[11px] text-white/90 tabular-nums">
                      {Math.round(progress)}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {duration > 0 && (
            <div className="space-y-2 sm:space-y-3">
              <div className="flex justify-between text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                <span>Início: {formatTime(start)}</span>
                <span className="hidden xs:inline">Atual: {formatTime(currentTime)}</span>
                <span>Fim: {formatTime(end)}</span>
              </div>

              <div>
                <label className="text-[11px] sm:text-xs font-medium text-muted-foreground">Início</label>
                <Slider
                  value={[start]}
                  min={0}
                  max={duration}
                  step={0.1}
                  disabled={processing}
                  onValueChange={(value) => {
                    const newStart = Math.min(value[0], end - 1);
                    setStart(newStart);
                    if (!processing && videoRef.current) videoRef.current.currentTime = newStart;
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] sm:text-xs font-medium text-muted-foreground">Fim</label>
                <Slider
                  value={[end]}
                  min={0}
                  max={duration}
                  step={0.1}
                  disabled={processing}
                  onValueChange={(value) => {
                    const newEnd = Math.max(value[0], start + 1);
                    setEnd(newEnd);
                    if (!processing && videoRef.current) videoRef.current.currentTime = Math.max(start, newEnd - 0.05);
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm rounded-md bg-muted/50 px-3 py-2 gap-2">
                <span className="truncate">Corte: <strong>{formatTime(trimDuration)}</strong></span>
                <span className={`shrink-0 tabular-nums ${estimatedMB > maxSizeMB ? 'text-destructive' : 'text-green-500'}`}>
                  ~{estimatedMB.toFixed(1)}MB
                </span>
              </div>

              <div className="flex justify-end text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                <span>Total: {formatTime(duration)}</span>
              </div>
            </div>
          )}

          {processing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span className="truncate">{stage}</span>
                <span className="ml-auto font-medium tabular-nums">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>

        <div
          className="shrink-0 border-t border-border/50 px-4 py-3 sm:px-6 sm:py-4 bg-background/95 backdrop-blur space-y-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {processing && (
            <div className="space-y-1.5 pb-1">
              <div className="flex items-center gap-2 text-[11px] sm:text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                <span className="truncate text-muted-foreground">{stage}</span>
                <span className="ml-auto font-semibold tabular-nums text-primary">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoCut}
              disabled={processing}
              className="text-xs sm:text-sm px-2"
            >
              <Sparkles className="h-3.5 w-3.5 sm:mr-1.5 shrink-0" />
              <span className="hidden sm:inline">Sugerir</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleProcess('compress')}
              disabled={processing || duration <= 0}
              className="text-xs sm:text-sm px-2"
            >
              Comprimir
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleProcess('trim')}
              disabled={processing || trimDuration < 1 || duration <= 0}
              className="text-xs sm:text-sm px-2"
            >
              <Scissors className="h-3.5 w-3.5 sm:mr-1.5 shrink-0" />
              <span>Cortar</span>
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={processing}
            className="w-full text-xs sm:text-sm"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
