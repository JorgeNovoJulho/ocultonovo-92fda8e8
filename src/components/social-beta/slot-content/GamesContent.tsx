/**
 * GamesContent — "Sortear carta solo".
 * Lê um card aleatório direto de oculto_social_beta_cards (RLS permite leitura
 * de cards habilitados a qualquer authenticated). Sem precisar de sessão.
 */
import { useCallback, useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useSocialBetaSlotEvent } from '@/hooks/useSocialBetaSlotEvent';
import { toast } from 'sonner';

type Card = {
  id: string;
  module_code: string;
  category: string | null;
  level: string;
  content: string;
};

const LEVEL_LABEL: Record<string, string> = {
  leve: 'Leve',
  divertido: 'Divertido',
  provocante: 'Provocante',
  avancado: 'Avançado',
};

const MAX_ORDER: Record<string, number> = { leve: 1, divertido: 2, provocante: 3, avancado: 4 };

export function GamesContent() {
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const { track } = useSocialBetaSlotEvent('games', true);

  const draw = useCallback(async () => {
    setLoading(true);
    track('draw_card');
    try {
      const { data, error } = await supabase
        .from('oculto_social_beta_cards')
        .select('id, module_code, category, level, content')
        .eq('enabled', true)
        .limit(40);
      if (error) throw error;
      const list = (data || []) as Card[];
      const filtered = list.filter((c) => (MAX_ORDER[c.level] ?? 1) <= 3);
      const pick = filtered.length > 0
        ? filtered[Math.floor(Math.random() * filtered.length)]
        : list[Math.floor(Math.random() * Math.max(1, list.length))];
      setCard(pick ?? null);
      if (pick) track('card_revealed', { card_id: pick.id, level: pick.level });
      if (!pick) toast.info('Nenhum card disponível.');
    } catch (e: any) {
      toast.error('Não foi possível sortear agora.');
    } finally {
      setLoading(false);
    }
  }, [track]);

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-foreground" />
        <h2 className="font-semibold">Sortear uma carta</h2>
        <span className="ml-auto text-xs text-muted-foreground">prévia solo</span>
      </div>

      {card ? (
        <div className="rounded-lg border border-border bg-background p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {card.module_code}
            </span>
            {card.category && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {card.category}
              </span>
            )}
            <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              {LEVEL_LABEL[card.level] ?? card.level}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground">{card.content}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Toque em "Sortear" para receber uma carta aleatória — sem precisar abrir sessão.
        </p>
      )}

      <button
        onClick={draw}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sorteando…</>
        ) : (
          <><RefreshCw className="h-3.5 w-3.5" /> {card ? 'Sortear outra' : 'Sortear'}</>
        )}
      </button>
    </section>
  );
}
