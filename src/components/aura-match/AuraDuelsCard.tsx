import { useAuraDuels, type ResolveStep } from '@/hooks/useAuraDuels';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Swords, Check, X, Trophy, Loader2, RefreshCw, History, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  accepted: 'Em andamento',
  resolved: 'Encerrado',
  declined: 'Recusado',
  expired: 'Expirado',
};

const STEP_ORDER: ResolveStep[] = ['sending', 'computing', 'awarding', 'syncing', 'done'];
const STEP_LABEL: Record<ResolveStep, string> = {
  idle: '',
  sending: 'Enviando',
  computing: 'Calculando',
  awarding: 'Recompensa',
  syncing: 'Sincronizando',
  done: 'Concluído',
  error: 'Falhou',
};

function ResolveProgress({ step }: { step: ResolveStep }) {
  if (step === 'idle') return null;
  const isError = step === 'error';
  const currentIdx = isError ? -1 : STEP_ORDER.indexOf(step);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-1.5 flex flex-col gap-1 rounded-md border border-amber-400/20 bg-amber-500/5 p-1.5"
    >
      <div className="flex items-center gap-1.5">
        {STEP_ORDER.map((s, i) => {
          const done = !isError && i < currentIdx;
          const active = !isError && i === currentIdx;
          return (
            <div key={s} className="flex flex-1 items-center gap-1 min-w-0">
              <div
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  isError ? 'bg-rose-500/40' : done ? 'bg-amber-400' : active ? 'bg-amber-300/70 animate-pulse' : 'bg-white/10'
                )}
              />
            </div>
          );
        })}
      </div>
      <p className={cn('text-[10px] font-medium', isError ? 'text-rose-300' : 'text-amber-300')}>
        {isError ? 'Falha ao resolver — tentando recuperar status…' : `Resolvendo: ${STEP_LABEL[step]}…`}
      </p>
    </div>
  );
}

