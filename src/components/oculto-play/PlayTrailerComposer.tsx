import { useEffect, useMemo, useRef, useState } from 'react';
import { Film, Link2, Play, RotateCcw, Scissors, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { extractUrlFromEmbedSnippet, parseEmbeddedVideo } from '@/lib/embeddedVideoUrl';


export const TRAILER_MAX_SECONDS = 90;

export interface TrailerValue {
  file: File | null;
  /** Arquivo usado como fonte do recorte. Em modo reuse é o vídeo principal. */
  sourceFile?: File | null;
  /** URL usada como fonte do recorte quando o principal é um link externo. */
  sourceUrl?: string | null;
  /** true quando o trailer será gerado recortando o vídeo/link principal. */
  reusedFromPrimary?: boolean;
  /** Janela de playback dentro da mídia principal; upload dedicado usa sempre 0→duração. */
  trimStart: number;
  trimEnd: number;
  duration: number;
}

interface Props {
  /** Vídeo principal já selecionado pelo usuário (para opção "Recortar do principal"). */
  primaryVideoFile?: File | null;
  /** Link principal já informado pelo usuário (para recortar a janela do embed/link). */
  primaryLinkUrl?: string | null;
  /** Permite recortar a mídia principal em vez de enviar um trailer pronto. */
  allowReuseFromPrimary?: boolean;
  value: TrailerValue | null;
  onChange: (value: TrailerValue | null) => void;
}

function appendTrimToEmbed(src: string, kind: string | undefined, start: number, end: number) {
  try {
    const u = new URL(src);
    if (kind === 'youtube') {
      if (start > 0) u.searchParams.set('start', String(Math.floor(start)));
      if (end > start) u.searchParams.set('end', String(Math.floor(end)));
      u.searchParams.set('autoplay', '0');
    }
    if (kind === 'vimeo' && start > 0) u.hash = `t=${Math.floor(start)}s`;
    return u.toString();
  } catch {
    return src;
  }
}

function normalizeTrimStart(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function normalizeTrimEnd(start: number, value: number, fallback: number) {
  const raw = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.max(start + 0.5, raw);
}

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Composer de TRAILER para itens `short_video` e `link` do Oculto Play.
 * - Pode receber um arquivo dedicado de trailer (mp4/webm/mov).
 * - Ou recortar a janela diretamente do vídeo/link principal.
 * - A janela de playback (trimStart→trimEnd) é limitada a 90s (1m30s).
 *
 * O upload do arquivo e a persistência das colunas `trailer_url`,
 * `trailer_trim_start_seconds`, `trailer_trim_end_seconds` ficam a
 * cargo do orquestrador (OcultoPlayPage handleSubmit).
 */
export function PlayTrailerComposer({
  primaryVideoFile,
  primaryLinkUrl,
  allowReuseFromPrimary,
  value,
  onChange,
}: Props) {
  const primaryUrl = primaryLinkUrl?.trim() || '';
  const parsedPrimaryLink = useMemo(() => parseEmbeddedVideo(primaryUrl), [primaryUrl]);
  const hasPrimary = Boolean(primaryVideoFile || parsedPrimaryLink);
  const canReusePrimary = Boolean(allowReuseFromPrimary && hasPrimary);
  const [mode, setMode] = useState<'upload' | 'reuse' | 'link'>(() => (canReusePrimary ? 'reuse' : 'upload'));
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(value?.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState(value?.trimEnd ?? TRAILER_MAX_SECONDS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [linkInput, setLinkInput] = useState<string>(
    () => (value && !value.reusedFromPrimary && !value.file && value.sourceUrl) ? value.sourceUrl : '',
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const userSelectedModeRef = useRef(false);

  // Link externo informado pelo usuário como trailer pronto (URL ou iframe embed).
  const trimmedLinkInput = (linkInput || '').trim();
  const looksLikeIframeSnippet = /<\s*iframe\b/i.test(trimmedLinkInput);
  const extractedFromSnippet = useMemo(
    () => (looksLikeIframeSnippet ? extractUrlFromEmbedSnippet(trimmedLinkInput) : trimmedLinkInput),
    [looksLikeIframeSnippet, trimmedLinkInput],
  );
  const parsedExternalTrailer = useMemo(() => {
    if (mode !== 'link' || !trimmedLinkInput) return null;
    return parseEmbeddedVideo(trimmedLinkInput);
  }, [mode, trimmedLinkInput]);
  const normalizedExternalTrailerUrl = useMemo(() => {
    if (!trimmedLinkInput) return '';
    return extractUrlFromEmbedSnippet(trimmedLinkInput) || trimmedLinkInput;
  }, [trimmedLinkInput]);
  const externalTrailerThumb = parsedExternalTrailer?.thumbnailUrl ?? null;
  const linkValidationError = useMemo(() => {
    if (mode !== 'link' || !trimmedLinkInput) return null;
    if (looksLikeIframeSnippet && !extractedFromSnippet) {
      return 'Não encontrei o atributo src= dentro do <iframe>. Cole o snippet completo.';
    }
    if (!parsedExternalTrailer) {
      try {
        const u = new URL(extractedFromSnippet || trimmedLinkInput);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return 'Use uma URL http(s) válida.';
        }
        return 'Provedor não reconhecido. Use YouTube, Vimeo, TikTok, Dailymotion ou um arquivo .mp4/.webm direto.';
      } catch {
        return 'URL inválida. Cole um link completo (https://...) ou um código <iframe>.';
      }
    }
    return null;
  }, [mode, trimmedLinkInput, looksLikeIframeSnippet, extractedFromSnippet, parsedExternalTrailer]);

  // Arquivo "ativo" para player nativo. Em link externo embedado, a fonte é `primaryUrl`.
  const activeFile = mode === 'reuse' ? (primaryVideoFile ?? null) : (mode === 'upload' ? (value?.file ?? null) : null);
  const isPrimaryLinkMode = mode === 'reuse' && !primaryVideoFile && !!parsedPrimaryLink;
  const isUploadedTrailerMode = mode === 'upload';


  // Preview URL
  useEffect(() => {
    if (!activeFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(activeFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [activeFile]);

  useEffect(() => {
    if (!canReusePrimary || userSelectedModeRef.current || value?.file) return;
    setMode('reuse');
  }, [canReusePrimary, value?.file, primaryVideoFile, parsedPrimaryLink?.id]);

  // Reset janela ao trocar fonte
  useEffect(() => {
    setTrimStart(0);
    setTrimEnd(TRAILER_MAX_SECONDS);
    setDuration(0);
  }, [activeFile, mode, primaryUrl]);

  // Mantém a prévia visual parada exatamente no início do recorte selecionado.
  useEffect(() => {
    if (mode !== 'reuse') return;
    const v = videoRef.current;
    if (!v) return;
    try {
      if (Math.abs((v.currentTime || 0) - trimStart) > 0.15) v.currentTime = trimStart;
    } catch { /* noop */ }
  }, [mode, trimStart, previewUrl, parsedPrimaryLink?.embedSrc]);

  // Sincroniza com o pai
  useEffect(() => {
    if (mode === 'link') {
      if (!normalizedExternalTrailerUrl) {
        onChange(null);
        return;
      }
      onChange({
        file: null,
        sourceFile: null,
        sourceUrl: normalizedExternalTrailerUrl,
        reusedFromPrimary: false,
        trimStart: 0,
        trimEnd: 0,
        duration: 0,
      });
      return;
    }
    if (mode === 'reuse' && isPrimaryLinkMode && parsedPrimaryLink) {
      onChange({
        file: null,
        sourceFile: null,
        sourceUrl: primaryUrl,
        reusedFromPrimary: true,
        trimStart,
        trimEnd: trimEnd || TRAILER_MAX_SECONDS,
        duration,
      });
      return;
    }
    if (!activeFile) {
      onChange(null);
      return;
    }
    onChange({
      file: mode === 'upload' ? (activeFile as File) : null,
      sourceFile: activeFile,
      reusedFromPrimary: mode === 'reuse',
      trimStart,
      trimEnd: mode === 'upload' ? (duration || trimEnd) : (trimEnd || duration),
      duration,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, mode, trimStart, trimEnd, duration, isPrimaryLinkMode, parsedPrimaryLink?.id, primaryUrl, normalizedExternalTrailerUrl]);


  const onLoadedMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || 0;
    setDuration(d);
    const initialEnd = Math.min(d, TRAILER_MAX_SECONDS);
    setTrimStart(0);
    setTrimEnd(initialEnd);
  };

  const handleFile = (f: File | null) => {
    if (!f) {
      onChange(null);
      return;
    }
    if (!/^video\//.test(f.type) && !/\.(mp4|webm|mov|m4v)$/i.test(f.name)) {
      toast.error('Selecione um arquivo de vídeo (mp4, webm, mov).');
      return;
    }
    onChange({ file: f, trimStart: 0, trimEnd: 0, duration: 0, reusedFromPrimary: false });
  };

  const trimmedLen = Math.max(0, (trimEnd || duration) - trimStart);
  const overLimit = trimmedLen > TRAILER_MAX_SECONDS + 0.01;
  const invalidRange = duration > 0 && (trimEnd || duration) <= trimStart;
  const uploadedTooLong = isUploadedTrailerMode && duration > TRAILER_MAX_SECONDS + 0.01;
  const linkEmbedPreviewSrc = parsedPrimaryLink
    ? appendTrimToEmbed(parsedPrimaryLink.embedSrc, parsedPrimaryLink.kind, trimStart, trimEnd || TRAILER_MAX_SECONDS)
    : null;

  const selectMode = (next: 'upload' | 'reuse' | 'link') => {
    userSelectedModeRef.current = true;
    setMode(next);
    setPreviewPlaying(false);
    if (next === 'reuse') {
      onChange(null);
      setTrimStart(0);
      setTrimEnd(Math.min(duration || TRAILER_MAX_SECONDS, TRAILER_MAX_SECONDS));
    }
    if (next === 'link') {
      // Limpa qualquer arquivo/recorte; o link externo é tratado como trailer pronto.
      setTrimStart(0);
      setTrimEnd(TRAILER_MAX_SECONDS);
    }
  };


  const clearTrailerTrim = () => {
    try { videoRef.current?.pause(); } catch { /* noop */ }
    setPreviewPlaying(false);
    setTrimStart(0);
    setTrimEnd(Math.min(duration || TRAILER_MAX_SECONDS, TRAILER_MAX_SECONDS));
    setMode('upload');
    userSelectedModeRef.current = true;
    onChange(null);
  };

  const playTrimPreview = () => {
    const v = videoRef.current;
    if (!v || invalidRange || overLimit || uploadedTooLong) return;
    try {
      v.currentTime = trimStart;
      v.play()
        .then(() => setPreviewPlaying(true))
        .catch(() => setPreviewPlaying(false));
    } catch {
      setPreviewPlaying(false);
    }
  };

  return (
    <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-fuchsia-300" />
        <div>
          <h3 className="text-xs font-semibold text-fuchsia-100">Trailer (opcional, máx 1:30)</h3>
          <p className="text-[10px] text-muted-foreground">
            Quando definido, será exibido nas páginas de compartilhamento externo no lugar do vídeo completo.
          </p>
        </div>
        {(activeFile || isPrimaryLinkMode) && (
          <button
            type="button"
            className="ml-auto text-[10px] text-rose-300 hover:text-rose-200 inline-flex items-center gap-1"
            onClick={clearTrailerTrim}
          >
            <X className="h-3 w-3" /> remover
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canReusePrimary && (
          <Button
            type="button"
            size="sm"
            variant={mode === 'reuse' ? 'default' : 'outline'}
            onClick={() => selectMode('reuse')}
            className="h-7 text-[11px]"
          >
            <Scissors className="mr-1 h-3 w-3" />
            Recortar do principal
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={mode === 'upload' ? 'default' : 'outline'}
          onClick={() => selectMode('upload')}
          className="h-7 text-[11px]"
        >
          <Upload className="mr-1 h-3 w-3" />
          Enviar trailer pronto
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'link' ? 'default' : 'outline'}
          onClick={() => selectMode('link')}
          className="h-7 text-[11px]"
        >
          <Link2 className="mr-1 h-3 w-3" />
          Colar URL ou embed
        </Button>
      </div>

      {mode === 'link' && (
        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] text-muted-foreground">
              URL do trailer (YouTube, Vimeo, TikTok, .mp4) ou código embed (&lt;iframe&gt;)
            </span>
            <textarea
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder='https://youtube.com/watch?v=... ou <iframe src="..."></iframe>'
              rows={3}
              className="mt-1 block w-full rounded-md border border-fuchsia-500/30 bg-background px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/60"
            />
          </label>
          {linkValidationError && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200">
              {linkValidationError}
            </p>
          )}
          {parsedExternalTrailer && (
            <div className="space-y-1">
              <div className="rounded-lg overflow-hidden border border-border/40 bg-black aspect-video relative">
                {externalTrailerThumb && (
                  <img
                    src={externalTrailerThumb}
                    alt="Miniatura do trailer"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-90"
                  />
                )}
                {parsedExternalTrailer.kind === 'direct' ? (
                  <video
                    src={parsedExternalTrailer.embedSrc}
                    controls
                    preload="metadata"
                    className="absolute inset-0 h-full w-full bg-black"
                  />
                ) : (
                  <iframe
                    src={parsedExternalTrailer.embedSrc}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    loading="lazy"
                    title="Prévia do trailer externo"
                  />
                )}
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white ring-1 ring-white/20">
                  {parsedExternalTrailer.kind === 'direct' ? 'Arquivo direto' : parsedExternalTrailer.kind}
                </span>
              </div>
              <p className="text-[10px] text-fuchsia-100/70 break-all">
                {normalizedExternalTrailerUrl}
              </p>
              <p className="text-[10px] text-fuchsia-100/70">
                Esse link será usado nas páginas de compartilhamento externo como trailer.
              </p>
            </div>
          )}
        </div>
      )}


      {mode === 'upload' && (
        <div className="space-y-2">
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[11px] text-fuchsia-50 file:mr-3 file:rounded file:border-0 file:bg-fuchsia-500/20 file:px-3 file:py-1.5 file:text-[11px] file:text-fuchsia-50 hover:file:bg-fuchsia-500/30"
          />
          {!previewUrl && (
            <p className="rounded-md border border-fuchsia-500/20 bg-fuchsia-500/5 px-2 py-1.5 text-[10px] text-fuchsia-100/75">
              Escolha um arquivo já pronto de trailer com até 1m30s. O recorte de trecho é feito apenas no vídeo/link principal.
            </p>
          )}
        </div>
      )}

      {mode === 'reuse' && isPrimaryLinkMode && parsedPrimaryLink && (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden border border-border/40 bg-black aspect-video relative">
            {parsedPrimaryLink.kind === 'direct' ? (
              <video
                ref={videoRef}
                src={parsedPrimaryLink.embedSrc}
                controls
                preload="metadata"
                onLoadedMetadata={onLoadedMeta}
                onTimeUpdate={(e) => {
                  const end = trimEnd || duration;
                  if (end > 0 && e.currentTarget.currentTime >= end) {
                    try { e.currentTarget.pause(); } catch { /* noop */ }
                    setPreviewPlaying(false);
                  }
                }}
                onPause={() => setPreviewPlaying(false)}
                onEnded={() => setPreviewPlaying(false)}
                className="absolute inset-0 h-full w-full bg-black"
              />
            ) : (
              <iframe
                key={linkEmbedPreviewSrc}
                src={linkEmbedPreviewSrc ?? parsedPrimaryLink.embedSrc}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                title="Prévia do recorte do trailer"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Início (segundos)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={Number(trimStart.toFixed(1))}
                onChange={(e) => {
                  const next = normalizeTrimStart(Number(e.target.value) || 0);
                  setTrimStart(next);
                  setTrimEnd((cur) => normalizeTrimEnd(next, cur, next + TRAILER_MAX_SECONDS));
                }}
                className="h-8 w-full rounded-md border border-fuchsia-500/30 bg-background px-2 text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Fim (segundos)</span>
              <input
                type="number"
                min={trimStart + 0.5}
                step={0.1}
                value={Number((trimEnd || TRAILER_MAX_SECONDS).toFixed(1))}
                onChange={(e) => setTrimEnd(normalizeTrimEnd(trimStart, Number(e.target.value) || 0, trimStart + TRAILER_MAX_SECONDS))}
                className="h-8 w-full rounded-md border border-fuchsia-500/30 bg-background px-2 text-xs"
              />
            </label>
          </div>
          <div className="text-[10px] text-fuchsia-100/80 flex items-center justify-between">
            <span>Janela: {fmt(trimStart)} → {fmt(trimEnd || TRAILER_MAX_SECONDS)}</span>
            <span className={overLimit ? 'text-rose-300' : 'text-fuchsia-100/70'}>
              {fmt(trimmedLen)} {overLimit && '(acima de 1:30)'}
            </span>
          </div>
          {(overLimit || (trimEnd || TRAILER_MAX_SECONDS) <= trimStart) && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200">
              O recorte do link principal precisa ter no máximo 1m30s e o fim deve ser maior que o início.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearTrailerTrim}
            className="h-8 w-full text-[11px]"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Remover recorte e usar o link completo
          </Button>
        </div>
      )}

      {previewUrl && (
        <div className="space-y-2">
          <video
            ref={videoRef}
            src={previewUrl}
            controls
            preload="metadata"
            onLoadedMetadata={onLoadedMeta}
            onTimeUpdate={(e) => {
              const end = trimEnd || duration;
              if (end > 0 && e.currentTarget.currentTime >= end) {
                try { e.currentTarget.pause(); } catch { /* noop */ }
                setPreviewPlaying(false);
              }
            }}
            onPause={() => setPreviewPlaying(false)}
            onEnded={() => setPreviewPlaying(false)}
            className="w-full max-h-48 rounded bg-black"
          />
          {duration > 0 && mode === 'upload' && (
            <div className="space-y-2">
              <div className="text-[10px] text-fuchsia-100/80 flex items-center justify-between">
                <span>Trailer pronto: {fmt(duration)}</span>
                <span className={uploadedTooLong ? 'text-rose-300' : 'text-fuchsia-100/70'}>
                  máximo 1:30
                </span>
              </div>
              {uploadedTooLong && (
                <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200">
                  O arquivo enviado como trailer pronto precisa ter no máximo 1m30s. Para recortar um trecho, use “Recortar do principal”.
                </p>
              )}
            </div>
          )}

          {duration > 0 && mode === 'reuse' && (
            <>
              <div className="text-[10px] text-fuchsia-100/80 flex items-center justify-between">
                <span>Janela: {fmt(trimStart)} → {fmt(trimEnd || duration)}</span>
                <span className={overLimit ? 'text-rose-300' : 'text-fuchsia-100/70'}>
                  {fmt(trimmedLen)} {overLimit && '(acima de 1:30)'}
                </span>
              </div>
              {(overLimit || invalidRange) && (
                <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200">
                  O trailer precisa ter no máximo 1m30s e o fim deve ser maior que o início.
                </p>
              )}
              <label className="block">
                <span className="text-[10px] text-muted-foreground">Início ({trimStart.toFixed(1)}s)</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={trimStart}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const maxStart = Math.max(0, (trimEnd || duration) - 0.5);
                    const s = Math.min(v, maxStart);
                    setTrimStart(s);
                  }}
                  className="w-full accent-fuchsia-500"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-muted-foreground">Fim ({(trimEnd || duration).toFixed(1)}s)</span>
                <input
                  type="range"
                  min={Math.min(trimStart + 0.5, duration)}
                  max={duration}
                  step={0.1}
                  value={trimEnd || duration}
                  onChange={(e) => setTrimEnd(Number(e.target.value))}
                  className="w-full accent-fuchsia-500"
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={playTrimPreview}
                disabled={overLimit || invalidRange}
                className="h-8 w-full text-[11px]"
              >
                <Play className="mr-1 h-3 w-3" />
                {previewPlaying ? 'Reproduzindo trecho...' : 'Prévia exata do trailer'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearTrailerTrim}
                className="h-8 w-full text-[11px]"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Remover recorte e usar o vídeo completo
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
