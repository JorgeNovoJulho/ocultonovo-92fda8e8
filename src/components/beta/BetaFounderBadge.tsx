/**
 * BetaFounderBadge — pequena medalha "Fundador" exibida no perfil.
 * Aparece quando profile.is_beta_founder = true (marcado no 1º acesso durante beta).
 */
import { Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  isFounder?: boolean;
  className?: string;
  compact?: boolean;
}

export function BetaFounderBadge({ isFounder, className, compact }: Props) {
  if (!isFounder) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-amber-400/60 bg-amber-400/10 text-amber-500 gap-1',
        compact && 'h-5 px-1.5 text-[10px]',
        className,
      )}
      title="Você participou do Beta Público — obrigado por construir o Oculto com a gente."
    >
      <Crown className={cn('h-3.5 w-3.5', compact && 'h-3 w-3')} />
      {compact ? 'Fundador' : 'Fundador Beta'}
    </Badge>
  );
}
