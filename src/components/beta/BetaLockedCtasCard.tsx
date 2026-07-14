/**
 * BetaLockedCtasCard — visão unificada (admin) dos CTAs travados pelo Beta.
 * Mostra cada flag relevante (monetization, subscriptions, paid_content, etc.),
 * o estado atual (ON/OFF) e a lista de CTAs que ficam bloqueados quando OFF.
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Unlock } from 'lucide-react';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';
import { cn } from '@/lib/utils';
import type { BetaFeatureKey } from '@/hooks/useBetaGuard';

interface CtaRow {
  feature: BetaFeatureKey;
  label: string;
  flagLabel: string;
  ctas: { name: string; where: string }[];
}

const ROWS: CtaRow[] = [
  {
    feature: 'monetization',
    flagLabel: 'monetization_enabled',
    label: 'Monetização (master switch)',
    ctas: [
      { name: 'Lances em leilão', where: 'AuctionBidModal' },
      { name: 'Super DM (PIX + Cartão)', where: 'SuperDmPaymentModal' },
      { name: 'Saque de criador', where: 'EarningsPage · BetaWithdrawCTA' },
    ],
  },
  {
    feature: 'subscriptions',
    flagLabel: 'subscriptions_enabled',
    label: 'Assinaturas Premium / VIP',
    ctas: [
      { name: 'Upgrade Premium', where: 'PremiumUpgradeModal' },
      { name: 'Upgrade VIP (landing)', where: 'VIPUpgradeModal' },
      { name: 'Fazer Upgrade — Canal VIP', where: 'CreatorChannelVipUpgradeModal' },
      { name: 'Assinar canal de criador', where: 'PlanDetailDrawer' },
      { name: 'Criação/edição de plano VIP', where: 'CreatePlanWizard (passo 4)' },
      { name: 'Página Assinaturas', where: 'SubscriptionsPage' },
    ],
  },
  {
    feature: 'paid_content',
    flagLabel: 'paid_content_enabled',
    label: 'Conteúdo pago (PPV / mídia bloqueada)',
    ctas: [
      { name: 'Comprar mídia (paywall dourado)', where: 'PaidMediaOverlay' },
      { name: 'Checkout PPV (PIX/Cartão)', where: 'PaidContentCheckoutModal' },
      { name: 'PPV em broadcast', where: 'CreateBroadcastModal' },
      { name: 'Comprar conteúdo no canal', where: 'PlanDetailDrawer (tiles)' },
    ],
  },
  {
    feature: 'vip_channels',
    flagLabel: 'vip_channels_enabled',
    label: 'Canais VIP de criadores',
    ctas: [{ name: 'Assinatura recorrente em canal VIP', where: 'CanalVipPage / PlanSubscribeModal' }],
  },
  {
    feature: 'payouts',
    flagLabel: 'payouts_enabled',
    label: 'Saques de criadores',
    ctas: [{ name: 'Solicitar saque', where: 'EarningsPage · BetaWithdrawCTA' }],
  },
];

export function BetaLockedCtasCard() {
  const phase = usePlatformPhase();

  const isFlagOff = (feature: BetaFeatureKey): boolean => {
    switch (feature) {
      case 'monetization': return !phase.monetizationOn;
      case 'subscriptions': return !phase.monetizationOn || !phase.subscriptionsOn;
      case 'paid_content': return !phase.monetizationOn || !phase.paidContentOn;
      case 'vip_channels': return !phase.monetizationOn || !phase.vipChannelsOn;
      case 'payouts': return !phase.monetizationOn || !phase.payoutsOn;
      default: return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          CTAs travados pelo Beta
        </CardTitle>
        <CardDescription>
          Visão unificada de quais CTAs estão bloqueados por cada flag. Reflete o estado atual em tempo real —
          ao salvar um toggle acima, esta lista muda imediatamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ROWS.map((row) => {
          const locked = isFlagOff(row.feature);
          return (
            <div
              key={row.feature}
              className={cn(
                'rounded-lg border p-3',
                locked ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5',
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    {locked ? (
                      <Lock className="h-3.5 w-3.5 text-amber-400" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    {row.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{row.flagLabel}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[10px]',
                    locked
                      ? 'border-amber-500/50 text-amber-300 bg-amber-500/10'
                      : 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10',
                  )}
                >
                  {locked ? 'BLOQUEADO' : 'LIBERADO'}
                </Badge>
              </div>
              <ul className="space-y-1 pl-1">
                {row.ctas.map((c) => (
                  <li
                    key={c.where}
                    className="text-xs flex items-start gap-2 leading-snug"
                  >
                    <span className={cn(
                      'mt-1 h-1.5 w-1.5 rounded-full shrink-0',
                      locked ? 'bg-amber-400' : 'bg-emerald-400',
                    )} />
                    <span className="min-w-0">
                      <span className="text-foreground font-medium">{c.name}</span>
                      <span className="text-muted-foreground"> · {c.where}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Quando bloqueado, o CTA é desabilitado, exibe o rótulo <em>“Disponível no lançamento oficial”</em>
          {' '}e mostra um toast informativo. Nenhuma cobrança real é processada.
        </p>
      </CardContent>
    </Card>
  );
}
