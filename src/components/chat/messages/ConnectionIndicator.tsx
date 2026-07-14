import { memo } from 'react';
import { cn } from '@/lib/utils';

export const ConnectionIndicator = memo(function ConnectionIndicator({
  status,
}: {
  status: 'connected' | 'reconnecting' | 'error';
}) {
  const color =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'reconnecting'
        ? 'bg-yellow-500 animate-pulse'
        : 'bg-destructive animate-pulse';
  return (
    <div
      className={cn('w-2 h-2 rounded-full shrink-0 pointer-events-none', color)}
      title={
        status === 'connected'
          ? 'Conectado'
          : status === 'reconnecting'
            ? 'Reconectando...'
            : 'Sem conexão'
      }
    />
  );
});
