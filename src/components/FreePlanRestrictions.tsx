/**
 * Componentes de Restrição para Plano Free
 * Blur, cadeado e indicadores visuais
 * REGRA DE OURO: Admin Master bypassa todas as restrições
 */
import { ReactNode, useState } from 'react';
import { Lock } from 'lucide-react';
import { UpsellModal } from './UpsellModal';
import { useFreePlanRestrictions } from '@/hooks/useFreePlanLimits';
import { useAdminBypass } from '@/hooks/useAdminBypass';
import { cn } from '@/lib/utils';

interface BlurredContentProps {
  children: ReactNode;
  type: 'likes' | 'followers';
  className?: string;
}

/**
 * Wrapper que aplica blur em conteúdo restrito para usuários free
 */
export function BlurredContent({ children, type, className }: BlurredContentProps) {
  const [showUpsell, setShowUpsell] = useState(false);
  const { shouldBlurLikes, shouldBlurFollowers, isFreePlan } = useFreePlanRestrictions();
  const { shouldBypass } = useAdminBypass();

  // REGRA DE OURO: Admin Master nunca vê blur
  if (shouldBypass) {
    return <>{children}</>;
  }

  const shouldBlur = isFreePlan && (
    (type === 'likes' && shouldBlurLikes) ||
    (type === 'followers' && shouldBlurFollowers)
  );

  if (!shouldBlur) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        className={cn(
          "relative cursor-pointer group",
          className
        )}
        onClick={() => setShowUpsell(true)}
      >
        {/* Blurred content */}
        <div className="filter blur-[8px] pointer-events-none select-none">
          {children}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-[2px] rounded-lg group-hover:bg-background/40 transition-colors">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_20px_rgba(255,0,127,0.3)]">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xs font-medium text-primary">
              Clique para desbloquear
            </span>
          </div>
        </div>
      </div>

      <UpsellModal
        open={showUpsell}
        onOpenChange={setShowUpsell}
        restrictionType={type}
      />
    </>
  );
}

interface RestrictedFeatureProps {
  children: ReactNode;
  feature: 'comments' | 'vip_content' | 'affiliate';
  fallback?: ReactNode;
}

/**
 * Wrapper que bloqueia features específicas para usuários free
 */
export function RestrictedFeature({ children, feature, fallback }: RestrictedFeatureProps) {
  const [showUpsell, setShowUpsell] = useState(false);
  const { canComment, canCreateVipContent, canUseAffiliate, isFreePlan } = useFreePlanRestrictions();
  const { shouldBypass } = useAdminBypass();

  // REGRA DE OURO: Admin Master nunca é restrito
  if (shouldBypass) {
    return <>{children}</>;
  }

  const isRestricted = isFreePlan && (
    (feature === 'comments' && !canComment) ||
    (feature === 'vip_content' && !canCreateVipContent) ||
    (feature === 'affiliate' && !canUseAffiliate)
  );

  if (!isRestricted) {
    return <>{children}</>;
  }

  if (fallback) {
    return (
      <>
        <div onClick={() => setShowUpsell(true)} className="cursor-pointer">
          {fallback}
        </div>
        <UpsellModal
          open={showUpsell}
          onOpenChange={setShowUpsell}
          restrictionType={feature}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="relative cursor-pointer opacity-60 hover:opacity-80 transition-opacity"
        onClick={() => setShowUpsell(true)}
      >
        <div className="pointer-events-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
            <Lock className="h-4 w-4 text-primary" />
          </div>
        </div>
      </div>

      <UpsellModal
        open={showUpsell}
        onOpenChange={setShowUpsell}
        restrictionType={feature}
      />
    </>
  );
}

interface LimitedActionProps {
  children: ReactNode;
  limitType: 'messages' | 'radar';
  onLimitReached?: () => void;
}

/**
 * Wrapper para ações com limite diário
 */
export function LimitedAction({ children, limitType, onLimitReached }: LimitedActionProps) {
  const [showUpsell, setShowUpsell] = useState(false);
  const { 
    canSendMessage, 
    canSearchRadar, 
    remainingMessages,
    remainingRadarSearches,
    limits,
    isFreePlan,
  } = useFreePlanRestrictions();
  const { shouldBypass } = useAdminBypass();

  // REGRA DE OURO: Admin Master nunca tem limites
  if (shouldBypass) {
    return <>{children}</>;
  }

  const canPerformAction = limitType === 'messages' ? canSendMessage : canSearchRadar;
  const remaining = limitType === 'messages' ? remainingMessages : remainingRadarSearches;
  const max = limitType === 'messages' ? limits.maxMessagesPerDay : limits.maxRadarSearchesPerDay;

  if (!isFreePlan || canPerformAction) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        className="relative cursor-pointer"
        onClick={() => {
          setShowUpsell(true);
          onLimitReached?.();
        }}
      >
        <div className="pointer-events-none opacity-50">
          {children}
        </div>
      </div>

      <UpsellModal
        open={showUpsell}
        onOpenChange={setShowUpsell}
        restrictionType={limitType === 'messages' ? 'messages' : 'radar'}
        remainingUses={remaining}
        maxUses={max}
      />
    </>
  );
}

/**
 * Badge indicando limite restante
 */
interface LimitBadgeProps {
  limitType: 'messages' | 'radar';
  className?: string;
}

export function LimitBadge({ limitType, className }: LimitBadgeProps) {
  const { remainingMessages, remainingRadarSearches, isFreePlan } = useFreePlanRestrictions();
  const { shouldBypass } = useAdminBypass();

  // REGRA DE OURO: Admin Master não vê badges de limite
  if (shouldBypass) return null;

  if (!isFreePlan) return null;

  const remaining = limitType === 'messages' ? remainingMessages : remainingRadarSearches;
  const isLow = remaining <= 2;
  const isZero = remaining === 0;

  return (
    <div 
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
        isZero 
          ? "bg-destructive/20 text-destructive border border-destructive/30" 
          : isLow 
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            : "bg-primary/10 text-primary border border-primary/30",
        className
      )}
    >
      {isZero ? (
        <Lock className="h-3 w-3" />
      ) : null}
      {remaining} {limitType === 'messages' ? 'msgs' : 'buscas'} restantes
    </div>
  );
}
