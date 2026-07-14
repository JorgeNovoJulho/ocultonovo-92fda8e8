/**
 * BetaLockedNotice — faixa inline reutilizável.
 * Usar no topo de páginas/módulos cuja feature inteira esteja em beta-lock.
 */
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title?: string;
  message?: string;
  className?: string;
}

export function BetaLockedNotice({
  title = 'Disponível no lançamento oficial',
  message = 'Estamos no Beta Público. Esta área está visível mas as ações pagas só serão liberadas no lançamento.',
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm',
        className,
      )}
      role="status"
    >
      <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground mt-0.5">{message}</p>
      </div>
    </div>
  );
}
