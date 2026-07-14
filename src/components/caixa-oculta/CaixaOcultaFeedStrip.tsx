/**
 * CaixaOcultaFeedStrip — injeta campanhas Caixa Oculta aprovadas no feed.
 * Renderiza no máximo 2 cards (mais ativos por created_at).
 * Não monta nada se a feature estiver desativada ou não houver campanhas.
 */
import { useCaixaOcultaSettings, useFeedCaixaOculta } from '@/hooks/useCaixaOculta';
import CaixaOcultaFeedCard from '@/components/caixa-oculta/CaixaOcultaFeedCard';

export function CaixaOcultaFeedStrip() {
  const { data: settings } = useCaixaOcultaSettings();
  const { data: campaigns } = useFeedCaixaOculta(2);

  if (!settings?.enabled || !settings?.show_in_feed) return null;
  const active = (campaigns ?? []).filter((c) => c.status === 'active' || (c.status === 'drawn' && !!c.winners_drawn));
  if (active.length === 0) return null;

  return (
    <div className="space-y-3">
      {active.map((c) => <CaixaOcultaFeedCard key={c.id} campaign={c} />)}
    </div>
  );
}

export default CaixaOcultaFeedStrip;
