/**
 * Player moderno e leve para vídeo + áudio do Diário VIP.
 * - Volume, mute, velocidade (0.5/1/1.25/1.5/2x)
 * - Rotação 90° (apenas vídeo)
 * - Sem libs externas; foco em performance em celulares antigos
 */
import { memo, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Play, Pause, Volume2, VolumeX, RotateCw, Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  src: string;
  kind: "video" | "audio";
  className?: string;
  poster?: string;
  /** Para baixa memória: lazy-load até o usuário interagir. */
  lazy?: boolean;
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

function DiaryMediaPlayerImpl({ src, kind, className, poster, lazy = true }: Props) {
  const elRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [activated, setActivated] = useState(!lazy);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, [activated]);

  const toggle = () => {
    const el = elRef.current;
    if (!el) return;
    if (el.paused) { el.play().then(() => setPlaying(true)).catch(() => {}); }
    else { el.pause(); setPlaying(false); }
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = elRef.current;
    if (!el) return;
    el.currentTime = Number(e.target.value);
  };

  const onVol = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVol(v);
    if (elRef.current) elRef.current.volume = v;
    if (v > 0 && muted) { setMuted(false); if (elRef.current) elRef.current.muted = false; }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (elRef.current) elRef.current.muted = next;
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    if (elRef.current) elRef.current.playbackRate = next;
  };

  const fmt = (t: number) => {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!activated) {
    return (
      <button
        type="button"
        onClick={() => setActivated(true)}
        className={cn(
          "relative w-full rounded-lg overflow-hidden border border-border bg-black/40",
          "flex items-center justify-center text-white",
          kind === "video" ? "aspect-video" : "h-16",
          className,
        )}
        style={poster ? { backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex items-center gap-2 text-sm font-medium">
          <Play className="h-5 w-5" /> {kind === "video" ? "Tocar vídeo" : "Tocar áudio"}
        </div>
      </button>
    );
  }

  return (
    <div className={cn("rounded-lg overflow-hidden border border-border bg-black/60", className)}>
      {kind === "video" ? (
        <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
          <video
            ref={elRef as any}
            src={src}
            poster={poster}
            playsInline
            preload="metadata"
            className="w-full h-full object-contain transition-transform duration-200"
            style={{ transform: `rotate(${rotation}deg)` }}
            onClick={toggle}
          />
        </div>
      ) : (
        <audio ref={elRef as any} src={src} preload="metadata" className="hidden" />
      )}

      <div className="p-2 space-y-2 bg-background/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggle} aria-label={playing ? "Pausar" : "Tocar"}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={onSeek}
            className="flex-1 h-1 accent-amber-400"
            aria-label="Posição"
          />
          <span className="text-[10px] tabular-nums text-muted-foreground min-w-[64px] text-right">
            {fmt(current)} / {fmt(duration)}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={toggleMute} aria-label="Mudo">
            {muted || vol === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : vol}
            onChange={onVol}
            className="w-20 h-1 accent-amber-400"
            aria-label="Volume"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] font-semibold gap-1"
            onClick={cycleSpeed}
            aria-label="Velocidade"
          >
            <Gauge className="h-3 w-3" /> {speed}x
          </Button>
          {kind === "video" && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Girar 90°"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export const DiaryMediaPlayer = memo(DiaryMediaPlayerImpl);
export default DiaryMediaPlayer;
