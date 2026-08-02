import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoFeedNewsAdmin, type OcultoFeedNewsItem } from '@/hooks/useOcultoFeedNews';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

/**
 * Painel master — configura o card "Novidades Recentes do Oculto"
 * exibido no carrossel "Novidades do Oculto" do feed principal.
 */
export default function AdminFeedNovidadesPage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading, refetch } = useOcultoFeedNewsAdmin();
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmoji, setNewEmoji] = useState('✨');
  const [drafts, setDrafts] = useState<Record<string, Partial<OcultoFeedNewsItem>>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['oculto-feed-news'] });
    qc.invalidateQueries({ queryKey: ['oculto-feed-news-admin'] });
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return toast.error('Informe o título da novidade');
    setSaving(true);
    const { error } = await supabase.from('oculto_feed_news').insert({
      title: newTitle.trim(),
      emoji: newEmoji || '✨',
      position: (items.at(-1)?.position ?? 0) + 1,
      is_active: true,
    });
    setSaving(false);
    if (error) return toast.error(`Erro ao adicionar: ${error.message}`);
    setNewTitle('');
    toast.success('Novidade adicionada');
    invalidate();
    refetch();
  };

  const handleSave = async (item: OcultoFeedNewsItem) => {
    const draft = drafts[item.id] || {};
    setSaving(true);
    const { error } = await supabase
      .from('oculto_feed_news')
      .update({
        title: (draft.title ?? item.title).trim(),
        emoji: draft.emoji ?? item.emoji,
        position: Number(draft.position ?? item.position) || 0,
        is_active: draft.is_active ?? item.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    setSaving(false);
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    toast.success('Novidade atualizada');
    invalidate();
    refetch();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('oculto_feed_news').delete().eq('id', id);
    if (error) return toast.error(`Erro ao remover: ${error.message}`);
    toast.success('Novidade removida');
    invalidate();
    refetch();
  };

  const setDraft = (id: string, patch: Partial<OcultoFeedNewsItem>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Novidades do Oculto (Feed)</h1>
          <p className="text-sm text-muted-foreground">
            Itens exibidos no card "Novidades Recentes do Oculto" — os 4 primeiros ativos aparecem no feed.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar novidade</CardTitle>
          <CardDescription>Use um emoji curto e um título objetivo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Input
            className="sm:w-20"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            placeholder="✨"
          />
          <Input
            className="flex-1"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Ex.: Agora você pode reagir a comentários"
          />
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novidades cadastradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma novidade cadastrada.</p>
          ) : (
            items.map((item) => {
              const d = drafts[item.id] || {};
              return (
                <div key={item.id} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border border-border rounded-lg p-3">
                  <Input
                    className="sm:w-16"
                    value={d.emoji ?? item.emoji ?? ''}
                    onChange={(e) => setDraft(item.id, { emoji: e.target.value })}
                  />
                  <Input
                    className="flex-1"
                    value={d.title ?? item.title}
                    onChange={(e) => setDraft(item.id, { title: e.target.value })}
                  />
                  <Input
                    type="number"
                    className="sm:w-20"
                    value={String(d.position ?? item.position)}
                    onChange={(e) => setDraft(item.id, { position: Number(e.target.value) })}
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={d.is_active ?? item.is_active}
                      onCheckedChange={(v) => setDraft(item.id, { is_active: v })}
                    />
                    <Label className="text-xs">Ativo</Label>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => handleSave(item)} disabled={saving}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
