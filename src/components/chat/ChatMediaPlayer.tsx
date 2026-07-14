import { useState, useRef, useCallback, memo, useEffect } from 'react';
import { Play, Pause, VolumeX, Volume2, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface ChatMediaPlayerProps {
  mediaUrl: string;
  mediaType: string;
  isOwnMessage: boolean;
}

// Lightweight CSS watermark overlay
const DrmWatermark = memo(({ username }: { username: string }) => (
  <div
    className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden"
    aria-hidden="true"
  >
    <span
      className="absolute top-1/2 left-1/2 whitespace-nowrap font-mono text-[11px]"
      style={{
        transform: 'translate(-50%, -50%) rotate(-30deg)',
        color: 'rgba(255,255,255,0.2)',
        textShadow: '0 0 2px rgba(0,0,0,0.6)',
        letterSpacing: '1px',
        WebkitTouchCallout: 'none',
      }}
    >
      Oculto Swing · @{username}
    </span>
  </div>
));
DrmWatermark.displayName = 'DrmWatermark';

// Error fallback
const MediaError = memo(() => (
  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground">
    <AlertCircle className="h-4 w-4 shrink-0" />
    <span className="text-xs">Mídia não disponível</span>
  </div>
));
MediaError.displayName = 'MediaError';

// ─── Fullscreen Photo Viewer ────────────────────────────────────────────────
const PhotoFullscreen = memo(({ mediaUrl, username, onClose }: {
  mediaUrl: string;
  username: string;
  onClose: () => void;
}) => {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-auto scrollbar-hide p-4"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="fixed top-4 right-4 z-[10000] w-10 h-10 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 transition-colors"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="relative flex w-full h-full items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img loading="lazy" decoding="async"
          src={mediaUrl}
          alt=""
          className="block w-auto h-auto max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] object-contain select-none rounded-lg"
          style={{ WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        />
        <DrmWatermark username={username} />
      </div>
    </div>
  );
});
PhotoFullscreen.displayName = 'PhotoFullscreen';

// ─── Photo Message ───────────────────────────────────────────────────────────
const PhotoMessage = memo(({ mediaUrl, isOwnMessage, username }: {
  mediaUrl: string;
  isOwnMessage: boolean;
  username: string;
}) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState(false);

  if (error) return <MediaError />;

  return (
    <>
      <div className="relative cursor-pointer" onClick={() => setFullscreen(true)}>
        <img decoding="async"
          src={mediaUrl}
          alt=""
          loading="lazy"
          onError={() => setError(true)}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="rounded-lg max-w-[250px] w-full h-auto object-cover active:opacity-80 transition-opacity select-none pointer-events-none"
          style={{ maxHeight: '250px', WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties}
          draggable={false}
        />
        {/* Transparent overlay to block long-press save */}
        <div
          className="absolute inset-0 z-20 rounded-lg"
          onContextMenu={(e) => e.preventDefault()}
        />
        <DrmWatermark username={username} />
      </div>

      {fullscreen && (
        <PhotoFullscreen
          mediaUrl={mediaUrl}
          username={username}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
});
PhotoMessage.displayName = 'PhotoMessage';

// ─── Audio player ────────────────────────────────────────────────────────────
const SPEED_STEPS = [1, 1.5, 2] as const;
type AudioSpeed = (typeof SPEED_STEPS)[number];

const formatAudioSpeedLabel = (speed: AudioSpeed) => `${speed.toFixed(1)}x`;

const AudioMessage = memo(({ mediaUrl, isOwnMessage }: { mediaUrl: string; isOwnMessage: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState<AudioSpeed>(1);

  const extractDuration = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = audio.duration;
    if (d && isFinite(d) && d > 0) setDuration(d);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setError(true));
    }
  }, [playing]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    if (!duration || !isFinite(duration)) extractDuration();
  }, [duration, extractDuration]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || !isFinite(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_STEPS.indexOf(prev);
      const next = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const formatTime = (s: number) => {
    if (!s || !isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 && isFinite(duration)
    ? Math.min((currentTime / duration) * 100, 100)
    : 0;

  if (error) return <MediaError />;

  return (
    <div
      className={cn(
        "flex items-center gap-2 min-w-[200px] max-w-[270px] p-2 rounded-lg",
        isOwnMessage ? "bg-primary/20" : "bg-muted/50"
      )}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      style={{ touchAction: 'none' }}
    >
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onLoadedMetadata={extractDuration}
        onDurationChange={extractDuration}
        onCanPlay={extractDuration}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          "shrink-0 flex h-8 w-8 items-center justify-center rounded-full",
          isOwnMessage ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground"
        )}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className="h-1.5 rounded-full bg-foreground/10 cursor-pointer"
          onClick={handleSeek}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-100", isOwnMessage ? "bg-primary" : "bg-foreground/40")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[10px] opacity-80 tabular-nums">{formatTime(playing ? currentTime : duration)}</span>
          <button
            type="button"
            onClick={cycleSpeed}
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold tabular-nums transition-colors",
              isOwnMessage
                ? "border-primary-foreground/25 bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border bg-background/80 text-foreground hover:bg-muted"
            )}
            title="Velocidade de reprodução"
            aria-label={`Velocidade atual ${formatAudioSpeedLabel(speed)}`}
          >
            {formatAudioSpeedLabel(speed)}
          </button>
        </div>
      </div>
    </div>
  );
});
AudioMessage.displayName = 'AudioMessage';

// ─── Fullscreen Video Player ─────────────────────────────────────────────────
const VideoFullscreen = memo(({ mediaUrl, username, onClose }: {
  mediaUrl: string;
  username: string;
  onClose: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-hide controls
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    showControls();
    const video = videoRef.current;
    if (video) video.play().then(() => setPlaying(true)).catch(() => {});
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); };
  }, []);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setPlaying(true); } else { video.pause(); setPlaying(false); }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isFinite(video.duration)) setDuration(video.duration);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * duration;
  }, [duration]);

  const handleVolumeChange = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.volume = pct;
    setVolume(pct);
    setMuted(pct === 0);
    video.muted = pct === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const newMuted = !muted;
    video.muted = newMuted;
    setMuted(newMuted);
  }, [muted]);

  const formatTime = (s: number) => {
    if (!s || !isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const effectiveVolume = muted ? 0 : volume;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      onMouseMove={showControls}
      onTouchStart={showControls}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Video */}
      <div className="relative w-full h-full flex items-center justify-center">
        <video preload="none"
          ref={videoRef}
          src={mediaUrl}
          className="max-w-full max-h-full object-contain select-none"
          style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
          playsInline
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setPlaying(false)}
          onClick={togglePlay}
        />
        <DrmWatermark username={username} />
      </div>

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}
      >
        {/* Progress bar */}
        <div className="px-4 pt-6 pb-2">
          <div
            className="h-1.5 rounded-full bg-white/20 cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full rounded-full bg-primary relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-white/60 text-xs">{formatTime(currentTime)}</span>
            <span className="text-white/60 text-xs">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-3 px-4 pb-5">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            {playing
              ? <Pause className="h-5 w-5" />
              : <Play className="h-5 w-5 ml-0.5" />
            }
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={toggleMute}
              className="text-white/80 hover:text-white transition-colors"
            >
              {muted || effectiveVolume === 0
                ? <VolumeX className="h-4 w-4" />
                : <Volume2 className="h-4 w-4" />
              }
            </button>
            <div
              className="w-24 h-1.5 rounded-full bg-white/20 cursor-pointer"
              onClick={handleVolumeChange}
            >
              <div
                className="h-full rounded-full bg-white/70"
                style={{ width: `${effectiveVolume * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Close Button */}
      <button
        onClick={onClose}
        className={cn(
          "absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 transition-all duration-300",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
});
VideoFullscreen.displayName = 'VideoFullscreen';

// ─── Video Message (thumbnail in chat) ───────────────────────────────────────
const VideoMessage = memo(({ mediaUrl, username }: { mediaUrl: string; username: string }) => {
  const [error, setError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  if (error) return <MediaError />;

  return (
    <>
      <div
        className="relative cursor-pointer group"
        onClick={() => setFullscreen(true)}
      >
        <video
          src={mediaUrl}
          preload="metadata"
          playsInline
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onError={() => setError(true)}
          className="rounded-lg max-w-[250px] w-full h-auto pointer-events-none"
          style={{ WebkitTouchCallout: 'none', maxHeight: '200px', objectFit: 'cover' } as React.CSSProperties}
        />
        {/* Play overlay */}
        <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
          <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="h-6 w-6 text-white ml-1" />
          </div>
        </div>
        <DrmWatermark username={username} />
      </div>

      {fullscreen && (
        <VideoFullscreen
          mediaUrl={mediaUrl}
          username={username}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
});
VideoMessage.displayName = 'VideoMessage';

// ─── Main export ─────────────────────────────────────────────────────────────
export const ChatMediaPlayer = memo(({ mediaUrl, mediaType, isOwnMessage }: ChatMediaPlayerProps) => {
  const { user } = useAuth();
  const username = user?.user_metadata?.username || user?.user_metadata?.name || user?.id?.slice(0, 8) || 'anon';

  if (!mediaUrl) return null;

  const type = (mediaType || '').toLowerCase();

  if (type.startsWith('audio') || type === 'audio') {
    return <AudioMessage mediaUrl={mediaUrl} isOwnMessage={isOwnMessage} />;
  }

  if (type.startsWith('video') || type === 'video') {
    return <VideoMessage mediaUrl={mediaUrl} username={username} />;
  }

  return <PhotoMessage mediaUrl={mediaUrl} isOwnMessage={isOwnMessage} username={username} />;
});
ChatMediaPlayer.displayName = 'ChatMediaPlayer';
