/**
 * AdminPostCommentModal — Editor do "Comentário Master" fixado no topo da postagem.
 * Acesso restrito ao @ocultomaster. Permite cor de fundo, cor do texto, tamanho,
 * família tipográfica e negrito para destacar o post no feed.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  useUpsertPostAdminComment,
  useDeletePostAdminComment,
  type PostAdminComment,
} from '@/hooks/usePostAdminComment';
import { Trash2, Megaphone, Bold } from 'lucide-react';
import { ensureFont } from '@/components/admin/ads/editor/fontsCatalog';

const FONT_OPTIONS: { value: string; label: string; google?: string }[] = [
  { value: 'sans-serif',          label: 'Sans (padrão)' },
  { value: 'serif',               label: 'Serif' },
  { value: 'monospace',           label: 'Monospace' },
  { value: 'Georgia, serif',      label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: '"Comic Sans MS", cursive', label: 'Comic Sans' },
  { value: 'Impact, sans-serif',  label: 'Impact' },
  // +10 novas via Google Fonts (sob demanda)
  { value: '"Inter", sans-serif',            label: 'Inter',            google: 'Inter' },
  { value: '"Poppins", sans-serif',          label: 'Poppins',          google: 'Poppins' },
  { value: '"Montserrat", sans-serif',       label: 'Montserrat',       google: 'Montserrat' },
  { value: '"Bebas Neue", sans-serif',       label: 'Bebas Neue',       google: 'Bebas Neue' },
  { value: '"Anton", sans-serif',            label: 'Anton',            google: 'Anton' },
  { value: '"Oswald", sans-serif',           label: 'Oswald',           google: 'Oswald' },
  { value: '"Playfair Display", serif',      label: 'Playfair Display', google: 'Playfair Display' },
  { value: '"Pacifico", cursive',            label: 'Pacifico',         google: 'Pacifico' },
  { value: '"Permanent Marker", cursive',    label: 'Permanent Marker', google: 'Permanent Marker' },
  { value: '"Orbitron", sans-serif',         label: 'Orbitron',         google: 'Orbitron' },
  // +10 novas (lote 2) — variedade extra de estilos
  { value: '"Lobster", cursive',             label: 'Lobster',          google: 'Lobster' },
  { value: '"Dancing Script", cursive',      label: 'Dancing Script',   google: 'Dancing Script' },
  { value: '"Caveat", cursive',              label: 'Caveat',           google: 'Caveat' },
  { value: '"Shadows Into Light", cursive',  label: 'Shadows Into Light', google: 'Shadows Into Light' },
  { value: '"Press Start 2P", monospace',    label: 'Press Start 2P',   google: 'Press Start 2P' },
  { value: '"Russo One", sans-serif',        label: 'Russo One',        google: 'Russo One' },
  { value: '"Righteous", sans-serif',        label: 'Righteous',        google: 'Righteous' },
  { value: '"Fredoka", sans-serif',          label: 'Fredoka',          google: 'Fredoka' },
  { value: '"Abril Fatface", serif',         label: 'Abril Fatface',    google: 'Abril Fatface' },
  { value: '"Cinzel", serif',                label: 'Cinzel',           google: 'Cinzel' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId: string;
  authorId: string; // master user id
  existing?: PostAdminComment | null;
}

export function AdminPostCommentModal({ open, onOpenChange, postId, authorId, existing }: Props) {
  const [content,    setContent]    = useState('');
  const [bgColor,    setBgColor]    = useState('#1f1f1f');
  const [textColor,  setTextColor]  = useState('#ffffff');
  const [fontSize,   setFontSize]   = useState(14);
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [bold,       setBold]       = useState(false);

  const upsert = useUpsertPostAdminComment();
  const remove = useDeletePostAdminComment();

  useEffect(() => {
    if (!open) return;
    setContent(existing?.content ?? '');
    setBgColor(existing?.bg_color ?? '#1f1f1f');
    setTextColor(existing?.text_color ?? '#ffffff');
    setFontSize(existing?.font_size ?? 14);
    setFontFamily(existing?.font_family ?? 'sans-serif');
    setBold(!!existing?.bold);
  }, [open, existing]);

  // Pré-carrega todas as Google Fonts quando o modal abre (para o dropdown e preview)
  useEffect(() => {
    if (!open) return;
    FONT_OPTIONS.forEach((opt) => { if (opt.google) ensureFont(opt.google); });
  }, [open]);

  // Garante carregamento da fonte selecionada
  useEffect(() => {
    const opt = FONT_OPTIONS.find((o) => o.value === fontFamily);
    if (opt?.google) ensureFont(opt.google);
  }, [fontFamily]);

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast({ title: 'Texto obrigatório', description: 'Escreva o comentário antes de salvar.', variant: 'destructive' });
      return;
    }
    try {
      await upsert.mutateAsync({
        post_id: postId,
        content: trimmed,
        bg_color: bgColor,
        text_color: textColor,
        font_size: Math.max(10, Math.min(28, Math.round(fontSize))),
        font_family: fontFamily,
        bold,
        author_id: authorId,
      });
      toast({ title: '📢 Comentário Master publicado', description: 'O destaque aparece no topo desta postagem para todos.' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(postId);
      toast({ title: 'Comentário removido', description: 'O destaque do master foi apagado desta postagem.' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-amber-400" />
            Comentário Master
          </DialogTitle>
          <DialogDescription>
            Esse texto aparece como um banner no topo desta postagem para todos os usuários.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amc-content">Texto</Label>
            <Textarea
              id="amc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={400}
              rows={3}
              placeholder="Ex.: 🔥 Postagem em destaque pela equipe Oculto."
            />
            <p className="text-[11px] text-muted-foreground text-right">{content.length}/400</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amc-bg">Cor de fundo</Label>
              <div className="flex items-center gap-2">
                <Input id="amc-bg" type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-10 w-14 p-1" />
                <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-10 flex-1 font-mono text-xs" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amc-fg">Cor do texto</Label>
              <div className="flex items-center gap-2">
                <Input id="amc-fg" type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-10 w-14 p-1" />
                <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-10 flex-1 font-mono text-xs" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tamanho da fonte ({fontSize}px)</Label>
            <Slider min={10} max={28} step={1} value={[fontSize]} onValueChange={(v) => setFontSize(v[0] ?? 14)} />
          </div>

          <div className="space-y-2">
            <Label>Família tipográfica</Label>
            <div className="flex items-center gap-2">
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {FONT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBold((b) => !b)}
                aria-pressed={bold}
                title="Negrito"
                aria-label="Negrito"
                className={cn(
                  'h-10 w-10 p-0 shrink-0',
                  bold && 'bg-amber-500 text-black border-amber-500 hover:bg-amber-600 hover:text-black',
                )}
              >
                <Bold className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Pré-visualização</Label>
            <div
              className="rounded-lg px-3 py-2 leading-snug border border-border/60"
              style={{
                backgroundColor: bgColor,
                color: textColor,
                fontSize: `${fontSize}px`,
                fontFamily,
                fontWeight: bold ? 700 : 400,
              }}
            >
              {content.trim() || 'Pré-visualização do comentário master…'}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {existing && (
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending} className="mr-auto gap-1">
              <Trash2 className="h-4 w-4" />
              Remover
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending} className="bg-amber-500 text-black hover:bg-amber-600">
            {upsert.isPending ? 'Salvando…' : 'Publicar destaque'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
