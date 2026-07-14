/**
 * FounderProgressCard — barra de progresso do programa Founder Beta.
 * Só renderiza se houver progresso ou se for beta.
 */
import { memo } from 'react';
import { useFounderProgress } from '@/hooks/retention/useRetention';
import { Crown } from 'lucide-react';

function FounderProgressCardComp() {
  const { data } = useFounderProgress();
  if (!data) return null;
  const next = Math.max(0, (data.tier + 1) * 100 - data.points);
  const pct = Math.min(100, ((data.points % 100) / 100) * 100);
  return (
    <div className="rounded-xl border border-amber-300/20 bg-amber-500/[0.04] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-200/90">
          <Crown className="h-4 w-4" />
          <span className="text-sm font-semibold">Founder Beta · Tier {data.tier}</span>
        </div>
        <span className="text-[11px] text-amber-200/60">{data.points} pts</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full bg-amber-300/70" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-amber-200/55">
        {next > 0 ? `Faltam ${next} pts para o próximo perk` : 'Perk pronto para resgate'}
      </div>
    </div>
  );
}

export const FounderProgressCard = memo(FounderProgressCardComp);
