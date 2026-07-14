import { useAuraTopRanking, type AuraRankRow } from '@/hooks/useAuraTopRanking';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trophy, Flame, RefreshCw, Crown, Medal, Award,
  ChevronDown, ChevronLeft, ChevronRight, ArrowUp,
  Trophy as TrophyIcon, Eye, Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRadarPings } from '@/hooks/useRadarPings';
import { useAuth } from '@/hooks/useAuth';
import { IconButtonTip } from '@/components/ui/icon-button-tip';

function rankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-3.5 w-3.5 text-amber-300" />;
  if (rank === 2) return <Medal className="h-3.5 w-3.5 text-slate-300" />;
  if (rank === 3) return <Award className="h-3.5 w-3.5 text-orange-400" />;
  return <span className="text-[10px] font-bold text-muted-foreground tabular-nums">#{rank}</span>;
}

function RankItem({
  r,
  onSendPing,
  isPingSending,
  alreadyPinged,
  canPing,
}: {
  r: AuraRankRow;
  onSendPing?: (userId: string) => void;
  isPingSending?: boolean;
  alreadyPinged?: boolean;
  canPing?: boolean;
}) {
  // PRIVACIDADE: jamais exibir nome real — apenas @username (ou "Usuário" se ausente).
  const handleLabel = r.username ? `@${r.username}` : 'Usuário';
  const initial = (r.username || 'U').slice(0, 1).toUpperCase();
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
        r.is_self
          ? 'bg-fuchsia-500/10 ring-1 ring-fuchsia-400/40'
          : 'hover:bg-white/[0.04]'
      )}
    >
      <span className="inline-flex h-5 w-8 shrink-0 items-center justify-center">
        {rankIcon(r.rank)}
      </span>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={r.avatar_url || undefined} loading="lazy" />
        <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {handleLabel}
          {r.is_self && (
            <span className="ml-1 text-[10px] font-semibold text-fuchsia-300">(você)</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>Nv {r.aura_level}</span>
          {r.aura_streak_days > 0 && (
            <span className="inline-flex items-center gap-0.5 text-orange-300">
              <Flame className="h-2.5 w-2.5" />
              {r.aura_streak_days}d
            </span>
          )}
          {r.achievements_count > 0 && (
            <span className="inline-flex items-center gap-0.5 text-amber-300" title="Conquistas concluídas">
              <TrophyIcon className="h-2.5 w-2.5" />
              {r.achievements_count}
            </span>
          )}
          {r.visits_received > 0 && (
            <span className="inline-flex items-center gap-0.5 text-cyan-300" title="Visitas recebidas">
              <Eye className="h-2.5 w-2.5" />
              {r.visits_received.toLocaleString('pt-BR')}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-bold text-fuchsia-300 tabular-nums">
          {r.aura_xp.toLocaleString('pt-BR')}
        </p>
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">XP</p>
      </div>
      {!r.is_self && canPing && r.user_id && (
        <IconButtonTip label={alreadyPinged ? 'Aceno já enviado' : 'Acenar: sinaliza interesse silencioso'} side="left">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!onSendPing || isPingSending || alreadyPinged}
            className="h-7 shrink-0 gap-1.5 border-primary/30 px-2 text-[10px] font-medium hover:bg-primary/10 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              if (r.user_id) onSendPing?.(r.user_id);
            }}
            aria-label={alreadyPinged ? 'Aceno já enviado' : 'Acenar'}
          >
            <Radio className="h-3.5 w-3.5" />
            {alreadyPinged ? 'Já enviado' : 'Acenar'}
          </Button>
        </IconButtonTip>
      )}
    </li>
  );
}

export function AuraTopRanking() {
  const {
    rows, loading, refresh, myRank,
    view, pageIdx, canGoNext, canGoPrev, maxRank,
    showTop10, showTop20, goToPage,
  } = useAuraTopRanking(10);
  const { user } = useAuth();
  const { sendPing, isPingSending, pingedByMeSet } = useRadarPings();
  const canPing = !!user?.id;
  const handlePing = (userId: string) => sendPing.mutate(userId);

  const inWindow = !!(myRank && rows.some((r) => r.profile_id === myRank.profile_id));

  // Label da janela atual (ex: "21–40")
  const windowLabel = view === 'paged'
    ? `${pageIdx * 20 + 1}–${Math.min(maxRank, pageIdx * 20 + 20)}`
    : view === 'top20' ? 'Top 20' : 'Top 10';

  return (
    <section className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/12 via-fuchsia-500/6 to-purple-700/5 p-3 shadow-[0_0_24px_-12px_hsl(280_70%_55%/0.5)]">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="h-4 w-4 text-amber-300 shrink-0" />
          <h2 className="text-sm font-bold">Top Auras</h2>
          <Badge variant="outline" className="text-[10px]">{windowLabel}</Badge>
          {myRank && (
            <span className="text-[10px] text-muted-foreground truncate">
              · sua posição: <span className="font-bold text-fuchsia-300">#{myRank.rank}</span> de {myRank.total}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[11px] shrink-0"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </header>

      {loading && rows.length === 0 ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Ninguém pontuou ainda. Seja o primeiro a aparecer aqui ✨
        </p>
      ) : (
        <>
          <ol className="space-y-1">
            {rows.map((r) => (
              <RankItem
                key={r.profile_id}
                r={r}
                onSendPing={handlePing}
                isPingSending={isPingSending}
                alreadyPinged={r.user_id ? pingedByMeSet?.has(r.user_id) : false}
                canPing={canPing}
              />
            ))}
          </ol>

          {/* Controles de expansão / paginação */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {view === 'top10' && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 gap-1 text-[11px]"
                onClick={showTop20}
                disabled={loading}
              >
                <ChevronDown className="h-3 w-3" />
                Ver até a 20ª posição
              </Button>
            )}

            {view === 'top20' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-[11px]"
                  onClick={showTop10}
                  disabled={loading}
                >
                  <ArrowUp className="h-3 w-3" />
                  Top 10
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1 text-[11px]"
                  onClick={() => goToPage(1)}
                  disabled={loading || !canGoNext}
                >
                  Próximos (21–40) <ChevronRight className="h-3 w-3" />
                </Button>
              </>
            )}

            {view === 'paged' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-[11px]"
                  onClick={showTop10}
                  disabled={loading}
                  title="Voltar ao início da lista (Top 10)"
                >
                  <ArrowUp className="h-3 w-3" /> Início
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-[11px]"
                  onClick={pageIdx === 1 ? showTop20 : () => goToPage(pageIdx - 1)}
                  disabled={loading || !canGoPrev}
                >
                  <ChevronLeft className="h-3 w-3" /> Anterior
                </Button>

                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {[1, 2, 3, 4].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToPage(p)}
                      disabled={loading}
                      className={cn(
                        'min-w-6 rounded px-1.5 py-0.5 font-bold tabular-nums transition-colors',
                        pageIdx === p
                          ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/40'
                          : 'hover:bg-white/[0.06] text-muted-foreground'
                      )}
                      title={`Posições ${p * 20 + 1}–${Math.min(maxRank, p * 20 + 20)}`}
                    >
                      {p * 20 + 1}-{Math.min(maxRank, p * 20 + 20)}
                    </button>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-[11px] ml-auto"
                  onClick={() => goToPage(pageIdx + 1)}
                  disabled={loading || !canGoNext}
                >
                  Próxima <ChevronRight className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>

          {myRank && !inWindow && (
            <div className="mt-3 border-t border-white/5 pt-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Sua posição
              </p>
              <ol className="space-y-1">
                <RankItem r={{ ...myRank, is_self: true }} canPing={false} />
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
