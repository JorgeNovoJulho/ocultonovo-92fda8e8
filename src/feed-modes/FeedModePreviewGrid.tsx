/**
 * Mini-previews SVG dos modos de feed usados no Onboarding.
 * Cada card mostra um wireframe abstrato + botão "Experimentar"
 * que aplica o modo imediatamente e fecha o tour.
 */
import { useNavigate } from 'react-router-dom';
import { Lock, Crown, Check } from 'lucide-react';
import { useFeedMode } from './FeedModeProvider';
import type { FeedModeId } from './modes.config';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  onApplied?: () => void;
}

function PreviewSVG({ id }: { id: FeedModeId }) {
  // wireframes leves (sem assets, sem deps)
  const stroke = 'hsl(var(--border))';
  const fill = 'hsl(var(--muted))';
  const accent = 'hsl(var(--primary))';
  const r = 2;

  switch (id) {
    case 'completo':
      return (
        <svg viewBox="0 0 80 56" className="w-full h-full">
          <rect x="2" y="2" width="76" height="6" rx={r} fill={accent} opacity=".5" />
          <rect x="2" y="11" width="76" height="4" rx={r} fill={fill} />
          <rect x="2" y="18" width="36" height="16" rx={r} fill={fill} stroke={stroke} />
          <rect x="42" y="18" width="36" height="16" rx={r} fill={fill} stroke={stroke} />
          <rect x="2" y="38" width="76" height="16" rx={r} fill={fill} stroke={stroke} />
        </svg>
      );
    case 'social':
      return (
        <svg viewBox="0 0 80 56" className="w-full h-full">
          <circle cx="8" cy="8" r="4" fill={accent} opacity=".7" />
          <circle cx="20" cy="8" r="4" fill={fill} stroke={stroke} />
          <circle cx="32" cy="8" r="4" fill={fill} stroke={stroke} />
          <circle cx="44" cy="8" r="4" fill={fill} stroke={stroke} />
          <rect x="2" y="16" width="76" height="18" rx={r} fill={fill} stroke={stroke} />
          <rect x="2" y="38" width="76" height="16" rx={r} fill={fill} stroke={stroke} />
        </svg>
      );
    case 'descoberta':
      return (
        <svg viewBox="0 0 80 56" className="w-full h-full">
          <circle cx="40" cy="20" r="14" fill="none" stroke={accent} strokeWidth="1.2" opacity=".7" />
          <circle cx="40" cy="20" r="8" fill="none" stroke={accent} strokeWidth="1.2" opacity=".5" />
          <circle cx="40" cy="20" r="2" fill={accent} />
          <rect x="2" y="38" width="36" height="16" rx={r} fill={fill} stroke={stroke} />
          <rect x="42" y="38" width="36" height="16" rx={r} fill={fill} stroke={stroke} />
        </svg>
      );
    case 'limpo':
      return (
        <svg viewBox="0 0 80 56" className="w-full h-full">
          <rect x="6" y="6" width="68" height="14" rx={r} fill={fill} stroke={stroke} />
          <rect x="6" y="22" width="68" height="14" rx={r} fill={fill} stroke={stroke} />
          <rect x="6" y="38" width="68" height="14" rx={r} fill={fill} stroke={stroke} />
        </svg>
      );
    case 'card':
      return (
        <svg viewBox="0 0 80 56" className="w-full h-full">
          <rect x="2" y="2"  width="24" height="24" rx={r} fill={fill} stroke={stroke} />
          <rect x="28" y="2" width="24" height="24" rx={r} fill={fill} stroke={stroke} />
          <rect x="54" y="2" width="24" height="24" rx={r} fill={fill} stroke={stroke} />
          <rect x="2" y="28"  width="24" height="24" rx={r} fill={fill} stroke={stroke} />
          <rect x="28" y="28" width="24" height="24" rx={r} fill={accent} opacity=".4" />
          <rect x="54" y="28" width="24" height="24" rx={r} fill={fill} stroke={stroke} />
        </svg>
      );
  }
}

export function FeedModePreviewGrid({ onApplied }: Props) {
  const { mode, setMode, availableModes, canUseMode } = useFeedMode();
  const navigate = useNavigate();

  if (availableModes.length === 0) return null;

  const handleTry = async (m: FeedModeId, locked: boolean, minPlan: 'free'|'premium'|'vip') => {
    if (locked) {
      toast.info(minPlan === 'vip' ? 'Modo VIP' : 'Modo Premium', {
        description: 'Faça upgrade para liberar.',
        action: { label: 'Ver planos', onClick: () => navigate('/subscriptions') },
      });
      return;
    }
    const res = await setMode(m, 'onboarding');
    if (res.ok) {
      toast.success('Modo aplicado!');
      onApplied?.();
      navigate('/feed');
    } else if (res.reason === 'plan_insufficient') {
      toast.info('Modo bloqueado pelo seu plano', {
        action: { label: 'Ver planos', onClick: () => navigate('/subscriptions') },
      });
    } else {
      toast.error('Não foi possível aplicar agora.');
    }
  };

  return (
    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
      {availableModes.map((cfg) => {
        const id = cfg.mode_id as FeedModeId;
        const locked = !canUseMode(id);
        const active = id === mode;
        return (
          <button
            key={id}
            type="button"
            onClick={() => handleTry(id, locked, cfg.min_plan)}
            className={cn(
              'group relative rounded-lg border bg-card/40 p-2 text-left transition-all',
              active ? 'border-primary ring-1 ring-primary/40' : 'border-border/50 hover:border-primary/40',
              locked && 'opacity-90',
            )}
          >
            <div className="aspect-[10/7] w-full rounded-md bg-background/60 border border-border/40 overflow-hidden">
              <PreviewSVG id={id} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold text-foreground truncate">
                {cfg.label}
              </span>
              {locked ? (
                <span className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider',
                  cfg.min_plan === 'vip'
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-primary/15 text-primary',
                )}>
                  {cfg.min_plan === 'vip' ? <Crown className="h-2 w-2" /> : <Lock className="h-2 w-2" />}
                  {cfg.min_plan}
                </span>
              ) : active ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  Testar
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
