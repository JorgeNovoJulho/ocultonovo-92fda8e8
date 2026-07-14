import { ReactNode } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { useAdminBypass } from '@/hooks/useAdminBypass';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';
import { PremiumUpgradeScreen } from './PremiumUpgradeScreen';
import { Skeleton } from '@/components/ui/skeleton';

interface PremiumAccessGuardProps {
  children: ReactNode;
  featureName: string;
}

export function PremiumAccessGuard({ children, featureName }: PremiumAccessGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { shouldBlockAccess, isOverdue, isSuspended } = usePaymentStatus();
  const { shouldBypass, isLoading: adminLoading } = useAdminBypass();
  const { isBeta, freeGetsPremiumSocial } = usePlatformPhase();
  const betaUnlocked = Boolean(isBeta || freeGetsPremiumSocial);

  // Loading state
  if (authLoading || profileLoading || adminLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // REGRA DE OURO: Admin Master sempre tem acesso total
  if (shouldBypass) {
    return <>{children}</>;
  }

  // Beta: libera todos os recursos Premium para usuários free (exceto se atrasado)
  if (betaUnlocked && !shouldBlockAccess) {
    return <>{children}</>;
  }

  // Check if payment is overdue or suspended - block access even for premium/VIP users
  if (shouldBlockAccess) {
    const message = isSuspended 
      ? 'Sua conta está suspensa. Regularize seu pagamento para continuar.'
      : 'Seu pagamento está atrasado. Regularize para continuar acessando.';
    return <PremiumUpgradeScreen featureName={message} />;
  }

  // Check if user has premium or VIP access
  const isPremiumOrVip = 
    profile?.is_vip === true ||
    profile?.plan_type === 'premium' || 
    profile?.plan_type === 'monthly' || 
    profile?.plan_type === 'vip';

  // If not premium/vip, show upgrade screen
  if (!isPremiumOrVip) {
    return <PremiumUpgradeScreen featureName={featureName} />;
  }

  // User has access, render children
  return <>{children}</>;
}

/**
 * Hook to check if user has premium or VIP access
 * Admin Master sempre retorna true
 */
export function useIsPremiumOrVip(): { isPremiumOrVip: boolean; isLoading: boolean } {
  const { loading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { shouldBlockAccess } = usePaymentStatus();
  const { shouldBypass, isLoading: adminLoading } = useAdminBypass();
  const { isBeta, freeGetsPremiumSocial } = usePlatformPhase();

  const isLoading = authLoading || profileLoading || adminLoading;

  // REGRA DE OURO: Admin Master sempre é premium
  if (shouldBypass) {
    return { isPremiumOrVip: true, isLoading };
  }

  // If payment is blocked, treat as not premium
  if (shouldBlockAccess) {
    return { isPremiumOrVip: false, isLoading };
  }

  // Beta: todos os usuários free contam como premium
  if (isBeta || freeGetsPremiumSocial) {
    return { isPremiumOrVip: true, isLoading };
  }

  const isPremiumOrVip =
    profile?.is_vip === true ||
    profile?.plan_type === 'premium' ||
    profile?.plan_type === 'monthly' ||
    profile?.plan_type === 'vip';

  return { isPremiumOrVip, isLoading };
}
