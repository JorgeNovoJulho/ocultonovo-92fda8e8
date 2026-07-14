import { memo, useEffect, useState } from 'react';
import type { AuraEventState } from '@/lib/auraEvents';

interface Props {
  event: AuraEventState;
}

/**
 * Banner social dinâmico no topo do Aura Match.
 * - Aparece quando há um evento ativo (kind != null).
 * - Auto-desaparece após ~10s, mas reaparece se o evento mudar.
 * - Não bloqueia interação (pointer-events-none).
 */
export const AuraSocialBanner = memo(function AuraSocialBanner({ event }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!event.kind) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 10_000);
    return () => window.clearTimeout(t);
  }, [event.kind, event.message]);

  if (!event.kind) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex justify-center"
      style={{ minHeight: 32 }}
    >
      <div
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold backdrop-blur-md transition-all duration-500"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-6px)',
          borderColor: `hsla(${event.hue}, 90%, 60%, 0.55)`,
          background: `linear-gradient(135deg, hsla(${event.hue}, 85%, 30%, 0.55), hsla(${(event.hue + 30) % 360}, 85%, 25%, 0.55))`,
          boxShadow: `0 0 14px hsla(${event.hue}, 90%, 55%, 0.35)`,
          color: `hsl(${event.hue}, 90%, 88%)`,
        }}
      >
        <span aria-hidden>{event.emoji}</span>
        <span>{event.message}</span>
      </div>
    </div>
  );
});
