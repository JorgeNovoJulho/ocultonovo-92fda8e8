import { Flame, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuraProgress } from '@/hooks/useAuraProgress';

interface AuraProgressBadgeProps {
  progress: AuraProgress;
  plan?: string | null;
  className?: string;
}

const PLAN_TINTS: Record<string, string> = {
  vip: 'from-amber-400 via-yellow-300 to-amber-500 text-amber-950',
  premium: 'from-fuchsia-500 via-pink-500 to-rose-500 text-white',
  free: 'from-slate-600 via-slate-500 to-slate-600 text-white',
};

export function AuraProgressBadge({ progress, plan, className }: AuraProgressBadgeProps) {
  const tint = PLAN_TINTS[(plan || 'free').toLowerCase()] || PLAN_TINTS.free;
  const pct = Math.min(100, Math.round((progress.xp_in_level / progress.xp_to_next) * 100));

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur-md',
        className
      )}
    >
      <span
        className={cn(
          'flex h-6 min-w-6 items-center justify-center rounded-full bg-gradient-to-br px-1.5 text-[10px] font-bold leading-none shadow-sm',
          tint
        )}
        title={`Nível ${progress.level}`}
      >
        <Sparkles className="mr-0.5 h-3 w-3" />
        {progress.level}
      </span>

      <div className="flex flex-col gap-0.5">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-pink-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[9px] uppercase tracking-wide text-white/60">
          {progress.xp_in_level}/{progress.xp_to_next} xp
        </span>
      </div>

      {progress.streak_days > 1 && (
        <span
          className="flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300"
          title={`${progress.streak_days} dias consecutivos`}
        >
          <Flame className="h-3 w-3" />
          {progress.streak_days}
        </span>
      )}
    </div>
  );
}
