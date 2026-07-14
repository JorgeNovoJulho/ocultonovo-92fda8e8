/**
 * VideoTrimAndCoverPicker — fluxo completo de pré-publicação de vídeo no PLAY:
 *  - Preview do vídeo
 *  - Corte com sliders (início/fim em segundos)
 *  - Grade de frames extraídos para usar como capa
 *  - Upload de arquivo de imagem como capa
 *  - Capa padronizada em 1280x720 (proporção YouTube) via canvas
 *
 * Performance: extrai apenas 6 frames sob demanda, libera ObjectURLs,
 * canvas reaproveitado, listeners removidos no unmount.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon, Scissors, Loader2, Upload, Check, Play, Crosshair, Clock, Zap, Scale, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS, type OcultoPlayQualityPreset } from '@/lib/ocultoPlayVideoProcessor';
import { useOcultoPlayUploadPrefsStore } from '@/store/useOcultoPlayUploadPrefsStore';

const COVER_W = 1280;
const COVER_H = 720;
const FRAMES = 6;

export interface VideoCoverResult {
  /** Capa final (sempre 1280x720 JPEG) — pode ser null se o usuário não definir. */
  coverBlob: Blob | null;
  /** Início do corte em segundos (0 quando sem corte). */
  trimStart: number;
  /** Fim do corte em segundos (igual à duração quando sem corte). */
  trimEnd: number;
  /** Duração total do vídeo original em segundos. */
  duration: number;
  /** Preset de qualidade escolhido pelo usuário para a compressão. */
  qualityPreset: OcultoPlayQualityPreset;
}

interface Props {
  file: File;
  onChange: (r: VideoCoverResult) => void;
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Renderiza um <video> em 1280x720 cobrindo a área (object-cover). */
function drawCover(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  canvas.width = COVER_W;
  canvas.height = COVER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  const vw = video.videoWidth || COVER_W;
  const vh = video.videoHeight || COVER_H;
  const targetRatio = COVER_W / COVER_H;
  const videoRatio = vw / vh;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (videoRatio > targetRatio) {
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / targetRatio;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, COVER_W, COVER_H);
}

async function blobFromCanvas(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

export function VideoTrimAndCoverPicker({ file, onChange }: Props) {
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [frames, setFrames] = useState<{ t: number; url: string }[]>([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [selectedFrameT, setSelectedFrameT] = useState<number | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverBlobRef = useRef<Blob | null>(null);
  const [previewingTrim, setPreviewingTrim] = useState(false);
  const previewStopRef = useRef<number | null>(null);
  // Time picker (segundo a segundo) para escolher capa por timestamp preciso
  const [pickerTime, setPickerTime] = useState(0);
  const [pickerThumb, setPickerThumb] = useState<string | null>(null);
  const pickerSeekTimer = useRef<number | null>(null);

  // Preferências persistentes (preset de qualidade + dispensar aviso)
  const qualityPreset = useOcultoPlayUploadPrefsStore((s) => s.qualityPreset);
  const setQualityPreset = useOcultoPlayUploadPrefsStore((s) => s.setQualityPreset);
  const dismissLongVideoWarning = useOcultoPlayUploadPrefsStore((s) => s.dismissLongVideoWarning);
  const setDismissLongVideoWarning = useOcultoPlayUploadPrefsStore((s) => s.setDismissLongVideoWarning);

  // Dispensa do aviso nesta sessão (sem necessariamente salvar a preferência)
  const [warningDismissedSession, setWarningDismissedSession] = useState(false);
  const [rememberDismiss, setRememberDismiss] = useState(false);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);
  useEffect(() => () => { if (pickerThumb) URL.revokeObjectURL(pickerThumb); }, [pickerThumb]);
  useEffect(() => () => { frames.forEach((f) => URL.revokeObjectURL(f.url)); }, [frames]);

  // Notify parent on any change
  useEffect(() => {
    onChange({
      coverBlob: coverBlobRef.current,
      trimStart,
      trimEnd: trimEnd || duration,
      duration,
      qualityPreset,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimStart, trimEnd, duration, coverPreview, qualityPreset]);

  const onLoadedMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || 0;
    setDuration(d);
    setTrimEnd(Math.min(d, OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS));
  };

  // Extrai N frames distribuídos uniformemente
  const extractFrames = async () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !duration) return;
    setFramesLoading(true);
    const list: { t: number; url: string }[] = [];
    const stepDur = duration / (FRAMES + 1);
    for (let i = 1; i <= FRAMES; i++) {
      const t = stepDur * i;
      await new Promise<void>((resolve) => {
        const onSeek = () => { v.removeEventListener('seeked', onSeek); resolve(); };
        v.addEventListener('seeked', onSeek);
        try { v.currentTime = Math.min(Math.max(0, t), Math.max(0, duration - 0.05)); }
        catch { resolve(); }
      });
      drawCover(v, c);
      const blob = await blobFromCanvas(c, 0.6);
      if (blob) list.push({ t, url: URL.createObjectURL(blob) });
    }
    setFrames(list);
    setFramesLoading(false);
  };

  const pickFrame = async (t: number) => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    await new Promise<void>((resolve) => {
      const onSeek = () => { v.removeEventListener('seeked', onSeek); resolve(); };
      v.addEventListener('seeked', onSeek);
      try { v.currentTime = Math.min(Math.max(0, t), Math.max(0, duration - 0.05)); }
      catch { resolve(); }
    });
    drawCover(v, c);
    const blob = await blobFromCanvas(c, 0.85);
    if (blob) {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      coverBlobRef.current = blob;
      setCoverPreview(URL.createObjectURL(blob));
      setSelectedFrameT(t);
    }
  };

  const onCustomCover = async (f: File | null) => {
    if (!f) return;
    // Redimensiona via canvas para 1280x720 mantendo cover
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.src = url;
    await new Promise((resolve, reject) => { img.onload = () => resolve(null); img.onerror = reject; });
    const c = canvasRef.current;
    if (!c) { URL.revokeObjectURL(url); return; }
    c.width = COVER_W; c.height = COVER_H;
    const ctx = c.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return; }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, COVER_W, COVER_H);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const tr = COVER_W / COVER_H, ir = iw / ih;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (ir > tr) { sw = ih * tr; sx = (iw - sw) / 2; }
    else { sh = iw / tr; sy = (ih - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, COVER_W, COVER_H);
    URL.revokeObjectURL(url);
    const blob = await blobFromCanvas(c, 0.88);
    if (blob) {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      coverBlobRef.current = blob;
      setCoverPreview(URL.createObjectURL(blob));
      setSelectedFrameT(null);
    }
  };

