/**
 * RoomActiveXpBadge — exibe progresso do ciclo "10 min ativo = +10 XP"
 * no header da sala. Flat, leve, sem box-shadow pesada.
 */
import { memo } from 'react';
import { Coins, Pause, Sparkles } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { RoomActiveXpState } from '@/hooks/aura/useRoomActiveXp';

interface Props {
  state: RoomActiveXpState;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function RoomActiveXpBadgeBase({ state }: Props) {
  const { remaining, uniqueCount, cycleCount, status, awardFlash } = state;
  const isPaused = status === 'paused';
  const isRewarded = awardFlash || status === 'rewarded';
  const progress = Math.min(1, (600 - remaining) / 600);
  const pct = Math.round(progress * 100);

  const colorClass = isRewarded
    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
    : isPaused
      ? 'bg-white/5 text-foreground/55 border-white/15'
      : 'bg-amber-400/10 text-amber-200 border-amber-400/30';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10px] font-medium transition-colors ${colorClass}`}
          aria-label={`Progresso ativo: ${pct}%`}
        >
          {/* Barra de progresso flat */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-0 top-0 h-full rounded-full ${
              isRewarded
                ? 'bg-emerald-400/25'
                : isPaused
                  ? 'bg-white/10'
                  : 'bg-amber-400/20'
            }`}
            style={{ width: `${pct}%` }}
          />
          <span className="relative inline-flex items-center gap-1">
            {isRewarded ? (
              <Sparkles className="h-3 w-3" aria-hidden="true" />
            ) : isPaused ? (
              <Pause className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Coins className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="font-mono tabular-nums">
              {isRewarded ? '+10 XP' : fmt(remaining)}
            </span>
            {!isRewarded && (
              <span className="text-foreground/55">
                · {uniqueCount}/2
              </span>
            )}
            {cycleCount > 0 && !isRewarded && (
              <span className="ml-0.5 rounded-full bg-emerald-400/20 px-1 text-[9px] text-emerald-200">
                ×{cycleCount}
              </span>
            )}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        className="max-w-[240px] border-amber-400/30 bg-[#0b0420] p-2 text-[11px] normal-case text-foreground/90"
      >
        <div className="text-[10px] uppercase tracking-wider text-amber-300/90">
          Recompensa de presença
        </div>
        <p className="mt-1 leading-snug">
          Fique <strong>10 minutos ativo</strong> conversando aqui (mínimo de
          2 mensagens diferentes) para ganhar <strong>+10 XP</strong> Aura.
        </p>
        {isPaused && (
          <p className="mt-1 text-[10px] italic text-foreground/60">
            Pausado por inatividade — envie uma mensagem para retomar.
          </p>
        )}
        {cycleCount > 0 && (
          <p className="mt-1 text-[10px] text-emerald-300/90">
            Ciclos já bonificados nesta sessão: {cycleCount}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export const RoomActiveXpBadge = memo(RoomActiveXpBadgeBase);
