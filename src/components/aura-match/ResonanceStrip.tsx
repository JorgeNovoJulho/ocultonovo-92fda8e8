/**
 * ResonanceStrip — chip discreto exibido no topo do chat da sala
 * quando há uma ressonância pública ativa. Anônimo (não revela usuários).
 *
 * Performance:
 *  - Sem canvas, sem framer pesado, apenas CSS pulse.
 *  - Respeita prefers-reduced-motion (fade simples).
 */
import { memo, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { ResonanceEvent } from '@/hooks/useAuraResonance';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/utils';

interface Props {
  event: ResonanceEvent | null;
  phrases: string[];
  onDismiss?: () => void;
}

export const ResonanceStrip = memo(function ResonanceStrip({ event, phrases, onDismiss }: Props) {
  const reduced = usePrefersReducedMotion();
  const phrase = useMemo(() => {
    if (!event) return '';
    if (!phrases.length) return '✨ Ressonância detectada';
    // determinístico pelo id para ficar estável durante a vida do evento
    const idx = Math.abs(hash(event.id)) % phrases.length;
    return phrases[idx];
  }, [event?.id, phrases]);

  if (!event) return null;
  const intensity = Math.max(1, Math.min(5, event.intensity || 1));

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className={cn(
        'mx-auto my-1 flex w-fit items-center gap-1.5 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] text-fuchsia-100 backdrop-blur-sm cursor-pointer',
        !reduced && 'animate-pulse',
      )}
      style={{ boxShadow: `0 0 ${4 + intensity * 2}px hsla(290,90%,60%,0.${20 + intensity * 5})` }}
    >
      <Sparkles className="h-3 w-3 text-fuchsia-300" />
      <span>{phrase}</span>
    </div>
  );
});

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return h;
}
