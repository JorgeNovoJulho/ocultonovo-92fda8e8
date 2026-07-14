import { useAuraQuestsHistory } from '@/hooks/useAuraDailyQuests';
import { CalendarDays, CheckCircle2, Circle } from 'lucide-react';

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function formatDay(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${WEEKDAY[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Histórico das missões diárias dos últimos 7 dias.
 */
export function AuraQuestsHistory() {
  const { items, loading } = useAuraQuestsHistory(7);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <CalendarDays className="h-3.5 w-3.5 text-fuchsia-400" />
        Histórico — 7 dias
      </div>

      {loading && items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          Sem registros ainda. Volte amanhã para começar a sequência!
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((d) => {
            const allDone = d.claimed > 0 && d.claimed === d.total;
            return (
              <li
                key={d.day}
                className="flex items-center justify-between gap-2 rounded-lg bg-background/40 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {allDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm capitalize truncate">{formatDay(d.day)}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">
                    {d.claimed}/{d.total} resgatadas
                  </span>
                  <span className={`font-semibold ${d.xp_earned > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                    +{d.xp_earned} XP
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
