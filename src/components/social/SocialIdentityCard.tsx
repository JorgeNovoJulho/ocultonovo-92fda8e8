/**
 * SocialIdentityCard — Onda A
 * Card único que une Aura Social + Prestígio + Trust em uma identidade só.
 * Usa `useSocialIdentity` (1 RPC) em vez de 3 hooks paralelos.
 *
 * Mantém os cards individuais existentes (AuraSocialCard, PrestigeCard,
 * TrustScoreCard) intactos para não quebrar telas que usam só um.
 */
import { useState } from 'react';
import { Sparkles, Crown, Shield, ChevronRight, Zap } from 'lucide-react';
import { useSocialIdentity } from '@/hooks/useSocialIdentity';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AuraSocialPerksModal } from '@/components/social-score/AuraSocialPerksModal';

interface Props {
  userId?: string | null;
  className?: string;
  compact?: boolean;
}

const TRUST_TIER = (s: number) => {
  if (s >= 80) return { label: 'Excelente', cls: 'text-emerald-400' };
  if (s >= 60) return { label: 'Bom', cls: 'text-sky-400' };
  if (s >= 40) return { label: 'Regular', cls: 'text-amber-400' };
  if (s >= 20) return { label: 'Baixo', cls: 'text-orange-400' };
  return { label: 'Crítico', cls: 'text-red-400' };
};

export function SocialIdentityCard({ userId, className, compact }: Props) {
  const { data, isLoading } = useSocialIdentity(userId);
  const [perksOpen, setPerksOpen] = useState(false);

  if (isLoading || !data) {
    return <div className={cn('h-32 rounded-xl bg-muted/40 animate-pulse', className)} />;
  }

  const score = data.score;
  const prestige = data.prestige;
  const trust = data.trust;

  const glow = score?.glow_color ?? prestige?.glow_color ?? '270 80% 60%';
  const style = {
    background: `linear-gradient(135deg, hsl(${glow} / 0.16), hsl(${glow} / 0.03))`,
    borderColor: `hsl(${glow} / 0.45)`,
    boxShadow: `0 0 22px -8px hsl(${glow} / 0.5)`,
  } as React.CSSProperties;

  const trustTier = trust ? TRUST_TIER(trust.score) : null;

  return (
    <>
      <div className={cn('rounded-xl border p-3 sm:p-4', className)} style={style}>
        {/* Header: Aura + Prestige */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="grid place-items-center h-9 w-9 rounded-full shrink-0"
              style={{ background: `hsl(${glow} / 0.25)`, color: `hsl(${glow})` }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Identidade Social
              </div>
              <div
                className="font-semibold truncate"
                style={{ color: `hsl(${glow})` }}
              >
                {score?.level_name ?? 'Aura'} · Nv {score?.level ?? 1}
              </div>
            </div>
          </div>

          {score?.perks?.length ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 px-2"
              onClick={() => setPerksOpen(true)}
            >
              <Zap className="h-3.5 w-3.5 mr-1" />
              {score.perks.length}
              <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          ) : null}
        </div>

        {/* Aura progress */}
        {!compact && score && (
          <div className="mt-3">
            <Progress value={score.progress_pct} className="h-1.5" />
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span>{score.xp} XP</span>
              {score.next_level_xp != null ? (
                <span>
                  Próximo: <strong className="text-foreground/80">{score.next_level_name}</strong> · {score.next_level_xp} XP
                </span>
              ) : (
                <span>Nível máximo</span>
              )}
            </div>
          </div>
        )}

        {/* Sub-row: Prestige + Trust */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {prestige && (
            <div
              className="rounded-lg border p-2"
              style={{
                background: `hsl(${prestige.glow_color} / 0.08)`,
                borderColor: `hsl(${prestige.glow_color} / 0.3)`,
              }}
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Crown className="h-3 w-3" /> Prestígio
              </div>
              <div
                className="text-sm font-semibold truncate"
                style={{ color: `hsl(${prestige.glow_color})` }}
              >
                {prestige.name}
              </div>
              {prestige.next_name && (
                <div className="text-[10px] text-muted-foreground truncate">
                  Próximo: {prestige.next_name}
                </div>
              )}
            </div>
          )}

          {trust && trustTier && (
            <div className="rounded-lg border border-border/40 bg-background/40 p-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Shield className="h-3 w-3" /> Trust
              </div>
              <div className={cn('text-sm font-semibold', trustTier.cls)}>
                {trust.score} · {trustTier.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {score && (
        <AuraSocialPerksModal
          open={perksOpen}
          onClose={() => setPerksOpen(false)}
          score={score}
        />
      )}
    </>
  );
}
