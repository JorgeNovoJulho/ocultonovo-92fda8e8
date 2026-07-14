/**
 * AdminInterestTagsPage — CRUD das tags de interesse (social/+18)
 * usadas no cadastro e no perfil. Master admin only.
 * Efeito imediato via realtime + invalidação do React Query.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Tag, Flame, Sparkles, Loader2 } from 'lucide-react';
import type { InterestTagKind, InterestTagRow } from '@/hooks/useInterestTags';
import { InterestIconPicker } from '@/components/admin/InterestIconPicker';

function useAllInterestTags() {
  const qc = useQueryClient();
  const q = useQuery<InterestTagRow[]>({
    queryKey: ['interest-tags', 'admin', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_interest_tags' as never)
        .select('id,kind,name,icon,position,is_active')
        .order('kind', { ascending: true })
        .order('position', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InterestTagRow[];
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel('admin-interest-tags-rt')
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'oculto_interest_tags' } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['interest-tags'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
  return q;
}

function TagRow({ row }: { row: InterestTagRow }) {
  const qc = useQueryClient();
  const [name, setName] = useState(row.name);
  const [icon, setIcon] = useState(row.icon ?? '');
  const [position, setPosition] = useState(row.position);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== row.name || (icon || '') !== (row.icon || '') || position !== row.position;

  async function save() {
    if (!name.trim()) {
      toast.error('Nome obrigatório');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('oculto_interest_tags' as never)
      .update({ name: name.trim(), icon: icon.trim() || null, position })
      .eq('id', row.id);
    setSaving(false);
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    toast.success('Tag atualizada');
    qc.invalidateQueries({ queryKey: ['interest-tags'] });
  }

  async function toggleActive(next: boolean) {
    const { error } = await supabase
      .from('oculto_interest_tags' as never)
      .update({ is_active: next })
      .eq('id', row.id);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ['interest-tags'] });
  }

  async function remove() {
    if (!confirm(`Excluir "${row.name}"?`)) return;
    const { error } = await supabase
      .from('oculto_interest_tags' as never)
      .delete()
      .eq('id', row.id);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success('Tag removida');
    qc.invalidateQueries({ queryKey: ['interest-tags'] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/40 p-2">
      <InterestIconPicker
        value={icon}
        onChange={setIcon}
        kind={row.kind}
      />

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-[160px] flex-1"
      />
      <Input
        type="number"
        value={position}
        onChange={(e) => setPosition(Number(e.target.value) || 0)}
        className="w-20"
        title="Ordem"
      />
      <div className="flex items-center gap-1 text-xs">
        <Switch checked={row.is_active} onCheckedChange={toggleActive} />
        <span className="text-muted-foreground">{row.is_active ? 'ativa' : 'oculta'}</span>
      </div>
      <Button size="sm" onClick={save} disabled={!dirty || saving} className="h-8">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      </Button>
      <Button size="sm" variant="ghost" onClick={remove} className="h-8 text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AddTagInline({ kind }: { kind: InterestTagKind }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('oculto_interest_tags' as never).insert({
      kind,
      name: name.trim(),
      icon: icon.trim() || null,
      position: 9999,
      is_active: true,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success('Tag adicionada');
    setName('');
    setIcon('');
    qc.invalidateQueries({ queryKey: ['interest-tags'] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2">
      <InterestIconPicker value={icon} onChange={setIcon} kind={kind} />

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Nova tag ${kind === 'adult' ? '+18' : 'social'}`}
        className="min-w-[180px] flex-1"
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <Button size="sm" onClick={add} disabled={!name.trim() || busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Adicionar
      </Button>
    </div>
  );
}

export default function AdminInterestTagsPage() {
  const { data, isLoading } = useAllInterestTags();
  const social = useMemo(() => (data ?? []).filter((r) => r.kind === 'social'), [data]);
  const adult = useMemo(() => (data ?? []).filter((r) => r.kind === 'adult'), [data]);

  return (
    <div className="container max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-2">
        <Tag className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Tags de Interesse</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Tags exibidas no <strong>cadastro</strong> (etapa Interesses) e na edição do{' '}
        <strong>perfil</strong>. Alterações entram em vigor imediatamente para todos os usuários.
      </p>

      <Tabs defaultValue="social">
        <TabsList>
          <TabsTrigger value="social" className="gap-2">
            <Sparkles className="h-4 w-4" /> Social
            <Badge variant="secondary">{social.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="adult" className="gap-2">
            <Flame className="h-4 w-4" /> +18
            <Badge variant="secondary">{adult.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="social" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interesses Sociais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AddTagInline kind="social" />
              {isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {social.map((row) => (
                <TagRow key={row.id} row={row} />
              ))}
              {!isLoading && !social.length && (
                <p className="text-xs text-muted-foreground">Nenhuma tag social cadastrada.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adult" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interesses +18</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AddTagInline kind="adult" />
              {isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {adult.map((row) => (
                <TagRow key={row.id} row={row} />
              ))}
              {!isLoading && !adult.length && (
                <p className="text-xs text-muted-foreground">Nenhuma tag +18 cadastrada.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