  // Reproduz apenas o trecho cortado e pausa automaticamente
  const previewTrim = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (previewingTrim) {
      v.pause();
      setPreviewingTrim(false);
      if (previewStopRef.current != null) {
        cancelAnimationFrame(previewStopRef.current);
        previewStopRef.current = null;
      }
      return;
    }
    const ts = Math.max(0, trimStart);
    const te = Math.max(ts + 0.2, trimEnd || duration);
    try { v.currentTime = ts; } catch { /* noop */ }
    try { await v.play(); } catch { return; }
    setPreviewingTrim(true);
    const tick = () => {
      if (!videoRef.current) return;
      if (v.currentTime >= te - 0.05 || v.paused) {
        try { v.pause(); } catch { /* noop */ }
        setPreviewingTrim(false);
        previewStopRef.current = null;
        return;
      }
      previewStopRef.current = requestAnimationFrame(tick);
    };
    previewStopRef.current = requestAnimationFrame(tick);
  };

  // Captura a capa a partir do tempo do "picker fino"
  const captureCoverAtPickerTime = () => pickFrame(pickerTime);

  // Quando o usuário arrasta o picker, sincroniza preview do frame ao vivo (debounced)
  useEffect(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !duration) return;
    if (pickerSeekTimer.current) window.clearTimeout(pickerSeekTimer.current);
    pickerSeekTimer.current = window.setTimeout(async () => {
      const target = Math.min(Math.max(0, pickerTime), Math.max(0, duration - 0.05));
      await new Promise<void>((resolve) => {
        const onSeek = () => { v.removeEventListener('seeked', onSeek); resolve(); };
        v.addEventListener('seeked', onSeek);
        try { v.currentTime = target; } catch { resolve(); }
      });
      drawCover(v, c);
      const blob = await blobFromCanvas(c, 0.55);
      if (blob) {
        setPickerThumb((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      }
    }, 90);
    return () => { if (pickerSeekTimer.current) window.clearTimeout(pickerSeekTimer.current); };
  }, [pickerTime, duration]);

  // Cleanup geral do preview
  useEffect(() => () => {
    if (previewStopRef.current != null) cancelAnimationFrame(previewStopRef.current);
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-lg overflow-hidden bg-black/60 border border-border/40">
        <video
          ref={videoRef}
          src={objectUrl}
          onLoadedMetadata={onLoadedMeta}
          controls
          preload="metadata"
          playsInline
          className="w-full max-h-56 object-contain bg-black"
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {/* Trim */}
      <div className="rounded-lg border border-border/40 bg-card/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <Scissors className="h-3.5 w-3.5 text-fuchsia-400" /> Cortar vídeo
          </span>
          <span className="text-muted-foreground tabular-nums">
            {fmt(trimStart)} → {fmt(trimEnd || duration)} · {fmt(Math.max(0, (trimEnd || duration) - trimStart))}
          </span>
        </div>
        {/* Preset de qualidade x tamanho (persistido) */}
        <div className="rounded-md border border-border/40 bg-black/30 p-2 space-y-1.5">
          <p className="text-[11px] font-medium text-foreground/90">Qualidade da compressão</p>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { key: 'smaller', label: 'Tamanho menor', hint: 'Upload e processamento mais rápidos', Icon: Zap },
              { key: 'balanced', label: 'Equilibrado', hint: 'Recomendado para a maioria', Icon: Scale },
              { key: 'best', label: 'Melhor qualidade', hint: 'Arquivo maior, demora mais', Icon: Sparkles },
            ] as const).map(({ key, label, hint, Icon }) => {
              const active = qualityPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQualityPreset(key)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-left transition-colors',
                    active
                      ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-100'
                      : 'border-border/50 bg-card/40 text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                  aria-pressed={active}
                >
                  <span className="flex items-center gap-1 text-[11px] font-semibold">
                    <Icon className="h-3 w-3" /> {label}
                  </span>
                  <span className="block text-[10px] leading-tight opacity-80 mt-0.5">{hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {(() => {
          const trimmed = Math.max(0, (trimEnd || duration) - trimStart);
          if (trimmed <= 60) return null;
          if (dismissLongVideoWarning || warningDismissedSession) return null;
          // Estimativa conservadora: re-encode client-side ~1x do tempo do vídeo + 10s de overhead.
          // Ajustada levemente pelo preset escolhido.
          const presetFactor = qualityPreset === 'best' ? 1.25 : qualityPreset === 'smaller' ? 0.85 : 1;
          const estSec = Math.ceil(trimmed * presetFactor + 10);
          const mm = Math.floor(estSec / 60);
          const ss = estSec % 60;
          const label = mm > 0 ? `~${mm}m${ss > 0 ? ` ${ss}s` : ''}` : `~${ss}s`;
          return (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100 space-y-2">
              <div className="flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-300" />
                <div className="leading-snug flex-1">
                  <p className="font-medium text-amber-200">Vídeo longo ({fmt(trimmed)})</p>
                  <p className="text-amber-100/90">
                    O processamento e compressão ocorrem no seu dispositivo antes do envio.
                    Tempo estimado: <span className="font-semibold tabular-nums">{label}</span>.
                    Mantenha o app aberto e a tela ligada durante o processo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWarningDismissedSession(true)}
                  className="text-amber-200/70 hover:text-amber-100 shrink-0"
                  aria-label="Fechar aviso"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap pl-5">
                <label className="inline-flex items-center gap-1.5 text-[10px] text-amber-100/90 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberDismiss}
                    onChange={(e) => setRememberDismiss(e.target.checked)}
                    className="h-3 w-3 accent-amber-400"
                  />
                  Não mostrar de novo
                </label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (rememberDismiss) setDismissLongVideoWarning(true);
                    setWarningDismissedSession(true);
                  }}
                  className="h-7 text-[11px] bg-amber-500 hover:bg-amber-600 text-black"
                >
                  Continuar mesmo assim
                </Button>
              </div>
            </div>
          );
        })()}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-muted-foreground">Início ({trimStart.toFixed(2)}s)</label>
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current; if (!v) return;
                setTrimStart(Math.min(v.currentTime, (trimEnd || duration) - 0.2));
              }}
              className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 inline-flex items-center gap-1"
            >
              <Crosshair className="h-3 w-3" /> usar tempo atual
            </button>
          </div>
          <input
            type="range" min={0} max={Math.max(0, duration)} step={0.05}
            value={trimStart}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              const nextStart = Math.min(v, (trimEnd || duration) - 0.2);
              setTrimStart(nextStart);
              setTrimEnd((cur) => Math.min(Math.max(cur || duration, nextStart + 0.2), nextStart + OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS, duration));
              const vid = videoRef.current; if (vid) { try { vid.currentTime = v; } catch { /* noop */ } }
            }}
            className="w-full accent-fuchsia-500"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-muted-foreground">Fim ({(trimEnd || duration).toFixed(2)}s)</label>
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current; if (!v) return;
                setTrimEnd(Math.max(v.currentTime, trimStart + 0.2));
              }}
              className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 inline-flex items-center gap-1"
            >
              <Crosshair className="h-3 w-3" /> usar tempo atual
            </button>
          </div>
          <input
            type="range" min={0} max={Math.max(0, duration)} step={0.05}
            value={trimEnd || duration}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setTrimEnd(Math.min(Math.max(v, trimStart + 0.2), trimStart + OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS, duration));
              const vid = videoRef.current; if (vid) { try { vid.currentTime = v; } catch { /* noop */ } }
            }}
            className="w-full accent-fuchsia-500"
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] text-muted-foreground flex-1">
              O arquivo será publicado já recortado, com até {OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS}s e tela final OCULTO de 2s.
          </p>
          <Button
            type="button" size="sm"
            onClick={previewTrim}
            disabled={!duration}
            className={cn(
              'h-7 text-[11px]',
              previewingTrim
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-gradient-to-r from-fuchsia-500 to-primary text-white',
            )}
          >
            <Play className="h-3 w-3 mr-1" />
            {previewingTrim ? 'Parar prévia' : 'Pré-visualizar corte'}
          </Button>
        </div>
      </div>

      {/* Cover */}
      <div className="rounded-lg border border-border/40 bg-card/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <ImageIcon className="h-3.5 w-3.5 text-amber-300" /> Capa do vídeo
          </span>
          <span className="text-[10px] text-muted-foreground">1280×720 (YouTube)</span>
        </div>

        {coverPreview ? (
          <div className="relative aspect-video rounded-md overflow-hidden border border-fuchsia-500/40">
            <img src={coverPreview} alt="Capa selecionada" className="w-full h-full object-cover" />
            <div className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-fuchsia-500 text-white">
              <Check className="h-3.5 w-3.5" />
            </div>
          </div>
        ) : (
          <div className="aspect-video rounded-md grid place-items-center bg-black/50 text-[11px] text-muted-foreground">
            Nenhuma capa escolhida — usaremos a primeira capa gerada
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button" size="sm" variant="outline"
            onClick={extractFrames} disabled={!duration || framesLoading}
          >
            {framesLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 mr-1.5" />}
            Gerar frames do vídeo
          </Button>
          <label className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-card px-2.5 py-1.5 cursor-pointer hover:bg-accent">
            <Upload className="h-3.5 w-3.5" />
            Enviar capa personalizada
            <input
              type="file" accept="image/*" className="hidden"
              onChange={(e) => onCustomCover(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {frames.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {frames.map((f) => (
              <button
                key={f.t}
                type="button"
                onClick={() => pickFrame(f.t)}
                className={cn(
                  'relative aspect-video rounded-md overflow-hidden border-2 transition-all',
                  selectedFrameT === f.t
                    ? 'border-fuchsia-500 ring-2 ring-fuchsia-500/40'
                    : 'border-transparent hover:border-fuchsia-400/60',
                )}
              >
                <img src={f.url} alt={`Frame em ${fmt(f.t)}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/70 text-white px-1 rounded tabular-nums">
                  {fmt(f.t)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Seletor preciso por tempo — capa por timestamp */}
        <div className="rounded-md border border-border/40 bg-black/30 p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium flex items-center gap-1.5">
              <Crosshair className="h-3 w-3 text-amber-300" /> Tempo exato
            </span>
            <span className="text-muted-foreground tabular-nums">{pickerTime.toFixed(2)}s</span>
          </div>
          <div className="flex items-center gap-2">
            {pickerThumb ? (
              <img
                src={pickerThumb}
                alt="Pré-visualização do frame"
                className="w-20 h-12 object-cover rounded border border-border/60 flex-shrink-0"
              />
            ) : (
              <div className="w-20 h-12 grid place-items-center rounded border border-border/60 bg-black text-[9px] text-muted-foreground flex-shrink-0">
                arraste
              </div>
            )}
            <input
              type="range" min={0} max={Math.max(0, duration)} step={0.05}
              value={pickerTime}
              onChange={(e) => setPickerTime(parseFloat(e.target.value))}
              className="flex-1 accent-amber-400"
              disabled={!duration}
            />
            <Button
              type="button" size="sm"
              onClick={captureCoverAtPickerTime}
              disabled={!duration}
              className="h-7 text-[11px] bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Check className="h-3 w-3 mr-1" /> Usar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
