import { useAuraBoost } from '@/hooks/useAuraBoost';
import { useBoostCountdown } from '@/hooks/useBoostCountdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Loader2, Sparkles, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

const COST = 200;

export function AuraBoostCard() {
  const { status, loading, activating, activate } = useAuraBoost();
  const { label: countdownLabel, longLabel: countdownLong, expired } = useBoostCountdown(status?.expires_at ?? null);
  const xp = status?.xp ?? 0;
  const enough = xp >= COST;

  return (
    <section
      className={cn(
        'rounded-2xl border p-3 transition-colors',
        status?.active
          ? 'border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/15 via-pink-500/10 to-transparent'
          : 'border-white/5 bg-white/[0.02]'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            status?.active
              ? 'bg-fuchsia-500/30 text-fuchsia-200'
              : 'bg-white/5 text-fuchsia-300'
          )}
        >
          <Zap className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-bold">Modo Desejo</h2>
            <Badge
              variant="outline"
              className="border-fuchsia-400/40 px-1 py-0 text-[9px] text-fuchsia-200"
              title={
                status?.active && !expired
                  ? `Aura Boost ativo · termina em ${countdownLong}. Sua aura ganha prioridade no campo por 1h.`
                  : 'Aura Boost: ative para ganhar prioridade no campo por 60 minutos.'
              }
            >
              Aura Boost {status?.active && !expired ? `· ${countdownLabel}` : ''}
            </Badge>
            {status?.active ? (
              <Badge className="gap-1 bg-fuchsia-500/25 text-[10px] text-fuchsia-200 hover:bg-fuchsia-500/25">
                <Sparkles className="h-2.5 w-2.5" /> Ativo
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Custa {COST} XP · 60 min
              </Badge>
            )}
          </div>

          {status?.active ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-fuchsia-200">
              <Timer className="h-3 w-3" />
              Sua aura está magnética por mais <strong className="tabular-nums">{countdownLabel}</strong>
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Ative o Modo Desejo: sua aura ganha prioridade no campo e aparece em destaque para todos por 1h.
            </p>
          )}

          <p className="mt-1 text-[10px] text-muted-foreground">
            Você tem <strong className="text-fuchsia-300">{xp.toLocaleString('pt-BR')} XP</strong>
          </p>
        </div>

        <Button
          size="sm"
          disabled={loading || activating || status?.active || !enough}
          onClick={activate}
          className={cn(
            'shrink-0 gap-1',
            status?.active
              ? 'bg-fuchsia-500/20 text-fuchsia-100 hover:bg-fuchsia-500/20'
              : 'bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white hover:opacity-95'
          )}
          title={!enough && !status?.active ? `Faltam ${COST - xp} XP` : undefined}
        >
          {activating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          {status?.active ? 'Ativo' : enough ? 'Ativar' : 'Sem XP'}
        </Button>
      </div>
    </section>
  );
}
