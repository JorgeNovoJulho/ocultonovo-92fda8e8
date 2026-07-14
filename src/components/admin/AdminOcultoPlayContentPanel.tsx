/**
 * AdminOcultoPlayContentPanel — Conteúdo (PROMPT 3 — Etapa 6)
 * Lista itens do Play com filtros e ações (ocultar, destacar, marcar sensível).
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, EyeOff, Star, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOcultoPlayCategories } from '@/hooks/useOcultoPlayCategories';

type Item = {
  id: string;
  author_id: string;
  kind: string;
  title: string | null;
  caption: string | null;
  is_published: boolean;
  is_featured?: boolean;
  is_sensitive?: boolean;
  category_id?: string | null;
  view_count: number;
  like_count: number;
  report_count: number;
  created_at: string;
};


const KINDS = ['all', 'short_video', 'meme', 'audio', 'vip_teaser', 'community_post', 'challenge'] as const;

export function AdminOcultoPlayContentPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<typeof KINDS[number]>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { data: categories } = useOcultoPlayCategories({ onlyActive: false });

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('oculto_play_items' as never)
      .select('id, author_id, kind, title, caption, is_published, is_featured, is_sensitive, category_id, view_count, like_count, report_count, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (kind !== 'all') q = q.eq('kind', kind);
    if (categoryId !== 'all') q = q.eq('category_id', categoryId);
    const { data, error } = await q;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Item[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind, categoryId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter(i =>
      (i.title ?? '').toLowerCase().includes(s) ||
      (i.caption ?? '').toLowerCase().includes(s) ||
      i.id.includes(s) ||
      i.author_id.includes(s)
    );
  }, [items, search]);

  const update = async (id: string, patch: Partial<Item>) => {
    const { error } = await supabase.from('oculto_play_items' as never).update(patch as never).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Atualizado');
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  const categoryLabelById = useMemo(() => {
    const m = new Map<string, string>();
    (categories ?? []).forEach(c => m.set(c.id, c.label));
    return m;
  }, [categories]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        <Input placeholder="Buscar por título, caption, id…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={kind} onValueChange={v => setKind(v as typeof KINDS[number])}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {KINDS.map(k => <SelectItem key={k} value={k}>{k === 'all' ? 'Todos os tipos' : k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {(categories ?? []).map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}{!c.is_active ? ' (inativa)' : ''}{c.is_adult ? ' • 18+' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Recarregar
        </Button>
      </div>


      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum item encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(it => (
            <Card key={it.id}>
              <CardContent className="p-3 flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{it.kind}</Badge>
                    {it.category_id && categoryLabelById.get(it.category_id) && (
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                        {categoryLabelById.get(it.category_id)}
                      </Badge>
                    )}
                    {it.is_featured && <Badge className="text-[10px] bg-amber-500/90">Destaque</Badge>}
                    {it.is_sensitive && <Badge variant="destructive" className="text-[10px]">Sensível</Badge>}
                    {!it.is_published && <Badge variant="secondary" className="text-[10px]">Oculto</Badge>}
                    {(it.report_count ?? 0) > 0 && <Badge variant="destructive" className="text-[10px]">{it.report_count} denúncia(s)</Badge>}
                  </div>

                  <p className="text-sm font-medium truncate mt-1">{it.title || it.caption || '(sem título)'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {it.view_count} views · {it.like_count} likes · {new Date(it.created_at).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{it.id}</p>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => window.open(`/play/p/${it.id}`, '_blank')} title="Abrir">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => update(it.id, { is_featured: !it.is_featured })} title="Destacar">
                    <Star className={`h-3.5 w-3.5 ${it.is_featured ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => update(it.id, { is_sensitive: !it.is_sensitive })} title="Sensível">
                    <AlertTriangle className={`h-3.5 w-3.5 ${it.is_sensitive ? 'text-destructive' : ''}`} />
                  </Button>
                  <Button size="sm" variant={it.is_published ? 'destructive' : 'default'} onClick={() => update(it.id, { is_published: !it.is_published })} title={it.is_published ? 'Ocultar' : 'Publicar'}>
                    <EyeOff className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
