/**
 * HistoryBlock — Prompt 4. Linha do tempo histórica + Retrospectiva.
 * Gated pela flag `historical_timeline` no consumidor (RetentionLayer).
 * Mobile-perf: render flat, sem sombras pesadas, scroll horizontal nativo.
 */
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useUserHistory } from '@/hooks/retention/useUserHistory';

export const HistoryBlock = memo(function HistoryBlock() {
  const { data, isLoading } = useUserHistory();
  if (isLoading || !data || data.isEmpty) return null;

  return (
    <section
      aria-label="Sua História no Oculto"
      className="mx-3 mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base" aria-hidden>📜</span>
        <h2 className="text-sm font-semibold text-violet-300">Sua História no Oculto</h2>
        {data.isVeteran && (
          <span className="ml-auto rounded-full border border-violet-400/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">
            Veterano
          </span>
        )}
      </div>

      {data.retrospective.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
          {data.retrospective.map((r, i) => (
            <span
              key={i}
              className="rounded-full bg-violet-500/10 border border-violet-400/30 px-2 py-0.5 text-violet-100"
            >
              {r}
            </span>
          ))}
        </div>
      )}

      <ol className="relative space-y-2 pl-4 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-violet-500/30 max-h-[60vh] overflow-y-auto pr-1">
        {data.timeline.slice(0, 20).map((ev) => (
          <li key={ev.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[14px] top-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-violet-500/40 text-[10px]"
            >
              {ev.icon}
            </span>
            <div className="text-sm text-foreground/90 leading-snug">{ev.title}</div>
            {ev.subtitle && (
              <div className="text-[11px] text-muted-foreground">{ev.subtitle}</div>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-2 flex justify-end">
        <Link
          to="/perfil"
          className="text-[11px] text-violet-200 hover:text-violet-100 transition-colors"
        >
          Ver perfil →
        </Link>
      </div>
    </section>
  );
});

export default HistoryBlock;
