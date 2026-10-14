/**
 * Botão "Ver canal" no perfil. Com 1 canal abre direto; com mais de um
 * mostra a lista. Sem canal, não aparece.
 */
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePlayChannelsOf } from '@/hooks/usePlayChannels';

export function ViewChannelButton({ userOrProfileId, className }: { userOrProfileId: string | null | undefined; className?: string }) {
  const navigate = useNavigate();
  const { data } = usePlayChannelsOf(userOrProfileId);
  const channels = data ?? [];
  if (channels.length === 0) return null;

  if (channels.length === 1) {
    const c = channels[0];
    return (
      <Button variant="outline" className={className ?? 'min-h-[44px] gap-2'} onClick={() => navigate(`/play/c/${c.slug}`)}>
        {c.kind === 'audio' ? <Headphones className="h-4 w-4" /> : <Clapperboard className="h-4 w-4" />}
        Ver canal
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className ?? 'min-h-[44px] gap-2'}>
          <Clapperboard className="h-4 w-4" />
          Ver canal
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[200]">
        {channels.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => navigate(`/play/c/${c.slug}`)} className="gap-2">
            {c.kind === 'audio' ? <Headphones className="h-4 w-4" /> : <Clapperboard className="h-4 w-4" />}
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
