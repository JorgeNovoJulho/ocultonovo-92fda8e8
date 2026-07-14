/**
 * PresencePulseStrip — tira leve com até 3 sinais discretos.
 * Sem identidades. Sem coordenadas. Auto-rotaciona a cada 6s.
 * Render flat, mobile-first, ≤56px de altura.
 */
import { useEffect, useState } from 'react';
import { Sparkles, Eye, Wind, Flame } from 'lucide-react';
import { usePresenceSignals, PRESENCE_COPY, type PresenceSignalType } from '@/social-universe/presence';
import { cn } from '@/lib/utils';

const ICONS: Record<PresenceSignalType, React.ComponentType<{ className?: string }>> = {
  profile_observed: Eye,
  aura_passed_near: Wind,
  attention_received: Sparkles,
  almost_interacted: Sparkles,
  rare_presence_detected: Flame,
  room_energy_shift: Wind,
  hidden_interest_signal: Eye,
};

export function PresencePulseStrip({ className }: { className?: string }) {
  const { signals } = usePresenceSignals(6);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (signals.length <= 1) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % signals.length), 6000);
    return () => window.clearInterval(id);
  }, [signals.length]);

  if (!signals.length) return null;

  const s = signals[idx % signals.length];
  const Icon = ICONS[s.signal_type] ?? Sparkles;
  const glow = s.is_premium_hint ? '40 95% 60%' : '270 80% 65%';

  return (
    <div
      className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs', className)}
      style={{
        background: `linear-gradient(90deg, hsl(${glow} / 0.10), transparent)`,
        borderColor: `hsl(${glow} / 0.35)`,
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: `hsl(${glow})` }} />
      <span className="truncate text-foreground/90">{PRESENCE_COPY[s.signal_type]}</span>
      <span className="ml-auto text-[10px] text-muted-foreground">agora</span>
    </div>
  );
}
