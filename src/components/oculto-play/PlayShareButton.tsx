/**
 * PlayShareButton — Etapa 36
 *
 * Compartilha um item do Oculto Play via link público `/play/p/:id`.
 * - Usa Web Share API quando disponível (mobile).
 * - Fallback: copia para a área de transferência.
 */
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ocultoPlayShareUrlForSocial,
  ocultoPlayShareUrlWithBust,
} from '@/lib/ocultoPlayShareUrl';

interface Props {
  itemId: string;
  title?: string | null;
  author?: string | null;
  className?: string;
}

export function PlayShareButton({ itemId, title, author, className }: Props) {
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // URL canônica (limpa) para fallback de cópia; URL social (og-play)
    // para o share nativo, garantindo preview rico em WhatsApp/Telegram.
    const canonical = ocultoPlayShareUrlWithBust(itemId);
    const social = ocultoPlayShareUrlForSocial(itemId);
    const shareTitle = title || 'OCULTO PLAY';
    const shareText = author
      ? `${shareTitle} — por @${author.replace(/^@/, '')} no OCULTO PLAY`
      : `${shareTitle} no OCULTO PLAY`;
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: shareTitle, text: shareText, url: social });
        return;
      }
      await navigator.clipboard.writeText(canonical);
      toast.success('Link copiado!');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(canonical);
        toast.success('Link copiado!');
      } catch {
        toast.error('Não consegui compartilhar.');
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className={
        className ||
        'grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white hover:bg-fuchsia-500/70'
      }
      title="Compartilhar"
      aria-label="Compartilhar"
    >
      <Share2 className="h-3 w-3" />
    </button>
  );
}
