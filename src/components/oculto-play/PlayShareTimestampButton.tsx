/**
 * PlayShareTimestampButton — Etapa 52
 *
 * Copia para o clipboard o link público do item com `?t=NN` apontando
 * para a posição atual do player. Tenta usar Web Share API quando
 * disponível (mobile). Exibe toast de confirmação.
 */
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { buildShareUrlWithTimestamp } from '@/lib/ocultoPlaySeekHint';

interface Props {
  itemId: string | null | undefined;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  title?: string | null;
}

export function PlayShareTimestampButton({ itemId, mediaRef, title }: Props) {
  if (!itemId) return null;

  const handle = async () => {
    const el = mediaRef.current;
    const t = Math.floor(el?.currentTime ?? 0);
    const url = buildShareUrlWithTimestamp(itemId, t);
    const shareData = {
      title: title || 'OCULTO PLAY',
      text: t > 0
        ? `Olha esse momento (${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')})`
        : 'Confere isso no OCULTO PLAY',
      url,
    };
    try {
      if (navigator.share && typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch { /* cai para copy */ }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t > 0 ? `Link copiado em ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : 'Link copiado');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-white hover:bg-white/10"
      onClick={handle}
      title="Compartilhar com o momento atual"
     aria-label="Compartilhar">
      <Share2 className="h-5 w-5" />
    </Button>
  );
}
