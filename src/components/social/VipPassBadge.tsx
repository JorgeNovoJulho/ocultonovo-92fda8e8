import { memo } from 'react';
import { useVipSocialPass } from '@/social-universe';
import { Crown } from 'lucide-react';
import { EconomyBuyButton } from './EconomyBuyButton';

const TIER_LABEL: Record<string, string> = {
  standard: 'VIP Social',
  plus: 'VIP Social+',
  elite: 'VIP Social Elite',
};

interface VipPassBadgeProps {
  /** Quando true, exibe paywall PIX se não tiver pass ativo. */
  showPaywall?: boolean;
}

/**
 * VipPassBadge — chip discreto exibido quando o usuário tem Pass VIP Social ativo.
 * Não substitui o badge VIP de assinatura — é uma camada social.
 * Quando `showPaywall` e sem pass, oferece compra via Economia Premium (PIX).
 */
function VipPassBadgeComp({ showPaywall = false }: VipPassBadgeProps) {
  const { data } = useVipSocialPass();

  if (data?.active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
        <Crown className="h-3 w-3" aria-hidden />
        {TIER_LABEL[data.tier ?? 'standard']}
      </span>
    );
  }

  if (!showPaywall) return null;

  return (
    <EconomyBuyButton
      slug="pass_vip_social_24h"
      label="VIP Social · 24h"
      className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20"
    />
  );
}

export const VipPassBadge = memo(VipPassBadgeComp);
