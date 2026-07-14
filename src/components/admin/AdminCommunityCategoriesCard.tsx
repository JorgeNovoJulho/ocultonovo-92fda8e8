/**
 * Painel admin master — CRUD de categorias de Comunidades.
 * RPCs: community_admin_categories_list / upsert / delete.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tag, Plus, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

interface Draft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

const emptyDraft: Draft = {
  name: '', slug: '', description: '', icon: '', sort_order: 0, is_active: true,
};

export function AdminCommunityCategoriesCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin_oculto_community_categories'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('community_admin_categories_list');
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (d: Draft) => {
      const { error } = await (supabase as any).rpc('community_admin_category_upsert', {
        _id: d.id ?? null,
        _name: d.name,
        _slug: d.slug,
        _description: d.description || null,
        _icon: d.icon || null,
        _sort_order: d.sort_order,
        _is_active: d.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Categoria salva');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin_oculto_community_categories'] });
      qc.invalidateQueries({ queryKey: ['oculto_community_categories'] });
    },
    onError: (e: any) => toast.error(e?.message?.includes('duplicate') ? 'Slug já existe' : 'Falha ao salvar'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc('community_admin_category_delete', { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Removida (ou desativada se em uso)');
      qc.invalidateQueries({ queryKey: ['admin_oculto_community_categories'] });
      qc.invalidateQueries({ queryKey: ['oculto_community_categories'] });
    },
    onError: () => toast.error('Falha ao remover'),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Tag className="h-4 w-4 text-fuchsia-400" /> Categorias ({rows.length})
        </h2>
        {!editing && (
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setEditing(emptyDraft)}>
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
        )}
      </div>

      {editing && (
        <div className="mb-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input className="h-8" value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Slug</Label>
              <Input className="h-8" value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
            </div>
            <div>
              <Label className="text-xs">Ícone (lucide)</Label>
              <Input className="h-8" placeholder="Heart, Users, Flame…" value={editing.icon}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Ordem</Label>
              <Input className="h-8" type="number" value={editing.sort_order}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input className="h-8" value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={editing.is_active}
                onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              <Label className="text-xs">Ativa</Label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-7 gap-1" onClick={() => upsert.mutate(editing)} disabled={upsert.isPending || !editing.name || !editing.slug}>
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-border text-xs">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-semibold truncate">{c.name}</p>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">/{c.slug}</Badge>
                {!c.is_active && <Badge className="bg-zinc-600/30 text-zinc-200 text-[9px] h-4 px-1.5">inativa</Badge>}
                {c.icon && <span className="text-[10px] text-muted-foreground">· {c.icon}</span>}
              </div>
              {c.description && <p className="text-[10px] text-muted-foreground truncate">{c.description}</p>}
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => setEditing({
                id: c.id, name: c.name, slug: c.slug,
                description: c.description ?? '', icon: c.icon ?? '',
                sort_order: c.sort_order, is_active: c.is_active,
              })}>
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => { if (confirm('Remover esta categoria?')) remove.mutate(c.id); }}>
              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
            </Button>
          </div>
        ))}
        {rows.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground text-center py-3">Sem categorias.</p>
        )}
      </div>
    </div>
  );
}
