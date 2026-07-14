/**
 * SharePlayItemModal — modal de compartilhamento usado pelo focus modal
 * do OCULTO PLAY.
 *
 * Reúne em um único modal as três ações do menu compacto (PlayShareMenu):
 *   1) Copiar / compartilhar link
 *   2) Enviar no Chat (DM)
 *   3) Postar em Comunidade
 *
 * Continua permitindo:
 *   - Compartilhar no feed principal (cria post com embed do item)
 *   - Compartilhamento nativo do dispositivo (Web Share API)
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, Share2, Loader2, Send, MessageCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ocultoPlayShareUrlForSocial } from '@/lib/ocultoPlayShareUrl';
import { useShareOcultoPlayToFeed } from '@/hooks/useShareOcultoPlayToFeed';
import { ShareToChatModal } from './ShareToChatModal';
import { ShareToCommunityModal } from './ShareToCommunityModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL canônica exibida no campo "Copiar". */
  url: string;
  /** ID do item — usado para gerar a URL de preview rico no share nativo. */
  itemId?: string;
  title?: string;
  author?: string | null;
  onShared?: () => void;
  abovePlayer?: boolean;
}

export function SharePlayItemModal({
  open, onOpenChange, url, itemId, title, author, onShared, abovePlayer = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const shareToFeed = useShareOcultoPlayToFeed();
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const socialUrl = useMemo(
    () => (itemId ? ocultoPlayShareUrlForSocial(itemId) : url),
    [itemId, url],
  );

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado para a área de transferência');
      onShared?.();
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  }

  async function handleNativeShare() {
    if (!canNativeShare) return;
    try {
      await navigator.share({ url: socialUrl, title: title ?? 'OCULTO Play' });
      onShared?.();
      onOpenChange(false);
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        toast.error('Não foi possível abrir o compartilhamento');
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            'w-[95vw] max-w-sm p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden',
            abovePlayer && '!z-[2147482100]',
          )}
          overlayClassName={abovePlayer ? '!z-[2147482099]' : undefined}
        >
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-base">Compartilhar publicação</DialogTitle>
            <DialogDescription className="text-xs">
              Escolha como você quer compartilhar este item do OCULTO PLAY.
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-2
                       [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Link */}
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-2">
              <input
                readOnly
                value={url}
                className="flex-1 bg-transparent text-xs outline-none truncate min-w-0"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                size="sm"
                variant={copied ? 'secondary' : 'default'}
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>

            {/* Ações principais (mesmo menu do PlayShareMenu da imagem 3) */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setChatOpen(true)}
              className="w-full justify-start mt-1"
            >
              <MessageCircle className="h-4 w-4 mr-2 text-fuchsia-400" />
              Enviar no Chat
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setCommunityOpen(true)}
              className="w-full justify-start"
            >
              <Users className="h-4 w-4 mr-2 text-fuchsia-400" />
              Postar em Comunidade
            </Button>

            {itemId && (
              <Button
                type="button"
                variant="default"
                onClick={async () => {
                  if (!itemId || shareToFeed.isPending) return;
                  try {
                    await shareToFeed.mutateAsync({ itemId, item: { id: itemId, title } as any });
                    onShared?.();
                    onOpenChange(false);
                  } catch {
                    /* hook já mostra toast */
                  }
                }}
                disabled={shareToFeed.isPending}
                className="w-full justify-start bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
              >
                {shareToFeed.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Send className="h-4 w-4 mr-2" />}
                Compartilhar no feed principal
              </Button>
            )}

            {canNativeShare && (
              <Button type="button" variant="ghost" onClick={handleNativeShare} className="w-full justify-start">
                <Share2 className="h-4 w-4 mr-2" /> Compartilhar pelo dispositivo
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {itemId && chatOpen && (
        <ShareToChatModal
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          itemId={itemId}
          url={socialUrl}
          title={title}
          author={author ?? null}
          abovePlayer={abovePlayer}
        />
      )}
      {itemId && communityOpen && (
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
}
