import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  isMine?: boolean;
  duration?: number;
}

const SPEED_STEPS = [1, 1.5, 2] as const;
type Speed = (typeof SPEED_STEPS)[number];

const formatSpeedLabel = (speed: Speed) => `${speed.toFixed(1)}x`;

/**
 * Resolve a duração real de áudios (especialmente WebM gravados pelo MediaRecorder,
 * que reportam Infinity até serem totalmente "scaneados").
 * Faz seek para o final → o navegador recalcula a duração corretamente.
 */
function resolveDuration(audio: HTMLAudioElement): Promise<number> {
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
    try {
      audio.currentTime = 1e101;
    } catch {
    }
    setTimeout(() => {
      audio.removeEventListener('durationchange', handler);
      resolve(audio.duration && isFinite(audio.duration) ? audio.duration : 0);
    }, 1500);
  });
}

export const AudioPlayer = memo(function AudioPlayer({ src, isMine = false, duration: initialDuration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(initialDuration && isFinite(initialDuration) ? initialDuration : 0);
  const [speed, setSpeed] = useState<Speed>(1);

  useEffect(() => {
    if (audioRef.current) return;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audio.src = src;
    audio.playbackRate = speed;

    const onTime = () => setCurrent(audio.currentTime);
    const onEnded = () => { setPlaying(false); setCurrent(0); };
    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);
    audio.addEventListener('canplay', onDurationChange);
    audioRef.current = audio;

    audio.load();
    resolveDuration(audio).then((d) => {
      if (d && isFinite(d)) setDuration(d);
    });

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
      audio.removeEventListener('canplay', onDurationChange);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [src, speed]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (!duration || !isFinite(duration)) {
        const d = await resolveDuration(audio);
        if (d) setDuration(d);
      }
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [playing, duration]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_STEPS.indexOf(prev);
      const next = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || !isFinite(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = pct * duration;
    setCurrent(audio.currentTime);
  }, [duration]);

  const formatTime = useCallback((s: number) => {
    if (!s || !isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  const progress = duration > 0 && isFinite(duration) ? Math.min((currentTime / duration) * 100, 100) : 0;
  const displayTime = playing || currentTime > 0 ? currentTime : duration;

  return (
    <div className={cn(
      "flex items-center gap-2 min-w-[200px] max-w-[280px] px-3 py-2 rounded-2xl",
      isMine ? "bg-primary text-primary-foreground" : "bg-muted"
    )}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isMine ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" : "bg-foreground/10 hover:bg-foreground/20"
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div
          className="h-1 rounded-full bg-foreground/20 overflow-hidden cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-100", isMine ? "bg-primary-foreground/60" : "bg-primary")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] opacity-80 tabular-nums">{formatTime(displayTime)}</span>
          <button
            type="button"
            onClick={cycleSpeed}
            title="Velocidade de reprodução"
            aria-label={`Velocidade atual ${formatSpeedLabel(speed)}`}
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold tabular-nums transition-colors",
              isMine
                ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
                : "border-border bg-background/80 text-foreground hover:bg-muted"
            )}
          >
            {formatSpeedLabel(speed)}
          </button>
        </div>
      </div>
    </div>
  );
});
