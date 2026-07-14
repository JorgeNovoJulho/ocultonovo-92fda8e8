/**
 * PlayShareMenu — Etapas 56 (Play→Chat) e 57 (Play→Comunidade).
 *
 * Menu compacto com:
 *   - Copiar / compartilhar link
 *   - Enviar no Chat (ShareToChatModal)
 *   - Postar em Comunidade (ShareToCommunityModal)
 */
import { forwardRef, useMemo, useState } from 'react';
import { Share2, Users, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  ocultoPlayShareUrlForSocial,
  ocultoPlayShareUrlWithBust,
} from '@/lib/ocultoPlayShareUrl';
import { ShareToChatModal } from './ShareToChatModal';
import { ShareToCommunityModal } from './ShareToCommunityModal';
import { useOcultoPlayActions } from '@/hooks/useOcultoPlayContent';

interface Props {
  itemId: string;
  title?: string | null;
  author?: string | null;
  className?: string;
  trigger?: React.ReactNode;
  onShared?: () => void;
  abovePlayer?: boolean;
}

export const PlayShareMenu = forwardRef<HTMLSpanElement, Props>(function PlayShareMenu(
  { itemId, title, author, className, trigger, onShared, abovePlayer = false }: Props,
  ref,
) {
  const [chatOpen, setChatOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const actions = useOcultoPlayActions();

  const url = useMemo(() => ocultoPlayShareUrlWithBust(itemId), [itemId]);
  const socialUrl = useMemo(() => ocultoPlayShareUrlForSocial(itemId), [itemId]);

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const markShared = () => {
      onShared?.();
      if (!actions.registerShare.isPending) actions.registerShare.mutate(itemId);
    };
    try {
      if ((navigator as any)?.share) {
        await (navigator as any).share({
          title: title || 'OCULTO PLAY',
          text: author ? `${title || 'Item'} — @${author}` : (title || 'Item'),
          url: socialUrl,
        });
        markShared();
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
      markShared();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(url); toast.success('Link copiado!'); markShared(); }
      catch { toast.error('Não consegui compartilhar.'); }
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ? (
            <span ref={ref} onClick={(e) => e.stopPropagation()}>{trigger}</span>
          ) : (
            <span ref={ref} className="inline-flex">
              <button
                onClick={(e) => e.stopPropagation()}
                className={className || 'grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white hover:bg-fuchsia-500/70'}
                title="Compartilhar"
                aria-label="Compartilhar"
              >
                <Share2 className="h-3 w-3" />
              </button>
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52"
          style={abovePlayer ? { zIndex: 2147482101 } : undefined}
        >
          <DropdownMenuItem onClick={copyLink}>
            <Share2 className="h-3.5 w-3.5 mr-2" /> Copiar / compartilhar link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setChatOpen(true); }}>
            <MessageCircle className="h-3.5 w-3.5 mr-2" /> Enviar no Chat
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCommunityOpen(true); }}>
            <Users className="h-3.5 w-3.5 mr-2" /> Postar em Comunidade
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {chatOpen && (
        <ShareToChatModal
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          itemId={itemId}
          url={socialUrl}
          title={title}
          author={author}
          abovePlayer={abovePlayer}
        />
      )}
      {communityOpen && (
        <ShareToCommunityModal
          open={communityOpen}
          onClose={() => setCommunityOpen(false)}
          itemId={itemId}
          title={title}
          abovePlayer={abovePlayer}
        />
      )}
    </>
  );
});
