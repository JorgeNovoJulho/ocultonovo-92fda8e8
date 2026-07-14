/**
 * PlayTopByKindStrip — Etapa 55
 * Carrossel horizontal "Top da semana" para um kind específico.
 * Para áudios, o card mostra a capa com skeleton + cache compartilhado e
 * inicia o preview do snippet (preview_start..preview_end, ≤30s) ao entrar
 * em viewport, usando o mesmo coordenador do feed (apenas 1 preview por vez).
 */
import { useEffect, useRef, useState } from 'react';
import { Flame, Headphones, Image as ImageIcon, Pause, Play } from 'lucide-react';
import { useOcultoPlayTopByKind } from '@/hooks/useOcultoPlayExtras';
import {
  claimPreviewSlot,
  releasePreviewSlot,
} from '@/lib/ocultoPlayPreviewCoordinator';
import { preparePreviewAudioForPlayback, prefetchPreviewAudio } from '@/lib/ocultoPlayPreviewCache';
import { CachedThumbImg } from '@/components/oculto-play/CachedThumbImg';
import { cn } from '@/lib/utils';

interface Props {
  kind: 'meme' | 'audio' | 'short_video';
  onOpen?: (itemId: string) => void;
  className?: string;
}

const META = {
  meme:        { label: 'Top Memes da semana',  icon: ImageIcon },
  audio:       { label: 'Top Áudios da semana', icon: Headphones },
  short_video: { label: 'Top Vídeos da semana', icon: Flame },
} as const;

interface TopItemLike {
  id: string;
  title: string | null;
  thumb_url: string | null;
  audio_url: string | null;
  audio_preview_url?: string | null;
  view_count: number;
  recent_reactions: number;
  preview_start_seconds?: number | null;
  preview_end_seconds?: number | null;
}

function TopCover({ url, title, fallbackIcon: Icon }: { url: string | null; title: string | null; fallbackIcon: React.ComponentType<{ className?: string }> }) {
  if (!url) {
    return (
      <div className="absolute inset-0 grid place-items-center text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
    );
  }
  return (
    <CachedThumbImg
      src={url}
      alt={title ?? ''}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

function TopAudioCard({ it, idx, onOpen }: { it: TopItemLike; idx: number; onOpen?: (id: string) => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const suppressNextClickRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const start = Math.max(0, Number(it.preview_start_seconds ?? 0));
  const rawEnd = Number(it.preview_end_seconds ?? 0);
  const end = rawEnd > start ? Math.min(rawEnd, start + 30) : start + 30;
  const audioSrc = it.audio_preview_url || it.audio_url;
  const clipStart = it.audio_preview_url ? 0 : start;
  const clipEnd = it.audio_preview_url ? 30 : end;

  // PREFETCH no viewport: ao entrar na tela, pré-carrega o snippet (≤30s)
  // para que o clique no botão seja praticamente instantâneo. Sem autoplay.
  useEffect(() => {
    if (!ref.current || !audioSrc) return;
    const el = ref.current;
    let prefetched = false;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      if (e.isIntersecting) {
        if (!prefetched) {
          prefetched = true;
          const run = () => { try { prefetchPreviewAudio(audioSrc, clipStart, clipEnd); } catch { /* noop */ } };
          if (typeof (window as any).requestIdleCallback === 'function') {
            (window as any).requestIdleCallback(run, { timeout: 600 });
          } else {
            setTimeout(run, 80);
          }
        }
      } else {
        const a = audioRef.current;
        if (a && !a.paused) { try { a.pause(); } catch { /* noop */ } }
      }
    }, { threshold: [0, 0.6, 1] });
    io.observe(el);
    return () => {
      io.disconnect();
      const a = audioRef.current;
      if (a && !a.paused) return;
      if (a) { try { a.pause(); } catch { /* noop */ } }
      releasePreviewSlot(a);
      audioRef.current = null;
    };
  }, [audioSrc, clipStart, clipEnd]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let a = audioRef.current;
    if (!a && audioSrc) {
      a = preparePreviewAudioForPlayback(audioSrc, clipStart, clipEnd);
      a.preload = 'auto';
      a.muted = false;
      a.addEventListener('timeupdate', () => {
        if (!a) return;
        if (a.currentTime >= clipEnd) {
          try { a.pause(); a.currentTime = clipStart; } catch { /* noop */ }
          setPlaying(false);
        }
      });
      a.addEventListener('pause', () => setPlaying(false));
      a.addEventListener('ended', () => setPlaying(false));
      audioRef.current = a;
    }
    if (!a) return;
    if (a.paused) {
      setPlaying(true);
      claimPreviewSlot(a);
      try { if (a.currentTime < clipStart || a.currentTime >= clipEnd) a.currentTime = clipStart; } catch { /* noop */ }
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      try { a.pause(); } catch { /* noop */ }
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen?.(it.id)}
      className="relative shrink-0 w-28 aspect-[3/4] rounded-lg overflow-hidden bg-muted/30 border border-border/30 hover:border-fuchsia-400/60 transition-colors text-left"
    >
      <TopCover url={it.thumb_url} title={it.title} fallbackIcon={Headphones} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute top-1 left-1 text-[10px] font-bold bg-amber-400/90 text-black rounded px-1.5">
        #{idx + 1}
      </div>
      <button
        type="button"
        onPointerDown={(e) => {
          suppressNextClickRef.current = true;
          e.preventDefault();
          e.stopPropagation();
          togglePlay(e as unknown as React.MouseEvent);
        }}
        onClick={(e) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          togglePlay(e);
        }}
        className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-fuchsia-500/85 hover:bg-fuchsia-500 text-white shadow"
        title={playing ? 'Pausar preview' : 'Tocar preview'}
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" fill="currentColor" />}
      </button>
      {playing && (
        <span className="absolute bottom-7 left-1 inline-flex items-center gap-1 text-[8px] uppercase tracking-wide bg-fuchsia-500/85 text-white px-1 py-[1px] rounded font-semibold">
          <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
          Preview
        </span>
      )}
      <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white">
        <div className="truncate font-medium">{it.title || 'Sem título'}</div>
        <div className="truncate opacity-80">
          {it.view_count} views · {it.recent_reactions} reações
        </div>
      </div>
    </button>
  );
}

