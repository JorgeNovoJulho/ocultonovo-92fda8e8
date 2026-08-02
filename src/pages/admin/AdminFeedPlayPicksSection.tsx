import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import {
  useOcultoFeedPlayPicksAdmin,
  usePlayCatalog,
  type OcultoFeedPlayPick,
} from '@/hooks/useOcultoFeedNews';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  kind: 'audio' | 'link';
  title: string;
  description: string;
};

/** Gestão dos 4 títulos (músicas ou filmes) exibidos no carrossel do feed. */
export default function AdminFeedPlayPicksSection({ kind, title, description }: Props) {
  const qc = useQueryClient();
  const { data: picks = [], isLoading, refetch } = useOcultoFeedPlayPicksAdmin(kind);
  const { data: catalog = [] } = usePlayCatalog(kind);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['oculto-feed-play-picks'] });
    qc.invalidateQueries({ queryKey: ['oculto-feed-play-picks-admin', kind] });
    refetch();
  };

  const handleAdd = async () => {
    const item = catalog.find((c) => c.id === selected);
    if (!item) return toast.error('Selecione um título do Oculto Play');
    setBusy(true);
    const { error } = await supabase.from('oculto_feed_play_picks').insert({
      kind,
      item_id: item.id,
      title: item.title,
      position: (picks.at(-1)?.position ?? 0) + 1,
      is_active: true,
    });
    setBusy(false);
    if (error) return toast.error(`Erro ao adicionar: ${error.message}`);
    setSelected('');
    toast.success('Título adicionado ao carrossel');
    invalidate();
  };

  const patch = async (pick: OcultoFeedPlayPick, values: Partial<OcultoFeedPlayPick>) => {
    setBusy(true);
    const { error } = await supabase
      .from('oculto_feed_play_picks')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', pick.id);
    setBusy(false);
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    toast.success('Atualizado');
    invalidate();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = picks[index];
    const b = picks[index + dir];
    if (!a || !b) return;
    setBusy(true);
    const { error } = await supabase
      .from('oculto_feed_play_picks')
      .upsert([
        { id: a.id, position: b.position },
        { id: b.id, position: a.position },
      ]);
    setBusy(false);
    if (error) return toast.error(`Erro ao reordenar: ${error.message}`);
    invalidate();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('oculto_feed_play_picks').delete().eq('id', id);
    if (error) return toast.error(`Erro ao remover: ${error.message}`);
    toast.success('Título removido');
    invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Escolher título publicado no Oculto Play" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {catalog.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : picks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum título fixado — o carrossel mostra automaticamente os 4 mais recentes.
          </p>
        ) : (
          picks.map((pick, i) => (
            <div
              key={pick.id}
              className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border border-border rounded-lg p-3"
            >
              <Input
                className="flex-1"
                defaultValue={pick.title}
                onBlur={(e) =>
                  e.target.value.trim() !== pick.title &&
                  patch(pick, { title: e.target.value.trim() })
                }
              />
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => move(i, -1)} disabled={i === 0 || busy}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => move(i, 1)}
                  disabled={i === picks.length - 1 || busy}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={pick.is_active}
                  onCheckedChange={(v) => patch(pick, { is_active: v })}
                />
                <Label className="text-xs">Ativo</Label>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => patch(pick, {})} disabled={busy}>
                  <Save className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(pick.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
