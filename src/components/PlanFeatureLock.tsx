/**
 * PlanFeatureLock — Bloco de restrição de plano com botão de upgrade
 * Exibe informação clara sobre o bloqueio e direciona para upgrade
 */
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Crown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PlanFeatureLockProps {
  /** Texto descritivo do recurso bloqueado */
  featureName: string;
  /** Plano mínimo necessário */
  requiredPlan?: 'premium' | 'vip';
  /** Mensagem complementar (opcional) */
  description?: string;
  /** Tamanho do componente */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const planLabels = {
  premium: 'Premium',
  vip: 'VIP',
};

const planGradients = {
  premium: 'from-primary/10 to-secondary/10 border-primary/30',
  vip: 'from-[hsl(45,93%,47%)]/10 to-primary/10 border-[hsl(45,93%,47%)]/30',
};

const planIconColors = {
  premium: 'text-primary',
  vip: 'text-[hsl(45,93%,47%)]',
};

const planBgColors = {
  premium: 'bg-primary/20',
  vip: 'bg-[hsl(45,93%,47%)]/20',
};

/**
 * Componente inline de bloqueio — exibe dentro de cards
 */
export function PlanFeatureLock({
  featureName,
  requiredPlan = 'premium',
  description,
  size = 'md',
  className,
}: PlanFeatureLockProps) {
  const isSmall = size === 'sm';
  const isLarge = size === 'lg';

  const defaultDescription = requiredPlan === 'vip'
    ? `Apenas usuários do plano VIP podem ${featureName.toLowerCase()}. Faça upgrade para desbloquear.`
    : `Usuários do plano Free não podem ${featureName.toLowerCase()}. Faça upgrade para desbloquear.`;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-xl border bg-gradient-to-br',
        planGradients[requiredPlan],
        isSmall ? 'py-6 px-4 gap-2' : isLarge ? 'py-16 px-8 gap-4' : 'py-10 px-6 gap-3',
        className
      )}
    >
      {/* Lock icon */}
      <div className={cn(
        'rounded-full flex items-center justify-center',
        planBgColors[requiredPlan],
        isSmall ? 'w-10 h-10' : isLarge ? 'w-20 h-20' : 'w-14 h-14'
      )}>
        <Lock className={cn(planIconColors[requiredPlan], isSmall ? 'h-5 w-5' : isLarge ? 'h-10 w-10' : 'h-7 w-7')} />
      </div>

      {/* Title */}
      <div>
        <p className={cn(
          'font-bold text-foreground flex items-center justify-center gap-2',
          isSmall ? 'text-sm' : isLarge ? 'text-xl' : 'text-base'
        )}>
          <Crown className={cn(planIconColors[requiredPlan], 'h-4 w-4')} />
          Recurso exclusivo {planLabels[requiredPlan]}
        </p>
        <p className={cn(
          'text-muted-foreground mt-1 max-w-sm mx-auto',
          isSmall ? 'text-xs' : 'text-sm'
        )}>
          {description || defaultDescription}
        </p>
      </div>

      {/* CTA Button */}
      <Link to="/checkout">
        <Button
          className={cn(
            'gap-2 font-semibold',
            requiredPlan === 'vip'
              ? 'bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] hover:opacity-90'
              : 'bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90',
            isSmall ? 'h-8 text-xs px-3' : 'h-10'
          )}
        >
          <Sparkles className={isSmall ? 'h-3 w-3' : 'h-4 w-4'} />
          {requiredPlan === 'vip' ? 'Assinar VIP' : 'Ver Planos de Assinatura'}
        </Button>
      </Link>
    </div>
  );
}

/**
 * Banner inline (horizontal) de bloqueio — para headers e topo de seções
 */
interface PlanFeatureBannerProps {
  featureName: string;
  requiredPlan?: 'premium' | 'vip';
  description?: string;
  className?: string;
}

export function PlanFeatureBanner({
  featureName,
  requiredPlan = 'premium',
  description,
  className,
}: PlanFeatureBannerProps) {
  return (
    <div className={cn(
      'flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border bg-gradient-to-r overflow-hidden',
      planGradients[requiredPlan],
      className
    )}>
      <div className={cn('p-3 rounded-full shrink-0', planBgColors[requiredPlan])}>
        <Lock className={cn('h-5 w-5', planIconColors[requiredPlan])} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground flex items-center gap-2">
          <Crown className={cn('h-4 w-4 shrink-0', planIconColors[requiredPlan])} />
          {featureName} — exclusivo {planLabels[requiredPlan]}
        </p>
        <p className="text-sm text-muted-foreground">
          {description || (requiredPlan === 'vip'
            ? 'Faça upgrade para o plano VIP para desbloquear este recurso.'
            : 'Faça upgrade para Premium ou VIP para desbloquear este recurso.'
          )}
        </p>
      </div>
      <Link to="/checkout" className="shrink-0 self-start sm:self-center">
        <Button
          size="sm"
          className={cn(
            'gap-2 font-semibold',
            requiredPlan === 'vip'
              ? 'bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] hover:opacity-90'
              : 'bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Assinar {planLabels[requiredPlan]}
        </Button>
      </Link>
    </div>
  );
}
