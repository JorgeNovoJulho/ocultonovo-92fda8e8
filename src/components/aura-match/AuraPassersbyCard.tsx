import { memo } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import { useAuraPassersby } from '@/hooks/useAuraPassersby';

function fmtMin(m: number): string {
  if (m < 1) return 'agora há pouco';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

function AuraPassersbyCardComp() {
  const data = useAuraPassersby();
  if (!data || data.passersby_24h === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-transparent px-3 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/15 text-fuchsia-300">
        <Eye className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px] font-semibold">
          <Sparkles className="h-3 w-3 text-fuchsia-300" aria-hidden />
          {data.passersby_24h} aura{data.passersby_24h > 1 ? 's' : ''} passou perto da sua hoje
        </div>
        <div className="text-[10px] text-muted-foreground">
          {data.passersby_1h > 0
            ? `${data.passersby_1h} na última hora · presença mais recente ${fmtMin(data.closest_minutes_ago)}`
            : `Presença mais recente ${fmtMin(data.closest_minutes_ago)}`}
        </div>
      </div>
    </div>
  );
}

export const AuraPassersbyCard = memo(AuraPassersbyCardComp);
