import { memo } from 'react';
import { useAuraStorm } from '@/hooks/useAuraStorm';
import { Sparkles, Cloud, Zap, Moon } from 'lucide-react';

const STORM_META: Record<string, { emoji: string; label: string; icon: any; tint: string }> = {
  tempestade: { emoji: '⚡', label: 'Tempestade Social', icon: Zap, tint: 'from-fuchsia-500/30 to-pink-500/20' },
  aurora:     { emoji: '🌌', label: 'Aurora de Auras',  icon: Sparkles, tint: 'from-violet-500/30 to-indigo-500/20' },
  eclipse:    { emoji: '🌑', label: 'Eclipse Magnético', icon: Moon, tint: 'from-purple-700/40 to-slate-900/20' },
  meteoros:   { emoji: '☄️', label: 'Chuva de Meteoros', icon: Cloud, tint: 'from-amber-400/25 to-fuchsia-500/20' },
};

function fmt(secs: number): string {
  if (secs <= 0) return 'expirando';
  const m = Math.floor(secs / 60);
  if (m < 1) return `${secs}s`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function AuraStormBannerComp() {
  const storm = useAuraStorm();
  if (!storm) return null;
  const meta = STORM_META[storm.kind] || STORM_META.tempestade;
  const Icon = meta.icon;
  return (
    <div
      className={`relative flex items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${meta.tint} px-3 py-2`}
      role="status"
      aria-live="polite"
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 30% 30%, hsla(280,90%,60%,0.4), transparent 60%), radial-gradient(ellipse at 80% 70%, hsla(45,100%,55%,0.3), transparent 60%)',
          animation: 'aura-shimmer 6s ease-in-out infinite',
        }}
      />
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40">
        <Icon className="h-4 w-4 text-fuchsia-200" aria-hidden />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px] font-bold text-fuchsia-100">
          <span aria-hidden>{meta.emoji}</span> {meta.label}
        </div>
        <div className="truncate text-[10px] text-fuchsia-200/85">
          {storm.message || 'Mais auras raras circulando agora'} · termina em {fmt(storm.remaining_seconds)}
        </div>
      </div>
    </div>
  );
}

export const AuraStormBanner = memo(AuraStormBannerComp);
