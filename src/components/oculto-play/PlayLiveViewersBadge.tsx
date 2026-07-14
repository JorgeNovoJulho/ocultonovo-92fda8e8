/**
 * PlayLiveViewersBadge — Etapa 51
 *
 * Selo "👁 X assistindo agora" exibido no header do player.
 * Esconde quando há 0 espectadores (ou apenas o próprio).
 */
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayLiveViewers } from '@/hooks/useOcultoPlayLiveViewers';

interface Props {
  itemId: string | null | undefined;
  className?: string;
}

export function PlayLiveViewersBadge({ itemId, className }: Props) {
  const count = useOcultoPlayLiveViewers(itemId);
  if (!itemId || count < 1) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
        'bg-fuchsia-500/30 text-white border border-fuchsia-300/40 backdrop-blur',
        className,
      )}
      title="Espectadores ao vivo neste momento"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-300/70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-300" />
      </span>
      <Eye className="h-3 w-3" />
      {count} {count === 1 ? 'assistindo' : 'assistindo agora'}
    </div>
  );
}
