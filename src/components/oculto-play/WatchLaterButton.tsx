/**
 * WatchLaterButton — Etapa 32
 *
 * Botão circular pequeno que adiciona/remove um item da fila "Assistir Depois".
 * Usado dentro do PlayCard, ao lado dos outros action buttons.
 */
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayWatchLater } from '@/hooks/useOcultoPlayWatchLater';

export function WatchLaterButton({ itemId }: { itemId: string }) {
  const { idSet, add, remove } = useOcultoPlayWatchLater();
  const saved = idSet.has(itemId);
  const busy = add.isPending || remove.isPending;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        if (saved) remove.mutate(itemId);
        else add.mutate(itemId);
      }}
      className={cn(
        'grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white hover:bg-sky-500/70 transition-colors',
        saved && 'bg-sky-500/70',
        busy && 'opacity-60',
      )}
      title={saved ? 'Remover de Assistir Depois' : 'Assistir Depois'}
    >
      <Clock className={cn('h-3 w-3', saved && 'text-sky-100')} />
    </button>
  );
}
