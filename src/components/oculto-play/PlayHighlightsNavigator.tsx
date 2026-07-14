/**
 * PlayHighlightsNavigator — Etapa 48
 *
 * Overlay flutuante que permite ao espectador pular para o próximo
 * highlight do item (capítulos kind='highlight'), exibindo o índice
 * atual (ex.: "Highlight 2/5"). Frontend-only, reaproveita a lista
 * já carregada por useOcultoPlayChapters.
 */
import { useEffect, useState } from 'react';
import { Sparkles, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlayDbChapter } from '@/hooks/useOcultoPlayChapters';

interface Props {
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  chapters: PlayDbChapter[];
  hidden?: boolean;
}

export function PlayHighlightsNavigator({ mediaRef, chapters, hidden }: Props) {
  const highlights = chapters.filter(c => c.kind === 'highlight').sort((a, b) => a.start - b.start);
  const [currentIdx, setCurrentIdx] = useState(-1);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || highlights.length === 0) return;
    let last = -1;
    const onTime = () => {
      const t = el.currentTime || 0;
      let idx = -1;
      for (let i = 0; i < highlights.length; i++) {
        if (t >= highlights[i].start) idx = i;
      }
      if (idx !== last) {
        last = idx;
        setCurrentIdx(idx);
      }
    };
    let raf = 0;
    const throttled = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; onTime(); });
    };
    el.addEventListener('timeupdate', throttled);
    onTime();
    return () => {
      el.removeEventListener('timeupdate', throttled);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mediaRef, highlights.length]);

  if (highlights.length === 0 || hidden) return null;

  const nextIdx = highlights.findIndex(h => {
    const el = mediaRef.current;
    const t = el?.currentTime ?? 0;
    return h.start > t + 0.25;
  });

  const handleJump = () => {
    const el = mediaRef.current;
    if (!el) return;
    const target = nextIdx >= 0 ? highlights[nextIdx] : highlights[0];
    el.currentTime = target.start;
    el.play?.().catch(() => {});
  };

  const displayCurrent = currentIdx >= 0 ? currentIdx + 1 : 0;

  return (
    <div
      data-no-gesture
      className={cn(
        'absolute top-20 right-3 z-30 flex flex-col items-end gap-1 pointer-events-auto',
      )}
    >
      <button
        onClick={handleJump}
        className={cn(
          'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
          'bg-fuchsia-500/80 hover:bg-fuchsia-500 text-white shadow-lg backdrop-blur',
          'transition-colors',
        )}
        title="Pular para o próximo highlight"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {nextIdx >= 0 ? 'Próximo highlight' : 'Rever highlights'}
        <SkipForward className="h-3.5 w-3.5" />
      </button>
      <div className="text-[10px] text-white/80 bg-black/40 rounded-full px-2 py-0.5 backdrop-blur">
        Highlight {displayCurrent}/{highlights.length}
      </div>
    </div>
  );
}
