/**
 * ManageChannelsModal — owner/moderador cria, edita e remove sub-fóruns (canais).
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Hash, Plus, Trash2, Loader2, Pencil, X } from 'lucide-react';
import {
  useCommunityChannels,
  useUpsertCommunityChannel,
  useDeleteCommunityChannel,
} from '@/hooks/useCommunities';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
}

export function ManageChannelsModal({ open, onOpenChange, communityId }: Props) {
  const { data: channels = [], isLoading } = useCommunityChannels(communityId);
  const upsert = useUpsertCommunityChannel(communityId);
  const del = useDeleteCommunityChannel(communityId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => { setEditingId(null); setName(''); setDescription(''); };

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    await upsert.mutateAsync({
      id: editingId,
      name: trimmed,
      description: description.trim() || null,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Canais (sub-fóruns)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Form criar/editar */}
          <div className="rounded-lg border border-border p-3 space-y-2 bg-card/40">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">
                {editingId ? 'Editar canal' : 'Novo canal'}
              </p>
              {editingId && (
                <button onClick={reset} className="text-[10px] text-muted-foreground hover:text-foreground">
                  Cancelar edição
                </button>
              )}
            </div>
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="ex.: anúncios, dúvidas, encontros…"
              />
            </div>
            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={160}
                rows={2}
                placeholder="Sobre o que é este canal?"
              />
            </div>
            <Button onClick={submit} disabled={upsert.isPending || name.trim().length < 2} className="w-full gap-1">
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />)}
              {editingId ? 'Salvar alterações' : 'Criar canal'}
            </Button>
          </div>

          {/* Lista */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground px-1">
              Canais ({channels.length})
            </p>
            {isLoading && <p className="text-xs text-muted-foreground px-1">Carregando…</p>}
            {!isLoading && channels.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">Nenhum canal ainda. Crie o primeiro acima.</p>
            )}
            {channels.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <Hash className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.description && (
                    <p className="text-[10px] text-muted-foreground truncate">{c.description}</p>
                  )}
                </div>
                <button
                  onClick={() => { setEditingId(c.id); setName(c.name); setDescription(c.description || ''); }}
                  className="h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Remover o canal "${c.name}"? Os tópicos serão movidos para "Sem canal".`))
                      del.mutate(c.id);
                  }}
                  className="h-7 w-7 rounded-md hover:bg-destructive/20 flex items-center justify-center text-destructive"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
