/**
 * ShareToCommunityModal — Etapa 57 (Play → Comunidade).
 *
 * Responsivo, scroll invisível, nomes longos quebram linha sem cortar,
 * nada estoura o modal em telas pequenas.
 *
 * Antes vivia dentro de PlayShareMenu.tsx — extraído para reuso.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Users, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMyCommunities } from '@/hooks/useCommunities';
import { useSharePlayToCommunity } from '@/hooks/useOcultoPlayExtras';

interface Props {
  open: boolean;
  onClose: () => void;
  itemId: string;
  title?: string | null;
  abovePlayer?: boolean;
}

export function ShareToCommunityModal({
  open, onClose, itemId, title, abovePlayer,
}: Props) {
  const { data: myCommunities = [], isLoading } = useMyCommunities();
  const share = useSharePlayToCommunity();
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    if (!selected) { toast.error('Escolha uma comunidade'); return; }
    try {
      await share.mutateAsync({ itemId, communityId: selected, message: msg.trim() || undefined });
      toast.success('Compartilhado na comunidade!');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao compartilhar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[95vw] max-w-md p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden"
        overlayClassName={abovePlayer ? '!z-[2147482099]' : undefined}
        style={abovePlayer ? { zIndex: 2147482100 } : undefined}
      >
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-fuchsia-300" /> Postar em Comunidade
          </DialogTitle>
        </DialogHeader>

        {/* Conteúdo rolável (scroll invisível) */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3
                     [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {title && (
            <p className="text-xs text-muted-foreground break-words">
              Item: <span className="text-foreground break-words">“{title}”</span>
            </p>
          )}

          <div>
            <Label className="text-xs">Mensagem (opcional)</Label>
            <Textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value.slice(0, 280))}
              placeholder="Por que vale a pena ver…"
              rows={2}
              className="mt-1 text-sm resize-none"
            />
          </div>

          <div>
            <Label className="text-xs">Suas comunidades</Label>
            {isLoading ? (
              <div className="py-6 grid place-items-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (myCommunities as any[]).length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                Você ainda não participa de nenhuma comunidade.
              </p>
            ) : (
              <div
                className="mt-1 grid gap-1 max-h-60 overflow-y-auto pr-1
                           [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {(myCommunities as any[]).map((c: any) => (
                  <label
                    key={c.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-sm min-w-0 ${
                      selected === c.id ? 'border-fuchsia-400 bg-fuchsia-500/10' : 'border-border/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="community"
                      checked={selected === c.id}
                      onChange={() => setSelected(c.id)}
                      className="accent-fuchsia-500 mt-1 shrink-0"
                    />
                    <span className="flex-1 min-w-0 break-words whitespace-normal leading-snug">
                      {c.name || c.title || c.slug || c.id}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border/60 shrink-0 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={submit} disabled={share.isPending || !selected}>
            {share.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Postar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
