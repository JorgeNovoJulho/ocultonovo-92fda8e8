import { useState } from 'react';
import { useSocialScore, type SocialScore } from '@/hooks/useSocialScore';
import { Sparkles, Zap, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { AuraSocialPerksModal } from './AuraSocialPerksModal';
import { cn } from '@/lib/utils';

interface Props {
  userId?: string | null;
  compact?: boolean;
  className?: string;
}

export function AuraSocialCard({ userId, compact, className }: Props) {
  const { data, loading } = useSocialScore(userId);
  const [open, setOpen] = useState(false);

  if (loading || !data) {
    return <div className={cn('h-24 rounded-xl bg-muted/40 animate-pulse', className)} />;
  }

  const glow = `hsl(${data.glow_color})`;
  const style = {
    background: `linear-gradient(135deg, hsl(${data.glow_color} / 0.18), hsl(${data.glow_color} / 0.04))`,
    borderColor: `hsl(${data.glow_color} / 0.45)`,
    boxShadow: `0 0 24px -6px hsl(${data.glow_color} / 0.45)`,
  } as React.CSSProperties;

  return (
    <>
      <div
        className={cn(
          'rounded-xl border p-3 sm:p-4 transition-all duration-300',
          'hover:translate-y-[-1px]',
          className,
        )}
        style={style}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="grid place-items-center h-9 w-9 rounded-full shrink-0"
              style={{ background: `hsl(${data.glow_color} / 0.25)`, color: glow }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Aura Social — Nv {data.level}
              </div>
              <div className="font-semibold truncate" style={{ color: glow }}>
                {data.level_name}
              </div>
            </div>
          </div>
          {data.perks.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 px-2"
              onClick={() => setOpen(true)}
            >
              <Zap className="h-3.5 w-3.5 mr-1" />
              {data.perks.length} <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          )}
        </div>

        {!compact && (
          <div className="mt-3">
            <Progress value={data.progress_pct} className="h-1.5" />
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span>{data.xp} XP</span>
              {data.next_level_xp != null ? (
                <span>
                  Próximo: <strong className="text-foreground/80">{data.next_level_name}</strong> · {data.next_level_xp} XP
                </span>
              ) : (
                <span>Nível máximo</span>
              )}
            </div>
          </div>
        )}
      </div>

      <AuraSocialPerksModal open={open} onClose={() => setOpen(false)} score={data} />
    </>
  );
}
