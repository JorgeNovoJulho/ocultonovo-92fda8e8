import { useAuraDailyQuests } from '@/hooks/useAuraDailyQuests';
import { Sparkles, Flame, Trophy, Target, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Resumo do dia: XP de quests resgatado + pendente + barra geral + meta diária.
 * UI flat — Mobile Perf Golden Rules.
 */
export function AuraQuestsSummary() {
  const { summary, quests } = useAuraDailyQuests();
  if (!quests.length) return null;

  const {
    xpTodayClaimed, xpTodayPending, overallPct, completed, total,
    dailyGoalXp, xpRemaining, goalPct,
  } = summary;
  const goalReached = goalPct >= 100;

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-fuchsia-500/10 via-amber-500/5 to-transparent p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold">XP de hoje</span>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold leading-none text-amber-400 tabular-nums">+{xpTodayClaimed}</div>
          {xpTodayPending > 0 && (
            <div className="text-[10px] text-fuchsia-300">+{xpTodayPending} a resgatar</div>
          )}
        </div>
      </div>

      {/* Meta diária de XP */}
      <div className="rounded-lg bg-background/40 p-2 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {goalReached ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Target className="h-3.5 w-3.5 text-fuchsia-400" />
            )}
            Meta diária de XP
          </span>
          <span className={cn('font-semibold tabular-nums', goalReached ? 'text-emerald-300' : 'text-foreground')}>
            {xpTodayClaimed}/{dailyGoalXp} XP
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              goalReached
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : 'bg-gradient-to-r from-fuchsia-500 via-amber-400 to-amber-500'
            )}
            style={{ width: `${Math.min(100, goalPct)}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {goalReached
            ? '🎉 Meta diária batida! Volte amanhã para mais XP.'
            : `Faltam ${xpRemaining} XP para bater a meta de hoje.`}
        </p>
      </div>

      {/* Progresso geral das missões */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3 w-3" /> Missões diárias
          </span>
          <span>{completed}/{total} completas · {overallPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-fuchsia-500 via-amber-400 to-emerald-500 transition-all duration-500"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Sparkles className="h-3 w-3 text-fuchsia-400" />
        Toque, curta ou envie Super DM para evoluir as missões em tempo real.
      </p>
    </div>
  );
}