function TopSimpleCard({ it, idx, onOpen, Icon }: { it: TopItemLike; idx: number; onOpen?: (id: string) => void; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(it.id)}
      className="relative shrink-0 w-28 aspect-[3/4] rounded-lg overflow-hidden bg-muted/30 border border-border/30 hover:border-fuchsia-400/60 transition-colors text-left"
    >
      <TopCover url={it.thumb_url} title={it.title} fallbackIcon={Icon} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute top-1 left-1 text-[10px] font-bold bg-amber-400/90 text-black rounded px-1.5">
        #{idx + 1}
      </div>
      <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white">
        <div className="truncate font-medium">{it.title || 'Sem título'}</div>
        <div className="truncate opacity-80">
          {it.view_count} views · {it.recent_reactions} reações
        </div>
      </div>
    </button>
  );
}

export function PlayTopByKindStrip({ kind, onOpen, className }: Props) {
  const { data = [], isLoading } = useOcultoPlayTopByKind(kind, 7);
  const meta = META[kind];
  const Icon = meta.icon;

  if (isLoading) {
    return (
      <section className={cn('space-y-2', className)}>
        <header className="flex items-center gap-2 px-1">
          <Icon className="h-4 w-4 text-fuchsia-300" />
          <h3 className="text-sm font-semibold">{meta.label}</h3>
        </header>
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
          {[0,1,2,3].map((i) => (
            <div key={i} className="shrink-0 w-28 aspect-[3/4] rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (data.length === 0) return null;

  return (
    <section className={cn('space-y-2', className)}>
      <header className="flex items-center gap-2 px-1">
        <Icon className="h-4 w-4 text-fuchsia-300" />
        <h3 className="text-sm font-semibold">{meta.label}</h3>
        <span className="text-[10px] text-muted-foreground">últimos 7 dias</span>
      </header>
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {data.slice(0, 15).map((it, idx) => (
          kind === 'audio'
            ? <TopAudioCard key={it.id} it={it as TopItemLike} idx={idx} onOpen={onOpen} />
            : <TopSimpleCard key={it.id} it={it as TopItemLike} idx={idx} onOpen={onOpen} Icon={Icon} />
        ))}
      </div>
    </section>
  );
}
