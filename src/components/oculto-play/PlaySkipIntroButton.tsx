/**
 * PlaySkipIntroButton — Etapa 46
 *
 * Botão flutuante que aparece quando o tempo atual da mídia está
 * dentro de um capítulo do tipo "intro" (ou "recap"). Ao clicar,
 * salta para `end_seconds` daquele capítulo.
 *
 * Performance: usa requestAnimationFrame com throttle de 500ms para
 * não pressionar o thread principal (regra Mobile <4GB).
 */
import { useEffect, useRef, useState } from 'react';
import { SkipForward } from 'lucide-react';
import type { PlayDbChapter } from '@/hooks/useOcultoPlayChapters';

interface Props {
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  chapters: PlayDbChapter[];
  hidden?: boolean;
}

export function PlaySkipIntroButton({ mediaRef, chapters, hidden }: Props) {
  const [active, setActive] = useState<PlayDbChapter | null>(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || chapters.length === 0) { setActive(null); return; }

    const relevant = chapters.filter(
      c => (c.kind === 'intro' || c.kind === 'recap') && c.end != null && c.end > c.start,
    );
    if (relevant.length === 0) { setActive(null); return; }

    const check = () => {
      const now = performance.now();
      if (now - lastTickRef.current < 500) return;
      lastTickRef.current = now;
      const t = el.currentTime || 0;
      const found = relevant.find(c => t >= c.start && t < (c.end as number));
      setActive(prev => (prev?.id === found?.id ? prev : found ?? null));
    };

    el.addEventListener('timeupdate', check);
    return () => { el.removeEventListener('timeupdate', check); };
  }, [mediaRef, chapters]);

  if (!active || hidden) return null;

  const label = active.kind === 'recap' ? 'Pular recap' : 'Pular intro';

  return (
    <button
      data-no-gesture
      onClick={() => {
        const el = mediaRef.current;
        if (el && active.end != null) {
          el.currentTime = active.end + 0.05;
        }
      }}
      className="absolute bottom-32 right-4 z-40 inline-flex items-center gap-1.5
                 rounded-full bg-white/90 hover:bg-white text-black
                 text-[12px] font-semibold px-3 py-1.5 shadow-lg
                 animate-in fade-in slide-in-from-right-2 duration-200"
    >
      <SkipForward className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
