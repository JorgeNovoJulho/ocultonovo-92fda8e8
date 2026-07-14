/**
 * MediaLightbox — fullscreen overlay para imagens e vídeos do chat.
 * Mobile-first, com botão de fechar visível e ESC para sair.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { X, Play, Pause, VolumeX, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaLightboxProps {
  url: string;
  type: 'image' | 'video';
  onClose: () => void;
}

export const MediaLightbox = memo(function MediaLightbox({ url, type, onClose }: MediaLightboxProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    if (type !== 'video') return;
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => setPlaying(true)).catch(() => {});
  }, [type]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Close */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="fixed top-4 right-4 z-[10000] h-11 w-11 rounded-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-fuchsia-900/40 ring-2 ring-white/20"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="relative max-w-full max-h-full p-4 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'image' ? (
          <img
            src={url}
            alt=""
            className="block max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] w-auto h-auto object-contain select-none rounded-lg"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
          />
        ) : (
          <>
            <video
              ref={videoRef}
              src={url}
              playsInline
              controls
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onVolumeChange={() => { const v = videoRef.current; if (v) setMuted(v.muted); }}
              className="max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] w-auto h-auto object-contain rounded-lg bg-black"
              onContextMenu={(e) => e.preventDefault()}
            />
            {/* Quick toggles (extra accessibility) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
              <button
                type="button"
                onClick={togglePlay}
                className="h-10 w-10 rounded-full bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white flex items-center justify-center"
                aria-label={playing ? 'Pausar' : 'Reproduzir'}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                aria-label={muted ? 'Ativar som' : 'Mutar'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
