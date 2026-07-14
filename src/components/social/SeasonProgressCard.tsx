import { memo } from 'react';
import { useSocialSeason } from '@/social-universe';
import { Sparkles } from 'lucide-react';

function fmtRemaining(secs: number) {
  if (secs <= 0) return 'temporada encerrando';
  const days = Math.floor(secs / 86400);
  if (days >= 1) return `${days}d restantes`;
  const h = Math.floor(secs / 3600);
  return `${h}h restantes`;
}

/**
 * SeasonProgressCard — temporada ativa + posição do usuário.
 * Compacto, flat, sem animações pesadas.
 */
function SeasonProgressCardComp() {
  const { season, progress } = useSocialSeason();
  if (!season) return null;

  const pct = Number(season.progress_pct ?? 0);
  const tint = `hsl(${season.theme_hue} 70% 60%)`;

  return (
    <div className="rounded-2xl border border-white/10 bg-card/40 p-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">{season.emoji || '🌌'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[12px] font-bold text-white/90">
            <Sparkles className="h-3 w-3" style={{ color: tint }} aria-hidden />
            {season.title}
          </div>
          <div className="truncate text-[10px] text-white/60">
            {season.narrative || 'Temporada social ativa'}
          </div>
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: tint }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-white/60">
        <span>{fmtRemaining(season.remaining_seconds)}</span>
        {progress && progress.season_id && (
          <span className="font-semibold text-white/80">
            {progress.xp} XP · #{progress.rank ?? '—'}
          </span>
        )}
      </div>
    </div>
  );
}

export const SeasonProgressCard = memo(SeasonProgressCardComp);
