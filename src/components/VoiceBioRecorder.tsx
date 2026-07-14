import { useState, useRef, useEffect } from "react";
import { useVoiceBio } from "@/hooks/useVoiceBio";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Trash2, Upload, Volume2, FileAudio } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";


interface VoiceBioRecorderProps {
  existingUrl?: string;
  existingDuration?: number;
  onUploadComplete?: (url: string, duration: number) => void;
  readOnly?: boolean;
}

export function VoiceBioRecorder({ 
  existingUrl, 
  existingDuration,
  onUploadComplete,
  readOnly = false 
}: VoiceBioRecorderProps) {
  const {
    isRecording,
    duration,
    maxDuration,
    audioBlob,
    audioUrl,
    totalDuration,
    trimStart,
    trimDuration,
    needsTrim,
    setTrimStart,
    startRecording,
    stopRecording,
    clearRecording,
    importFile,
    upload,
    isUploading,
    deleteVoiceBio,
    isDeleting,
  } = useVoiceBio();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const trimStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePickFile = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await importFile(f);
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState<number>(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayUrl = audioUrl || existingUrl;
  const displayDuration = resolvedDuration || (audioBlob ? duration : existingDuration) || 0;

  // Resolve duração real (corrige Infinity em WebM)
  const resolveRealDuration = (audio: HTMLAudioElement): Promise<number> => {
    return new Promise((resolve) => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        resolve(audio.duration);
        return;
      }
      const handler = () => {
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          audio.removeEventListener('durationchange', handler);
          audio.currentTime = 0;
          resolve(audio.duration);
        }
      };
      audio.addEventListener('durationchange', handler);
      try { audio.currentTime = 1e101; } catch { /* noop */ }
      setTimeout(() => {
        audio.removeEventListener('durationchange', handler);
        resolve(audio.duration && isFinite(audio.duration) ? audio.duration : 0);
      }, 1500);
    });
  };

  useEffect(() => {
    if (displayUrl) {
      const audio = new Audio(displayUrl);
      audio.preload = 'metadata';
      audio.playbackRate = speed;
      audioRef.current = audio;

      const onEnded = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
      };
      const onTime = () => {
        const a = audioRef.current;
        if (!a) return;
        // Quando há trecho selecionado, calcula progresso DENTRO da janela [trimStart, trimStart+trimDuration]
        if (needsTrim) {
          const rel = Math.max(0, a.currentTime - trimStart);
          setPlaybackProgress(Math.min(100, (rel / trimDuration) * 100));
          if (a.currentTime >= trimStart + trimDuration) {
            a.pause();
            a.currentTime = trimStart;
            setIsPlaying(false);
            setPlaybackProgress(0);
          }
        } else {
          const dur = a.duration && isFinite(a.duration) ? a.duration : displayDuration;
          if (dur > 0) setPlaybackProgress((a.currentTime / dur) * 100);
        }
      };
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('timeupdate', onTime);

      resolveRealDuration(audio).then((d) => {
        if (d && isFinite(d)) setResolvedDuration(d);
      });

      return () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('timeupdate', onTime);
        audio.pause();
        if (trimStopTimerRef.current) clearTimeout(trimStopTimerRef.current);
        audioRef.current = null;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayUrl, needsTrim, trimStart, trimDuration]);

  // Sincroniza velocidade
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlayback = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
      return;
    }
    // Se há trecho selecionado, posiciona em trimStart antes de tocar
    if (needsTrim) {
      try { a.currentTime = trimStart; } catch { /* noop */ }
    }
    a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const cycleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const handleUpload = () => {
    if (!audioBlob) return;
    upload();
  };

  const handleDelete = () => {
    deleteVoiceBio();
    clearRecording();
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const SpeedButton = () => (
    <button
      type="button"
      onClick={cycleSpeed}
      title="Velocidade de reprodução"
      aria-label={`Velocidade atual ${speed.toFixed(1)}x`}
      className="rounded-md border border-border bg-background/80 px-2 py-0.5 text-[10px] font-bold text-foreground transition-colors hover:bg-muted tabular-nums"
    >
      {speed.toFixed(1)}x
    </button>
  );

  // Read-only player for viewing other profiles
  if (readOnly && existingUrl) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/30">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayback}
          className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 text-primary" />
          ) : (
            <Play className="h-5 w-5 text-primary ml-0.5" />
          )}
        </Button>
        
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Bio em áudio</span>
          </div>
          <Progress value={playbackProgress} className="h-1" />
        </div>
        
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(displayDuration)}
          </span>
          <SpeedButton />
        </div>
      </div>
    );
  }

  // Recording interface
  if (isRecording) {
    return (
      <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
        <div className="relative">
          <div className="absolute inset-0 bg-destructive/20 rounded-full animate-ping" />
          <Button
            variant="destructive"
            size="icon"
            onClick={stopRecording}
            className="h-14 w-14 rounded-full relative z-10"
           aria-label="Ação">
            <Square className="h-6 w-6" />
          </Button>
        </div>
        <div className="text-center">
          <p className="font-semibold text-destructive">Gravando...</p>
          <p className="text-2xl font-bold">{formatDuration(duration)}</p>
          <p className="text-xs text-muted-foreground">Máximo: {maxDuration} segundos</p>
        </div>
      </div>
    );
  }

  // Preview recorded audio (e seletor de trecho quando o áudio for > 30s)
  if (audioBlob) {
    const total = totalDuration || displayDuration || 0;
    const maxStart = Math.max(0, total - maxDuration);
    return (
      <div className="flex flex-col gap-3 p-4 rounded-lg bg-card/50 border border-border/30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayback}
            className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 text-primary" />
            ) : (
              <Play className="h-5 w-5 text-primary ml-0.5" />
            )}
          </Button>

          <div className="flex-1">
            <Progress value={playbackProgress} className="h-2" />
            {needsTrim && (
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>Trecho: {formatDuration(trimStart)} → {formatDuration(trimStart + trimDuration)}</span>
                <span>de {formatDuration(total)}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="text-sm font-medium tabular-nums">
              {needsTrim ? formatDuration(trimDuration) : formatDuration(displayDuration)}
            </span>
            <SpeedButton />
          </div>
        </div>

        {needsTrim && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="mb-2 text-xs font-medium text-foreground">
              Escolha onde começa o trecho de {maxDuration}s
            </p>
            <input
              type="range"
              min={0}
              max={maxStart}
              step={0.1}
              value={Math.min(trimStart, maxStart)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setTrimStart(isFinite(v) ? v : 0);
                if (audioRef.current) {
                  try { audioRef.current.currentTime = v; } catch { /* noop */ }
                }
                setPlaybackProgress(0);
              }}
              className="w-full accent-primary"
              aria-label="Início do trecho do áudio"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>0:00</span>
              <span>{formatDuration(total)}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Toque em ▶ para ouvir o trecho antes de salvar.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearRecording}
            className="flex-1"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Descartar
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={isUploading}
            className="flex-1 bg-primary"
          >
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? "Salvando..." : needsTrim ? "Salvar trecho" : "Salvar"}
          </Button>
        </div>
      </div>
    );
  }


  // Existing audio or start recording
  if (existingUrl) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-lg bg-card/50 border border-border/30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayback}
            className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 text-primary" />
            ) : (
              <Play className="h-5 w-5 text-primary ml-0.5" />
            )}
          </Button>
          
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Sua bio em áudio</span>
            </div>
            <Progress value={playbackProgress} className="h-1" />
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDuration(displayDuration)}
            </span>
            <SpeedButton />
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-1.5 w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="min-w-0 px-1.5 sm:px-2 text-[11px] sm:text-xs"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1 shrink-0" />
            <span className="truncate">{isDeleting ? "..." : "Remover"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={startRecording}
            className="min-w-0 px-1.5 sm:px-2 text-[11px] sm:text-xs"
          >
            <Mic className="h-3.5 w-3.5 mr-1 shrink-0" />
            <span className="truncate">Regravar</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePickFile}
            className="min-w-0 px-1.5 sm:px-2 text-[11px] sm:text-xs"
            title={`Enviar arquivo de áudio (até ${maxDuration}s)`}
          >
            <FileAudio className="h-3.5 w-3.5 mr-1 shrink-0" />
            <span className="truncate">Enviar</span>
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  // Initial state - no recording
  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-card/50 border border-border/30 border-dashed">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={startRecording}
          className="h-14 w-14 rounded-full hover:bg-primary/10 hover:border-primary"
          title="Gravar pelo microfone"
        >
          <Mic className="h-6 w-6" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={handlePickFile}
          className="h-14 w-14 rounded-full hover:bg-primary/10 hover:border-primary"
          title="Enviar arquivo de áudio"
        >
          <FileAudio className="h-6 w-6" />
        </Button>
      </div>
      <div className="text-center">
        <p className="font-medium">Adicionar bio em áudio</p>
        <p className="text-xs text-muted-foreground">
          Grave pelo microfone ou envie um arquivo (até {maxDuration} segundos)
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
