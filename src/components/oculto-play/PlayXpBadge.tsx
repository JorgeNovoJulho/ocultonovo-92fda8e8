/**
 * PlayXpBadge — chip de XP/Nível no header do OCULTO PLAY.
 * Só aparece se gamification_on. Não polui se zero.
 */
import { Sparkles, Zap } from 'lucide-react';
import { useOcultoPlayXp } from '@/hooks/useOcultoPlayGamification';
import { cn } from '@/lib/utils';

export function PlayXpBadge({ className }: { className?: string }) {
  const { data, isLoading } = useOcultoPlayXp();
  if (isLoading || !data) return null;

  const pct = Math.min(100, Math.round((data.xp_total / Math.max(1, data.next_level_xp)) * 100));
  const capPct = Math.min(100, Math.round((data.xp_today / Math.max(1, data.cap)) * 100));

  return (
    <div
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-1.5 overflow-hidden rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-100',
        className,
      )}
      title={`XP total: ${data.xp_total} · Hoje: ${data.xp_today}/${data.cap}`}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[10px] font-semibold uppercase">Nv {data.level}</span>
        <div className="h-1 w-14 max-w-[14vw] overflow-hidden rounded-full bg-fuchsia-500/20">
          <div
            className="h-full bg-gradient-to-r from-fuchsia-400 to-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1 ml-1 text-[10px] text-fuchsia-200/80">
        <Zap className="h-3 w-3" />
        {data.xp_today}/{data.cap}
        <div className="w-10 h-1 rounded-full bg-fuchsia-500/20 overflow-hidden">
          <div className="h-full bg-fuchsia-300" style={{ width: `${capPct}%` }} />
        </div>
      </div>
    </div>
  );
}
