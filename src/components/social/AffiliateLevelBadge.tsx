/**
 * AffiliateLevelBadge — badge compacto do nível atual + barra de progresso
 * para o próximo. Reutilizável no perfil, AffiliatesPage e ProfileReferralSection.
 */
import { Award } from 'lucide-react';
import { useAffiliateLevel } from '@/hooks/useAffiliateProgram';
import { cn } from '@/lib/utils';

export function AffiliateLevelBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { data: lvl } = useAffiliateLevel();
  if (!lvl) return null;

  const hue = lvl.badge_hue ?? 280;
  const color = `hsl(${hue}, 80%, 65%)`;
  const bg = `hsl(${hue}, 70%, 45%, 0.12)`;

  if (compact) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border', className)}
        style={{ color, borderColor: color, backgroundColor: bg }}
      >
        <Award className="h-3 w-3" />
        {lvl.level_name}
      </span>
    );
  }

  // Progresso para o próximo nível
  const hasNext = !!lvl.next_level_id && (lvl.next_min_referrals ?? 0) > 0;
  const refsPct = hasNext ? Math.min(100, Math.round((lvl.total_referrals / Math.max(lvl.next_min_referrals!, 1)) * 100)) : 100;
  const revPct  = hasNext ? Math.min(100, Math.round((Number(lvl.total_revenue) / Math.max(Number(lvl.next_min_revenue ?? 1), 1)) * 100)) : 100;

  return (
    <div className={cn('rounded-xl border p-3', className)} style={{ borderColor: color, backgroundColor: bg }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Award className="h-5 w-5 shrink-0" style={{ color }} />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">Seu nível</p>
            <p className="text-sm font-bold truncate" style={{ color }}>{lvl.level_name}</p>
          </div>
        </div>
        <div className="text-right text-xs">
          <p className="text-muted-foreground leading-none">Indicações</p>
          <p className="font-bold text-foreground">{lvl.total_referrals}</p>
        </div>
      </div>

      {hasNext ? (
        <div className="mt-3 space-y-2">
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>Para {lvl.next_level_name}: {lvl.total_referrals}/{lvl.next_min_referrals} indicações</span>
              <span>{refsPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${refsPct}%`, backgroundColor: color }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>Receita: R$ {Number(lvl.total_revenue).toFixed(2)} / R$ {Number(lvl.next_min_revenue).toFixed(2)}</span>
              <span>{revPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${revPct}%`, backgroundColor: color }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-2">Você está no nível máximo. Continue indicando!</p>
      )}
    </div>
  );
}
