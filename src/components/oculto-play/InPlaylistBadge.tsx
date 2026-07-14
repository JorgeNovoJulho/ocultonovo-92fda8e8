/**
 * InPlaylistBadge — Etapa 26.
 * Badge sutil "Em playlist" para sinalizar curadoria editorial
 * em cards de itens do OCULTO PLAY. Usa o hook compartilhado
 * para evitar N+1 queries entre cards.
 */
import { Layers } from 'lucide-react';
import { useItemsInActivePlaylists } from '@/hooks/useItemsInActivePlaylists';

interface Props {
  itemId: string;
  className?: string;
}

export function InPlaylistBadge({ itemId, className }: Props) {
  const { isInPlaylist } = useItemsInActivePlaylists();
  if (!isInPlaylist(itemId)) return null;

  return (
    <span
      className={
        className ??
        "text-[9px] uppercase tracking-wide bg-fuchsia-500/80 text-white px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold"
      }
      title="Item em playlist editorial"
    >
      <Layers className="h-2.5 w-2.5" />
      Em playlist
    </span>
  );
}
