/**
 * OcultoPlayEmptyState — vazio amistoso, com mensagem diferente para Master Admin.
 */
import { Play } from 'lucide-react';
import { useOcultoPlayEnabled } from '@/hooks/useOcultoPlayEnabled';

export function OcultoPlayEmptyState({ message }: { message?: string }) {
  const { isMasterPreview, isPublicEnabled } = useOcultoPlayEnabled();

  const text =
    message ??
    (isMasterPreview && !isPublicEnabled
      ? 'OCULTO PLAY está em modo interno. Publique conteúdos de teste antes de ativar para todos.'
      : 'Ainda não há conteúdos no OCULTO PLAY. Volte em breve para descobrir vídeos, memes, áudios e novidades.');

  return (
    <div className="border border-dashed border-border/50 rounded-2xl py-12 px-6 text-center bg-muted/10">
      <div className="mx-auto h-12 w-12 grid place-items-center rounded-full bg-fuchsia-500/15 text-fuchsia-300 mb-3">
        <Play className="h-6 w-6" />
      </div>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{text}</p>
    </div>
  );
}
