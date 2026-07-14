import { cn } from '@/lib/utils';
import { Check, Loader2, Lock, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PollOptionBarProps {
  optionText: string;
  votesCount: number;
  percentage: number;
  isSelected: boolean;
  isVoting: boolean;
  showResults: boolean;
  entryCost: number;
  disabled?: boolean;
  /** Indica que o motivo do disabled é o usuário já ter votado (mostra tooltip de bloqueio). */
  lockedAfterVote?: boolean;
  /** Indica que a enquete está encerrada (mostra tooltip explicativo). */
  isClosed?: boolean;
  /** Indica que o usuário não está logado. */
  notLoggedIn?: boolean;
  imageUrl?: string | null;
  isWinner?: boolean;
  onVote: () => void;
}

export function PollOptionBar({
  optionText,
  votesCount,
  percentage,
  isSelected,
  isVoting,
  showResults,
  entryCost,
  disabled,
  lockedAfterVote,
  isClosed,
  notLoggedIn,
  imageUrl,
  isWinner,
  onVote,
}: PollOptionBarProps) {
  const canClick = !disabled && !isVoting && !isSelected;
  const highlightWinner = isWinner && showResults && votesCount > 0;

  const button = (
    <button
      onClick={canClick ? onVote : undefined}
      disabled={!canClick}
      aria-disabled={!canClick}
      aria-pressed={isSelected}
      aria-label={
        lockedAfterVote
          ? `${optionText} — votação bloqueada, você já registrou seu voto`
          : optionText
      }
      className={cn(
        'relative w-full rounded-lg border-2 p-3 text-left transition-all overflow-hidden',
        highlightWinner
          ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_0_1px_hsl(45_93%_55%/0.4)]'
          : isSelected
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50 hover:bg-accent/50',
        disabled && !isSelected && !highlightWinner && 'opacity-60 cursor-not-allowed',
        !disabled && !isSelected && 'cursor-pointer'
      )}
    >
      {showResults && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn(
            'absolute inset-y-0 left-0 rounded-l-md',
            highlightWinner
              ? 'bg-amber-400/25'
              : isSelected ? 'bg-primary/20' : 'bg-muted/50'
          )}
        />
      )}

      <div className="relative space-y-1.5">
        {/* Linha 1: radio + imagem + tags + porcentagem (sempre na mesma linha) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isVoting ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            ) : isSelected ? (
              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            ) : lockedAfterVote ? (
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Lock className="h-3 w-3 text-muted-foreground" />
              </div>
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
            )}
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className={cn(
                  "h-8 w-8 rounded object-cover shrink-0 border",
                  highlightWinner ? "border-amber-400" : "border-border/50"
                )}
              />
            )}
            {isSelected && !highlightWinner && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full shrink-0">
                <Check className="h-3 w-3" />
                Sua escolha
              </span>
            )}
            {highlightWinner && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-400 text-black px-1.5 py-0.5 rounded-full shrink-0">
                <Trophy className="h-3 w-3" />
                <span className="truncate max-w-[10rem]">
                  {isSelected ? 'Sua escolha · Mais votada' : 'Mais votada'}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showResults && (
              <span className={cn(
                "text-sm font-semibold",
                highlightWinner ? "text-amber-500 dark:text-amber-300" : "text-muted-foreground"
              )}>
                {percentage.toFixed(0)}%
              </span>
            )}
            {!showResults && entryCost > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                {entryCost} créditos
              </span>
            )}
          </div>
        </div>

        {/* Linha 2: texto da opção em largura total para melhor leitura */}
        <div className={cn(
          "font-medium break-words whitespace-normal leading-snug text-sm",
          highlightWinner && "text-amber-500 dark:text-amber-300"
        )}>
          {optionText}
        </div>
      </div>



      {showResults && (
        <div className="relative mt-1 text-xs text-muted-foreground">
          {votesCount} {votesCount === 1 ? 'voto' : 'votos'}
        </div>
      )}
    </button>
  );

  // Tooltip explicativo quando o botão está bloqueado
  const tooltipMessage = isClosed
    ? 'Esta enquete já foi encerrada. Não é mais possível votar.'
    : lockedAfterVote && !isSelected
      ? 'Você já registrou seu voto nesta enquete. Não é possível votar novamente nem alterar sua escolha.'
      : lockedAfterVote && isSelected
        ? 'Esta é a opção em que você votou. O voto é único e definitivo.'
        : notLoggedIn
          ? 'Faça login para participar da votação.'
          : null;

  if (tooltipMessage) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span permite que o tooltip funcione mesmo com botão disabled */}
            <span className="block w-full">{button}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px] text-center">
            {tooltipMessage}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
