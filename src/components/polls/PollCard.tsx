import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Clock, Users, Coins, CheckCircle2, Lock } from 'lucide-react';
import { usePollByPostId, useVoteOnPoll, PollWithVote } from '@/hooks/usePolls';
import { useCredits } from '@/hooks/useCredits';
import { useAuth } from '@/hooks/useAuth';
import { PollOptionBar } from './PollOptionBar';
import { InsufficientCreditsModal } from './InsufficientCreditsModal';
import { formatDistanceToNow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Limpeza única do cache local de votos (legado). Ele travava a UI marcando
// opções como "já votadas" mesmo quando o servidor não tinha registro.
if (typeof window !== 'undefined') {
  try {
    const PREFIX = 'poll-vote:v1:';
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch { /* noop */ }
}



interface PollCardProps {
  postId: string;
  className?: string;
}

export function PollCard({ postId, className }: PollCardProps) {
  const { user } = useAuth();
  const { data: poll, isLoading } = usePollByPostId(postId);
  const { data: credits } = useCredits();
  const voteOnPoll = useVoteOnPoll();
  
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);
  const [insufficientModal, setInsufficientModal] = useState<{
    open: boolean;
    required: number;
    available: number;
  }>({ open: false, required: 0, available: 0 });

  const isClosed = useMemo(() => {
    if (!poll?.closes_at) return false;
    return isPast(new Date(poll.closes_at));
  }, [poll?.closes_at]);

  // Fonte da verdade do voto: SEMPRE o servidor (poll.my_vote).
  // O cache local foi removido porque travava a UI mesmo quando o usuário
  // ainda não havia votado de fato (ex.: cache poluído de testes anteriores).
  const hasVoted = !!poll?.my_vote;
  const effectiveVotedOptionId = poll?.my_vote?.option_id ?? null;
  const showResults = hasVoted || poll?.show_results_before_vote || isClosed;

  // Foco automático no banner de confirmação após o voto, p/ leitores de tela
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const focusedOnceRef = useRef(false);
  useEffect(() => {
    if (hasVoted && confirmationRef.current && !focusedOnceRef.current) {
      focusedOnceRef.current = true;
      // Garante que o elemento é focável e move o foco
      confirmationRef.current.focus({ preventScroll: false });
    }
  }, [hasVoted]);

  const handleVote = async (optionId: string) => {
    if (!user || !poll) return;
    if (hasVoted || isClosed) return; // voto único, irrevogável

    // Check credits if paid poll
    if (poll.entry_cost > 0) {
      const available = credits?.credits?.credits_balance || 0;
      if (available < poll.entry_cost) {
        setInsufficientModal({
          open: true,
          required: poll.entry_cost,
          available,
        });
        return;
      }
    }

    setVotingOptionId(optionId);
    try {
      await voteOnPoll.mutateAsync({ pollId: poll.id, optionId });
    } catch (error: any) {
      if (error.code === 'INSUFFICIENT_CREDITS') {
        setInsufficientModal({
          open: true,
          required: error.required || poll.entry_cost,
          available: error.available || 0,
        });
      }
    } finally {
      setVotingOptionId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!poll) {
    return null;
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">ENQUETE</span>
            </div>
            <div className="flex items-center gap-2">
              {poll.entry_cost > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Coins className="h-3 w-3" />
                  {poll.entry_cost} créditos
                </Badge>
              )}
              {isClosed ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Encerrada
                </Badge>
              ) : (
                <Badge variant="outline" className="border-green-500/50 text-green-600 dark:text-green-400">
                  Aberta
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Question */}
          <h3 className="font-semibold text-lg">{poll.question}</h3>

          {/* Banner de confirmação — voto registrado e bloqueado */}
          {hasVoted && (
            <div
              ref={confirmationRef}
              role="status"
              aria-live="assertive"
              aria-atomic="true"
              tabIndex={-1}
              className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300 outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium flex-1">
                Voto registrado
                {effectiveVotedOptionId && (
                  <>
                    {' '}em{' '}
                    <strong className="font-semibold">
                      {poll.options.find((o) => o.id === effectiveVotedOptionId)?.option_text}
                    </strong>
                  </>
                )}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold">
                <Lock className="h-3 w-3" /> Bloqueada
              </span>
            </div>
          )}

          {/* Options */}
          <div className="space-y-2">
            {(() => {
              const maxVotes = Math.max(0, ...poll.options.map((o) => o.votes_count));
              return poll.options.map((option) => {
                const percentage = poll.total_votes > 0
                  ? (option.votes_count / poll.total_votes) * 100
                  : 0;
                const isWinner = showResults && option.votes_count === maxVotes && maxVotes > 0;
                const isSelected = effectiveVotedOptionId === option.id;

                return (
                  <PollOptionBar
                    key={option.id}
                    optionText={option.option_text}
                    votesCount={option.votes_count}
                    percentage={percentage}
                    isSelected={isSelected}
                    isVoting={votingOptionId === option.id}
                    showResults={showResults}
                    entryCost={poll.entry_cost}
                    imageUrl={option.image_url}
                    isWinner={isWinner}
                    disabled={!user || isClosed || hasVoted}
                    lockedAfterVote={hasVoted && !isClosed}
                    isClosed={isClosed}
                    notLoggedIn={!user}
                    onVote={() => handleVote(option.id)}
                  />
                );
              });
            })()}
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {poll.total_votes} {poll.total_votes === 1 ? 'voto' : 'votos'}
              </span>
              {poll.allow_multiple_votes && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                  Múltiplos votos
                </span>
              )}
            </div>
            {poll.closes_at && !isClosed && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Encerra {formatDistanceToNow(new Date(poll.closes_at), { 
                  addSuffix: true,
                  locale: ptBR 
                })}
              </span>
            )}
          </div>

          {/* Login prompt */}
          {!user && (
            <p className="text-sm text-center text-muted-foreground bg-muted/50 p-2 rounded">
              Faça login para votar
            </p>
          )}
        </CardContent>
      </Card>

      <InsufficientCreditsModal
        open={insufficientModal.open}
        onOpenChange={(open) => setInsufficientModal(prev => ({ ...prev, open }))}
        required={insufficientModal.required}
        available={insufficientModal.available}
      />
    </>
  );
}
