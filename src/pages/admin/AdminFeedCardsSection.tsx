import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import {
  useOcultoFeedCardsAdmin,
  DEFAULT_FEED_CARDS,
  type OcultoFeedCard,
} from '@/hooks/useOcultoFeedNews';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

/** Ativa/desativa e reordena os cards do carrossel "Novidades do Oculto". */
export default function AdminFeedCardsSection() {
  const qc = useQueryClient();
  const { data: cards = DEFAULT_FEED_CARDS, isLoading, refetch } = useOcultoFeedCardsAdmin();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['oculto-feed-cards'] });
    qc.invalidateQueries({ queryKey: ['oculto-feed-cards-admin'] });
    refetch();
  };

  const save = async (rows: OcultoFeedCard[]) => {
    const { error } = await supabase
      .from('oculto_feed_cards')
      .upsert(
        rows.map((r) => ({
          card_key: r.card_key,
          label: r.label,
          position: r.position,
          is_active: r.is_active,
        })),
        { onConflict: 'card_key' }
      );
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    toast.success('Cards do carrossel atualizados');
    invalidate();
  };

  const toggle = (card: OcultoFeedCard, value: boolean) =>
    save([{ ...card, is_active: value }]);

  const move = (index: number, dir: -1 | 1) => {
    const a = cards[index];
    const b = cards[index + dir];
    if (!a || !b) return;
    save([
      { ...a, position: b.position },
      { ...b, position: a.position },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Cards do carrossel</CardTitle>
        </div>
        <CardDescription>
          Ative, desative e reordene os cards exibidos no carrossel "Novidades do Oculto" do feed.
          Cards sem conteúdo disponível para o usuário são ocultados automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          cards.map((card, i) => (
            <div
              key={card.card_key}
              className="flex items-center gap-2 border border-border rounded-lg p-3"
            >
              <span className="text-xs text-muted-foreground w-6">{i + 1}º</span>
              <span className="flex-1 text-sm font-medium">{card.label}</span>
              <Button size="sm" variant="outline" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => move(i, 1)}
                disabled={i === cards.length - 1}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Switch checked={card.is_active} onCheckedChange={(v) => toggle(card, v)} />
                <Label className="text-xs">Ativo</Label>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
