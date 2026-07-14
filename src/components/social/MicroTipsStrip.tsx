/**
 * MicroTipsStrip — tira leve de dicas para o usuário (filtradas por nível no DB).
 * Anti-spam: 1 dica por sessão, dismissable persistido em localStorage por 7 dias.
 * Performance: flat design, sem animações pesadas, render condicional.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Users, Radar, Sparkles, Gift, Crown, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInitialExperienceItems } from '@/hooks/useInitialExperience';

const HIDE_KEY = 'oculto_microtip_hide_v1';
const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

const ICONS: Record<string, any> = { users: Users, radar: Radar, sparkles: Sparkles, gift: Gift, crown: Crown, banknote: Banknote };

function isHidden(id: string): boolean {
  try {
    const raw = localStorage.getItem(`${HIDE_KEY}:${id}`);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts < Date.now()) {
      localStorage.removeItem(`${HIDE_KEY}:${id}`);
      return false;
    }
    return true;
  } catch { return false; }
}

function hide(id: string) {
  try { localStorage.setItem(`${HIDE_KEY}:${id}`, String(Date.now() + HIDE_MS)); } catch {}
}

export function MicroTipsStrip() {
  const { data: items } = useInitialExperienceItems();
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  const tip = useMemo(() => {
    const tips = (items ?? []).filter(i => i.kind === 'tip' && !isHidden(i.id));
    if (!tips.length) return null;
    // rotaciona com base no dia para não repetir igual sempre
    const idx = (Math.floor(Date.now() / (1000 * 60 * 60 * 6)) + tick) % tips.length;
    return tips[idx];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tick]);

  if (!tip) return null;
  const Icon = (tip.icon && ICONS[tip.icon]) || Sparkles;

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-xs"
      style={{ borderLeftColor: `hsl(${tip.hue} 80% 60%)`, borderLeftWidth: 3 }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: `hsl(${tip.hue} 80% 65%)` }} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{tip.title}</div>
        {tip.body && <div className="text-muted-foreground truncate">{tip.body}</div>}
      </div>
      {tip.cta_label && tip.cta_route && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0"
          onClick={() => navigate(tip.cta_route!)}>
          {tip.cta_label}
        </Button>
      )}
      <button
        aria-label="Dispensar"
        className="text-muted-foreground hover:text-foreground shrink-0"
        onClick={() => { hide(tip.id); setTick(t => t + 1); }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
