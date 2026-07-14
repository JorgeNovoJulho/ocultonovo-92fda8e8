import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getChatVideoAudioState,
  setChatVideoAudioState,
} from './chatVideoAudio';
import type { ChatVideoAudioState } from './types';

export const ChatVideoPlayer = memo(function ChatVideoPlayer({
  src,
  isMine,
}: {
  src: string;
  isMine: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const applyingAudioStateRef = useRef(false);
  const [audioState, setAudioState] = useState<ChatVideoAudioState>(() => getChatVideoAudioState());

  const persistAudioState = useCallback((nextState: ChatVideoAudioState) => {
    const normalized = setChatVideoAudioState(nextState);
    setAudioState(normalized);
  }, []);

  const applyAudioState = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    applyingAudioStateRef.current = true;
    video.defaultMuted = audioState.muted;
    video.muted = audioState.muted;
    video.volume = audioState.volume;
    video.defaultPlaybackRate = 1;
    window.setTimeout(() => {
      applyingAudioStateRef.current = false;
    }, 0);
  }, [audioState]);

  const handleVolumeChange = useCallback(() => {
    const video = videoRef.current;
    if (!video || applyingAudioStateRef.current) return;
    const nextVolume = video.volume > 0 ? video.volume : audioState.volume;
    persistAudioState({
      muted: video.muted || video.volume === 0,
      volume: Math.min(1, Math.max(0.05, nextVolume)),
    });
  }, [audioState.volume, persistAudioState]);

  useEffect(() => {
    applyAudioState();
  }, [src, applyAudioState]);

  return (
    <div className={cn('rounded-2xl overflow-hidden mb-1', isMine ? 'rounded-tr-sm' : 'rounded-tl-sm')}>
      <div className="relative">
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="max-w-full max-h-[300px] rounded-2xl bg-background"
          onLoadedMetadata={applyAudioState}
          onCanPlay={applyAudioState}
          onPlay={applyAudioState}
          onVolumeChange={handleVolumeChange}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div
          className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm"
          aria-hidden="true"
        >
          <Volume2 className="h-3 w-3 text-primary" />
          <span>Som ligado {Math.round(audioState.volume * 100)}%</span>
        </div>
      </div>
    </div>
  );
});
