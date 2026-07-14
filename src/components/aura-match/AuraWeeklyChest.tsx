import { useEffect, useState } from 'react';
import { useAuraWeeklyChest } from '@/hooks/useAuraWeeklyChest';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gift, Sparkles, CheckCircle2, Loader2, Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'liberado';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function currentWeekKeySaoPaulo(from = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? from.getFullYear());
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? from.getMonth() + 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? from.getDate());
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const isoDay = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay);

  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${isoYear}-${String(week).padStart(2, '0')}`;
}

function nextMondaySaoPaulo(from = new Date()): Date {
  const spStr = from.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const sp = new Date(spStr);
  const dayIdx = (sp.getDay() + 6) % 7;
  const daysUntilNextMonday = 7 - dayIdx;
  const targetSp = new Date(sp);
  targetSp.setDate(sp.getDate() + daysUntilNextMonday);
  targetSp.setHours(0, 0, 0, 0);
  const offsetMin = (sp.getTime() - from.getTime()) / 60000;
  return new Date(targetSp.getTime() - offsetMin * 60000);
}

export function AuraWeeklyChest() {
  const { status, history, loading, claiming, claim, refresh, justClaimed } = useAuraWeeklyChest();
  const [now, setNow] = useState(() => Date.now());
  const latestHistory = history[0];
  const historyMatchesCurrentWeek = latestHistory?.week_key === currentWeekKeySaoPaulo();

  // Conta SEMPRE que estiver reivindicado (ou acabou de reivindicar localmente).
  const isClaimed = !!status?.claimed || !!historyMatchesCurrentWeek || justClaimed;

  useEffect(() => {
    if (!isClaimed) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isClaimed]);

  // Quando o cronômetro chega a 0, recarrega o status (o cofre da nova semana abre).
  useEffect(() => {
    if (!isClaimed || !status?.next_claim_at) return;
    const ms = new Date(status.next_claim_at).getTime() - now;
    if (ms <= 0) refresh();
  }, [now, isClaimed, status?.next_claim_at, refresh]);

  const fallbackNextClaimAt = latestHistory
    ? nextMondaySaoPaulo(new Date(latestHistory.claimed_at)).getTime() - now
    : 0;
  const remainingMs = status?.next_claim_at
    ? new Date(status.next_claim_at).getTime() - now
    : fallbackNextClaimAt;

  return (
    <section
      className={cn(
        'rounded-2xl border p-3 transition-colors',
        isClaimed
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            isClaimed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-400/20 text-amber-300'
          )}
        >
          {isClaimed ? <CheckCircle2 className="h-6 w-6" /> : <Gift className="h-6 w-6" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-bold">Cofre semanal</h2>
            <Badge variant="outline" className="text-[10px]">
              Nível {status?.level ?? 1}
            </Badge>
            {isClaimed && (
              <Badge className="bg-emerald-500/20 text-[10px] text-emerald-300 hover:bg-emerald-500/20">
                Aberto
              </Badge>
            )}
          </div>

          {loading ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Carregando…</p>
          ) : isClaimed ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Reabre em <strong className="text-emerald-300 tabular-nums">{fmtCountdown(remainingMs)}</strong>
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Reivindique seu cofre desta semana — quanto maior seu nível, maior a recompensa.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-200">
              <Sparkles className="h-3 w-3" />
              +{status?.xp_preview ?? 50} XP
            </span>
            {(status?.super_dm_preview ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2 py-0.5 text-pink-200">
                <Zap className="h-3 w-3" />
                +{status?.super_dm_preview} Super DM grátis
              </span>
            )}
          </div>
        </div>

        <Button
          size="sm"
          disabled={loading || claiming || isClaimed}
          onClick={claim}
          className={cn(
            'shrink-0 gap-1 font-bold transition-all',
            isClaimed
              ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-500 cursor-not-allowed ring-2 ring-emerald-300/60 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
              : 'bg-gradient-to-br from-amber-400 to-orange-500 text-amber-950 hover:opacity-95'
          )}
        >
          {claiming ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isClaimed ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Gift className="h-3.5 w-3.5" />
          )}
          {isClaimed ? 'Aberto' : 'Abrir'}
        </Button>
      </div>

      {isClaimed && (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-200">
            <Clock className="h-3 w-3" />
            Próximo cofre disponível em
          </span>
          <span className="text-[12px] font-bold tabular-nums text-emerald-300">
            {fmtCountdown(remainingMs)}
          </span>
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Histórico de aberturas ({history.length})
            <span className="ml-auto text-[10px] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <ul className="mt-2 space-y-1 max-h-44 overflow-y-auto pr-1">
            {history.map((h) => {
              const d = new Date(h.claimed_at);
              const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
              const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
              return (
                <li
                  key={`${h.week_key}-${h.claimed_at}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-[11px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">Semana {h.week_key}</div>
                    <div className="text-[10px] text-muted-foreground">{dateStr} · {timeStr}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-fuchsia-200">
                      <Sparkles className="h-2.5 w-2.5" />
                      +{h.xp_awarded}
                    </span>
                    {h.super_dm_awarded > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-500/15 px-1.5 py-0.5 text-pink-200">
                        <Zap className="h-2.5 w-2.5" />
                        {h.super_dm_awarded}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[9px] px-1 py-0">N{h.level_at_claim}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
