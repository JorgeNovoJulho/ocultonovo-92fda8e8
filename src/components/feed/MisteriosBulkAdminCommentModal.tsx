/**
 * MisteriosBulkAdminCommentModal — versão em lote do "Comentário Master".
 *
 * Reaproveita o mesmo schema/estado visual do AdminPostCommentModal, porém
 * aplica o comentário em TODOS os posts informados via `postIds` de uma única vez.
 *
 * Visível apenas para o Admin Master (a checagem é feita pelo chamador).
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Megaphone, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUpsertPostAdminComment } from '@/hooks/usePostAdminComment';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postIds: string[];
  authorId: string;
}

export function MisteriosBulkAdminCommentModal({ open, onOpenChange, postIds, authorId }: Props) {
  const { toast } = useToast();
  const upsert = useUpsertPostAdminComment();

  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState('#1f1f1f');
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(14);
  const [bold, setBold] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (!open) return;
    setContent('');
    setBgColor('#1f1f1f');
    setTextColor('#ffffff');
    setFontSize(14);
    setBold(false);
    setProgress({ done: 0, total: 0 });
  }, [open]);

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast({ title: 'Texto obrigatório', description: 'Escreva o comentário antes de salvar.', variant: 'destructive' });
      return;
    }
    if (!postIds.length) {
      toast({ title: 'Nada para aplicar', description: 'Nenhum mistério visível para receber o comentário.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: postIds.length });
    let ok = 0;
    let fail = 0;

    for (const postId of postIds) {
      try {
        await upsert.mutateAsync({
          post_id: postId,
          content: trimmed,
          bg_color: bgColor,
          text_color: textColor,
          font_size: Math.max(10, Math.min(28, Math.round(fontSize))),
          font_family: 'sans-serif',
          bold,
          author_id: authorId,
        });
        ok++;
      } catch {
        fail++;
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setBusy(false);
    toast({
      title: fail === 0 ? '📢 Comentário aplicado em lote' : `Aplicado com falhas`,
      description: `${ok} mistério(s) atualizados${fail ? ` · ${fail} falharam` : ''}.`,
      variant: fail === 0 ? 'default' : 'destructive',
    });
    if (fail === 0) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-amber-400" />
            Comentário Master em lote
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Vai aplicar o MESMO comentário fixado no topo de <strong>{postIds.length}</strong> mistério(s)
            atualmente visíveis na seção.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Texto</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Escreva o destaque que aparecerá no topo de cada postagem…"
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cor do fundo</Label>
              <Input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} disabled={busy} />
            </div>
            <div>
              <Label className="text-xs">Cor do texto</Label>
              <Input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} disabled={busy} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <Label className="text-xs">Tamanho da fonte ({fontSize}px)</Label>
              <Input
                type="range" min={10} max={28} step={1}
                value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
                disabled={busy}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={bold} onCheckedChange={setBold} disabled={busy} />
              <span className="text-xs text-muted-foreground">Negrito</span>
            </div>
          </div>

          <div
            className="rounded-md border border-border/60 p-3 text-center"
            style={{
              backgroundColor: bgColor,
              color: textColor,
              fontSize: `${fontSize}px`,
              fontWeight: bold ? 700 : undefined,
            }}
          >
            {content.trim() || 'Pré-visualização do destaque'}
          </div>

          {busy && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Aplicando {progress.done}/{progress.total}…
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar em {postIds.length} mistério(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
