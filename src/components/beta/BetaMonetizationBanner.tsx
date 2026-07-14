/**
 * BetaMonetizationBanner — faixa global de aviso usada no TOPO de modais e
 * páginas de monetização durante o Beta. Renderiza nada quando a feature
 * já está liberada (lançamento oficial).
 */
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBetaGuard, type BetaFeatureKey } from '@/hooks/useBetaGuard';

interface Props {
  feature: BetaFeatureKey;
  message?: string;
  className?: string;
  compact?: boolean;
}

const DEFAULT_MESSAGES: Partial<Record<BetaFeatureKey, string>> = {
  monetization:
    'Estamos em Beta Público — nenhuma cobrança é processada. Tudo aqui é mock para você testar a experiência.',
  subscriptions:
    'Assinaturas no Beta são apenas demonstração — nada será cobrado no seu cartão ou PIX.',
  paid_content:
    'Conteúdo pago está em modo Beta — nenhuma compra real é processada agora.',
  vip_channels:
    'Canais VIP estão em pré-visualização — pagamentos só começam no lançamento oficial.',
  payouts:
    'Saques estão pausados durante o Beta — seus ganhos ficam acumulados para o lançamento.',
};

export function BetaMonetizationBanner({
  feature,
  message,
  className,
  compact = false,
}: Props) {
  const { isLocked } = useBetaGuard(feature);
  if (!isLocked) return null;

  const text = message ?? DEFAULT_MESSAGES[feature] ?? DEFAULT_MESSAGES.monetization!;

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-100',
        compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs',
        className,
      )}
    >
      <Sparkles className={cn('shrink-0 text-amber-300', compact ? 'h-3.5 w-3.5 mt-0.5' : 'h-4 w-4 mt-0.5')} />
      <span className="leading-snug">{text}</span>
    </div>
  );
}
