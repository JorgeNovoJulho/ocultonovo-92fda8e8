import { Sparkles, Eye, Flame, Crown, Gem, Star, TrendingUp } from 'lucide-react';
import { usePrestige } from '@/hooks/usePrestige';
import { useTrustTips } from '@/hooks/useTrustTips';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, eye: Eye, flame: Flame, crown: Crown, gem: Gem, star: Star,
};

interface Props {
  userId?: string | null;
  className?: string;
}

export function PrestigeCard({ userId, className }: Props) {
  const { data, loading } = usePrestige(userId);
  const { tips } = useTrustTips(userId);

  if (loading || !data) {
    return <div className={cn('h-28 rounded-xl bg-muted/40 animate-pulse', className)} />;
  }

  const Icon = ICONS[data.badge_icon] ?? Sparkles;
  const glow = `hsl(${data.glow_color})`;
  const style = {
    background: `linear-gradient(135deg, hsl(${data.glow_color} / 0.16), hsl(${data.glow_color} / 0.03))`,
    borderColor: `hsl(${data.glow_color} / 0.5)`,
    boxShadow: `0 0 20px -8px hsl(${data.glow_color} / 0.55)`,
  } as React.CSSProperties;

  const pendingTips = (tips || []).filter((t: any) => !t.done).slice(0, 3);

  return (
    <div className={cn('rounded-xl border p-3 sm:p-4', className)} style={style}>
      <div className="flex items-center gap-3">
        <div
          className="grid place-items-center h-10 w-10 rounded-full shrink-0"
          style={{ background: `hsl(${data.glow_color} / 0.22)`, color: glow }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Prestígio Social
          </div>
          <div className="font-semibold truncate" style={{ color: glow }}>
            {data.name}
          </div>
          {data.description && (
            <div className="text-[11px] text-muted-foreground truncate">{data.description}</div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Progress value={data.progress_pct} className="h-1.5" />
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
          <span>{data.xp} pts</span>
          {data.next_name ? (
            <span>
              Faltam <strong className="text-foreground/80">{data.xp_to_next}</strong> pts para{' '}
              <strong className="text-foreground/80">{data.next_name}</strong>
            </span>
          ) : (
            <span>Nível máximo</span>
          )}
        </div>
      </div>

      {pendingTips.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Como evoluir
          </div>
          <ul className="space-y-1">
            {pendingTips.map((t: any) => (
              <li key={t.key} className="text-[12px] flex items-center justify-between gap-2">
                <span className="truncate">{t.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">+{t.points}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
