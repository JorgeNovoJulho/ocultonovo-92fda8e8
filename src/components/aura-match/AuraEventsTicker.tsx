import { memo, useEffect, useState } from 'react';
import { Flame, Heart, Zap, Sparkles, Eye } from 'lucide-react';

interface Props {
  auraCount: number;
  highAffinityCount: number;
  tier: 'low' | 'medium' | 'high';
}

type Evt = {
  id: number;
  icon: React.ReactNode;
  text: string;
  hue: number;
};

/**
 * Etapa 11 — Eventos sociais flutuantes.
 * 100% CSS, sem realtime, sem rAF. Um evento por vez, troca a cada ~7s.
 * Em tier=low fica desativado para preservar performance.
 */
const POOL = (count: number, hi: number): Omit<Evt, 'id'>[] => [
  { icon: <Flame className="h-3.5 w-3.5" />, text: `Energia alta perto de você`, hue: 18 },
  { icon: <Heart className="h-3.5 w-3.5" />, text: `Alguém olhou seu perfil`, hue: 330 },
  { icon: <Zap className="h-3.5 w-3.5" />, text: `Tentaram chamar sua atenção`, hue: 50 },
  { icon: <Sparkles className="h-3.5 w-3.5" />, text: `${count} auras vibrando agora`, hue: 280 },
  { icon: <Eye className="h-3.5 w-3.5" />, text: `${Math.max(1, hi)} química rara por perto`, hue: 135 },
];

export const AuraEventsTicker = memo(function AuraEventsTicker({
  auraCount,
  highAffinityCount,
  tier,
}: Props) {
  const [evt, setEvt] = useState<Evt | null>(null);

  useEffect(() => {
    if (tier === 'low' || auraCount === 0) {
      setEvt(null);
      return;
    }
    const pool = POOL(auraCount, highAffinityCount);
    let i = Math.floor(Math.random() * pool.length);
    const rotate = () => {
      i = (i + 1) % pool.length;
      setEvt({ ...pool[i], id: Date.now() });
    };
    // primeira aparição com pequeno atraso
    const t0 = window.setTimeout(rotate, 1500);
    const t1 = window.setInterval(rotate, 7000);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(t1);
    };
  }, [auraCount, highAffinityCount, tier]);

  if (!evt) return null;

  return (
    <div
      key={evt.id}
      className="pointer-events-none absolute left-1/2 bottom-3 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur-md"
      style={{
        borderColor: `hsla(${evt.hue}, 90%, 60%, 0.55)`,
        background: `linear-gradient(135deg, hsla(${evt.hue}, 90%, 30%, 0.55), hsla(${evt.hue + 30}, 90%, 25%, 0.55))`,
        boxShadow: `0 0 14px hsla(${evt.hue}, 90%, 55%, 0.35)`,
        animation: 'aura-emerge 500ms ease-out, aura-pulse 6s ease-in-out 0.5s infinite',
        willChange: 'transform, opacity',
      }}
    >
      <span style={{ color: `hsl(${evt.hue}, 90%, 70%)` }}>{evt.icon}</span>
      <span>{evt.text}</span>
    </div>
  );
});