function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s atrás`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.round(m / 60);
  return `${h}h atrás`;
}

export function AuraDuelsCard() {
  const { duels, loading, busy, resolvingId, resolveStep, syncing, history, clearHistory, refresh, respond, resolve } = useAuraDuels();
  const [showHistory, setShowHistory] = useState(false);

  const isSyncing = syncing || loading;

  const handleManualRefresh = async () => {
    try {
      await refresh({ logResult: true });
      toast.success('Duelos sincronizados');
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao sincronizar duelos');
    }
  };

  const MAX_ACTIVE = 5;
  const activeDuels = duels.filter((d) => d.status === 'pending' || d.status === 'accepted');
  const activeCount = activeDuels.length;
  const canInvite = activeCount < MAX_ACTIVE;
  const shown = duels.slice(0, MAX_ACTIVE);

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-[1.5px]"
      style={{
        background:
          'linear-gradient(135deg, hsl(345 90% 60% / 0.9), hsl(280 90% 65% / 0.8), hsl(200 95% 60% / 0.8))',
        boxShadow:
          '0 0 24px -4px hsl(320 95% 60% / 0.55), 0 0 48px -12px hsl(200 95% 60% / 0.45), inset 0 0 24px hsl(320 95% 60% / 0.15)',
      }}
    >
      <div
        className="relative rounded-[15px] p-3"
        style={{
          background:
            'linear-gradient(135deg, hsl(280 60% 8%) 0%, hsl(330 55% 10%) 45%, hsl(210 55% 9%) 100%)',
        }}
      >
        {/* glow interno suave */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[15px] opacity-60"
          style={{
            background:
              'radial-gradient(circle at 15% 0%, hsl(320 95% 65% / 0.18), transparent 55%), radial-gradient(circle at 90% 100%, hsl(200 95% 60% / 0.18), transparent 55%)',
          }}
          aria-hidden
        />

        <header className="relative flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{
              background: 'linear-gradient(135deg, hsl(345 95% 55%), hsl(290 90% 55%))',
              boxShadow: '0 0 16px hsl(320 95% 60% / 0.55)',
            }}
          >
            <Swords className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-white tracking-tight drop-shadow-[0_0_6px_hsl(320_95%_60%/0.45)]">
              Duelos de Aura
            </h2>
            <p className="text-[11px] font-medium text-white/80">
              Compare seu XP semanal · vencedor leva <span className="text-amber-300 font-bold">100 XP</span>.
            </p>
          </div>
          <Badge
            className="hidden sm:inline-flex h-6 gap-1 border-0 px-2 text-[10px] font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, hsl(345 90% 50%), hsl(280 85% 55%))',
              boxShadow: '0 0 12px hsl(320 95% 60% / 0.4)',
            }}
            aria-label={`Duelos ativos: ${activeCount} de ${MAX_ACTIVE}`}
          >
            <Swords className="h-2.5 w-2.5" /> {activeCount}/{MAX_ACTIVE}
          </Badge>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isSyncing || busy || !!resolvingId}
            aria-label="Atualizar duelos"
            aria-busy={isSyncing}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-white/20 bg-white/[0.06] px-2 text-[10px] font-semibold text-white/90 hover:text-white hover:border-fuchsia-300/60 hover:bg-white/[0.12] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
            {isSyncing ? 'Sincronizando…' : 'Atualizar'}
          </button>
        </header>

        {/* CTA convidar — mostra também quando já há duelos, respeitando o limite */}
        <div className="relative mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
          <p className="text-[11px] text-white/80">
            {canInvite ? (
              <>Você pode desafiar até <span className="font-bold text-fuchsia-200">{MAX_ACTIVE}</span> auras simultaneamente.</>
            ) : (
              <>Limite atingido — encerre algum duelo para liberar uma vaga.</>
            )}
          </p>
          <a
            href="/aura-match"
            aria-disabled={!canInvite}
            onClick={(e) => { if (!canInvite) e.preventDefault(); }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-white shrink-0 transition-all',
              canInvite
                ? 'hover:scale-[1.02] shadow-[0_0_14px_hsl(320_95%_60%/0.55)]'
                : 'opacity-50 cursor-not-allowed'
            )}
            style={canInvite ? {
              background: 'linear-gradient(135deg, hsl(345 95% 55%), hsl(290 90% 55%), hsl(220 95% 60%))',
            } : { background: 'hsl(0 0% 25%)' }}
          >
            <Swords className="h-3 w-3" />
            Convidar ({activeCount}/{MAX_ACTIVE})
          </a>
        </div>

      {loading ? (
        <p className="relative mt-2 text-[11px] text-white/70" aria-live="polite">Carregando…</p>
      ) : duels.length === 0 ? (
        <div className="relative mt-2 flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-3 text-center">
          <p className="text-[11px] text-white/80">
            Nenhum duelo ainda. Escolha alguém para desafiar.
          </p>
        </div>
      ) : (
        <ul className="relative mt-2 flex flex-col gap-1.5">
          {shown.map((d) => {
            const isActive = d.status === 'pending' || d.status === 'accepted';
            const isWinner = d.status === 'resolved' && d.winner_id && d.opponent_user_id !== d.winner_id;
            const isThisResolving = resolvingId === d.id;
            const disableClose = busy || isSyncing || !!resolvingId || !isActive;
            return (
              <li
                key={d.id}
                className="flex flex-col gap-1 rounded-lg border border-white/15 bg-white/[0.05] p-2 backdrop-blur-sm"
                style={isActive ? { boxShadow: 'inset 0 0 0 1px hsl(320 95% 60% / 0.18)' } : undefined}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8 ring-2 ring-fuchsia-400/40">
                    <AvatarImage src={d.opponent_avatar || undefined} />
                    <AvatarFallback className="text-[10px] bg-fuchsia-950 text-fuchsia-100">
                      {d.opponent_name?.replace(/^@/, '').slice(0, 1).toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white">{d.opponent_name || '@usuario'}</p>
                    <p className="text-[10px] text-white/70">
                      {STATUS_LABEL[d.status] || d.status} · <span className="text-fuchsia-200 font-semibold">você {d.my_xp} XP</span> × <span className="text-cyan-200 font-semibold">{d.opp_xp} XP</span>
                    </p>
                  </div>
                  {d.status === 'pending' && d.role === 'opponent' && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" disabled={busy || isSyncing}
                        className="h-7 w-7 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15" onClick={() => respond(d.id, true)}
                        aria-label="Aceitar duelo">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={busy || isSyncing}
                        className="h-7 w-7 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15" onClick={() => respond(d.id, false)}
                        aria-label="Recusar duelo">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {isActive && (
                    <Button size="sm" variant="outline" disabled={disableClose}
                      className="h-7 px-2 text-[10px] gap-1 border-rose-400/50 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 hover:text-white hover:border-rose-300"
                      onClick={() => resolve(d.id)}
                      aria-busy={isThisResolving}
                      aria-label={isThisResolving ? 'Encerrando duelo' : 'Encerrar duelo'}>
                      {isThisResolving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      {isThisResolving ? 'Encerrando…' : 'Encerrar'}
                    </Button>
                  )}
                  {d.status === 'resolved' && isWinner && (
                    <Badge className="gap-1 border-0 bg-gradient-to-br from-amber-400 to-amber-600 text-[10px] font-bold text-amber-950 shadow-[0_0_10px_hsl(45_95%_55%/0.5)]">
                      <Trophy className="h-2.5 w-2.5" /> Vitória
                    </Badge>
                  )}
                </div>
                {isThisResolving && <ResolveProgress step={resolveStep} />}
              </li>
            );
          })}
        </ul>
      )}

      {/* Mini-histórico de ações */}
      <div className="mt-2 border-t border-white/5 pt-2">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={showHistory}
          aria-controls="aura-duels-history"
        >
          <span className="inline-flex items-center gap-1">
            <History className="h-3 w-3" /> Histórico de ações {history.length > 0 && `(${history.length})`}
          </span>
          {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showHistory && (
          <div id="aura-duels-history" className="mt-1.5 space-y-1">
            {history.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/70 italic px-1">Nenhuma ação registrada ainda.</p>
            ) : (
              <>
                <ul className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className={cn(
                        'flex items-start gap-1.5 rounded-md px-1.5 py-1 text-[10px]',
                        h.ok ? 'bg-emerald-500/5' : 'bg-rose-500/5'
                      )}
                    >
                      {h.ok ? (
                        <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-400" />
                      ) : (
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-rose-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          <span className="text-muted-foreground">[{h.kind}]</span> {h.message}
                        </p>
                        <p className="text-muted-foreground/70 tabular-nums">
                          {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {timeAgo(h.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-[9px] text-muted-foreground/60 hover:text-rose-300 transition-colors"
                >
                  Limpar histórico
                </button>
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
