/**
 * AdminOcultoPlayPlaylistsPanel — Etapa 23.
 * CRUD de playlists/destaques editoriais do OCULTO PLAY (somente Master).
 *
 * UX simples:
 *  - Lista de playlists com toggle ativo, editar, excluir.
 *  - Form de criar/editar (slug/título/descrição/capa/posição/ativo).
 *  - Drawer com itens da playlist: adicionar por ID do item, remover.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Plus, ListMusic, Pencil, Trash2, X, Save, Layers, Hash,
} from 'lucide-react';
import {
  useAdminOcultoPlayPlaylists,
  useOcultoPlayPlaylistItems,
  useUpsertPlaylist,
  useDeletePlaylist,
  useAddPlaylistItem,
  useRemovePlaylistItem,
  type OcultoPlayPlaylist,
} from '@/hooks/useOcultoPlayPlaylists';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SLUG_RE = /^[a-z0-9-]+$/;

interface DraftForm {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  cover_url: string;
  is_active: boolean;
  position: number;
}

const emptyDraft: DraftForm = {
  id: null, slug: '', title: '', description: '', cover_url: '',
  is_active: true, position: 0,
};

export function AdminOcultoPlayPlaylistsPanel() {
  const list = useAdminOcultoPlayPlaylists();
  const upsert = useUpsertPlaylist();
  const del = useDeletePlaylist();

  const [editing, setEditing] = useState<DraftForm | null>(null);
  const [itemsOpen, setItemsOpen] = useState<OcultoPlayPlaylist | null>(null);

  const openCreate = () => setEditing({ ...emptyDraft });
  const openEdit = (p: OcultoPlayPlaylist) =>
    setEditing({
      id: p.id, slug: p.slug, title: p.title,
      description: p.description ?? '', cover_url: p.cover_url ?? '',
      is_active: p.is_active, position: p.position,
    });

  const save = async () => {
    if (!editing) return;
    const slug = editing.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      toast.error('Slug inválido: use apenas letras minúsculas, números e hífens.');
      return;
    }
    if (!editing.title.trim()) { toast.error('Título obrigatório'); return; }
    try {
      await upsert.mutateAsync({ ...editing, slug });
      toast.success(editing.id ? 'Playlist atualizada' : 'Playlist criada');
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar');
    }
  };

  const toggleActive = async (p: OcultoPlayPlaylist) => {
    try {
      await upsert.mutateAsync({
        id: p.id, slug: p.slug, title: p.title,
        description: p.description, cover_url: p.cover_url,
        is_active: !p.is_active, position: p.position,
      });
    } catch (e: any) { toast.error(e?.message ?? 'Erro'); }
  };

  const remove = async (p: OcultoPlayPlaylist) => {
    if (!confirm(`Excluir playlist "${p.title}"? Itens vinculados também serão removidos.`)) return;
    try {
      await del.mutateAsync(p.id);
      toast.success('Playlist excluída');
    } catch (e: any) { toast.error(e?.message ?? 'Erro'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ListMusic className="h-4 w-4 text-primary" /> Playlists / Destaques editoriais
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Coleções curadas exibidas no OCULTO PLAY. Apenas Master pode editar.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nova playlist
        </Button>
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma playlist criada ainda.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.data!.map((p) => (
            <Card key={p.id} className={cn(!p.is_active && 'opacity-60')}>
              <CardContent className="p-3 flex gap-3">
                <div className="h-16 w-16 rounded-md bg-muted/40 overflow-hidden shrink-0 grid place-items-center">
                  {p.cover_url ? (
                    <img src={p.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Layers className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{p.title}</p>
                    {!p.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">/{p.slug} · pos {p.position}</p>
                  {p.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                      onClick={() => setItemsOpen(p)}>
                      <Hash className="h-3 w-3 mr-1" /> Itens
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                      onClick={() => openEdit(p)}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => toggleActive(p)}>
                      {p.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive"
                      onClick={() => remove(p)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de edição */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar playlist' : 'Nova playlist'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Slug (URL)</Label>
                <Input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="destaques-da-semana"
                />
              </div>
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Textarea rows={2} value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">URL da capa</Label>
                <Input value={editing.cover_url}
                  onChange={(e) => setEditing({ ...editing, cover_url: e.target.value })}
                  placeholder="https://…/capa.jpg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Posição</Label>
                  <Input type="number" value={editing.position}
                    onChange={(e) => setEditing({ ...editing, position: parseInt(e.target.value || '0', 10) })} />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <Label className="text-xs">Ativa</Label>
                  <Switch checked={editing.is_active}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer/modal de itens */}
      <PlaylistItemsDialog
        playlist={itemsOpen}
        onClose={() => setItemsOpen(null)}
      />
    </div>
  );
}

function PlaylistItemsDialog({
  playlist, onClose,
}: { playlist: OcultoPlayPlaylist | null; onClose: () => void }) {
  const items = useOcultoPlayPlaylistItems(playlist?.id ?? null);
  const add = useAddPlaylistItem();
  const remove = useRemovePlaylistItem();
  const [newItemId, setNewItemId] = useState('');

  const handleAdd = async () => {
    if (!playlist) return;
    const id = newItemId.trim();
    if (!id) return;
    try {
      await add.mutateAsync({ playlistId: playlist.id, itemId: id });
      setNewItemId('');
      toast.success('Item adicionado');
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao adicionar'); }
  };

  const handleRemove = async (itemId: string) => {
    if (!playlist) return;
    try {
      await remove.mutateAsync({ playlistId: playlist.id, itemId });
    } catch (e: any) { toast.error(e?.message ?? 'Erro'); }
  };

  const sorted = useMemo(() => items.data ?? [], [items.data]);

  return (
    <Dialog open={!!playlist} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4" /> {playlist?.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="ID do item (oculto_play_items.id)"
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)} />
            <Button onClick={handleAdd} disabled={add.isPending || !newItemId.trim()}>
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {items.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Sem itens na playlist.
            </p>
          ) : (
            <ul className="space-y-1 max-h-80 overflow-y-auto">
              {sorted.map((i) => (
                <li key={i.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border/40 bg-muted/20 text-xs">
                  <span className="font-mono truncate">{i.item_id}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">pos {i.position}</Badge>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleRemove(i.item_id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AdminOcultoPlayPlaylistsPanel;
