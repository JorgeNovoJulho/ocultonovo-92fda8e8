/**
 * Componente de Seleção de Plano Pós-Cadastro
 * Exibido após o usuário completar o cadastro
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Crown, 
  Sparkles, 
  Check, 
  Zap, 
  Eye, 
  MessageCircle, 
  MapPin, 
  Heart,
  Star,
  Ghost,
  ShieldCheck,
  ArrowRight,
  Flame,
  Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActivePlans } from '@/hooks/useSubscriptionPlans';
import { useTrackConversionEvent } from '@/hooks/useConversionEvents';
import { usePioneerStatus, applyPioneerDiscount } from '@/hooks/usePioneerDiscount';
import { Logo } from './Logo';
import confetti from 'canvas-confetti';

interface PlanSelectionStepProps {
  onSelectPlan: (planType: 'free' | 'premium' | 'vip') => void;
  onSkip?: () => void;
}

type PlanType = 'free' | 'premium' | 'vip';

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

interface Plan {
  id: PlanType;
  name: string;
  price: string;
  priceNote?: string;
  annualPrice?: string;
  originalPrice?: string;
  annualNote?: string;
  description: string;
  icon: React.ReactNode;
  features: PlanFeature[];
  popular?: boolean;
  gradient?: string;
}

export function PlanSelectionStep({ onSelectPlan, onSkip }: PlanSelectionStepProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { data: dbPlans } = useActivePlans();
  const trackEvent = useTrackConversionEvent();
  const pioneer = usePioneerStatus();

  // Track plan view on mount
  useEffect(() => {
    trackEvent.mutate({ eventType: 'plan_view' });
  }, []);

  // Get prices from database or use defaults
  const premiumPlan = dbPlans?.find(p => p.plan_type === 'premium');
  const monthlyPrice = premiumPlan?.price_monthly || 25.90;
  const annualPerMonthPrice = premiumPlan?.price_annual_per_month || 19.90;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const plans: Plan[] = [
    {
      id: 'free',
      name: 'Gratuito',
      price: 'R$ 0',
      description: 'Explore a plataforma com limites',
      icon: <Zap className="h-6 w-6" />,
      features: [
        { text: 'Limite de 5 fotos por dia', included: true },
        { text: '10 mensagens/dia (sem resposta para perfis pagos)', included: true },
        { text: '5 buscas/dia no Radar', included: true },
        { text: 'Sem upload de vídeos', included: false },
        { text: 'Sem responder comentários', included: false },
        { text: 'Sem "Quem visitou meu perfil"', included: false },
        { text: 'Sem conteúdo pago ou monetização', included: false },
        { text: 'Modo Fantasma', included: false },
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      price: pioneer.isPioneer ? formatCurrency(applyPioneerDiscount(monthlyPrice, true)) : formatCurrency(monthlyPrice),
      originalPrice: pioneer.isPioneer ? formatCurrency(monthlyPrice) : undefined,
      priceNote: `/mês`,
      description: pioneer.isPioneer ? '25% de desconto pioneiro!' : 'Desbloqueie tudo',
      annualPrice: formatCurrency(pioneer.isPioneer ? applyPioneerDiscount(238.80, true) : 238.80),
      annualNote: `/ano (${formatCurrency(pioneer.isPioneer ? applyPioneerDiscount(annualPerMonthPrice, true) : annualPerMonthPrice)}/mês)`,
      icon: <Crown className="h-6 w-6" />,
      popular: true,
      gradient: 'from-primary/20 via-purple-500/10 to-secondary/20',
      features: [
        { text: 'Mensagens ilimitadas', included: true, highlight: true },
        { text: 'Acesso total a mídias (sem blur)', included: true, highlight: true },
        { text: 'Upload em alta resolução (4K/HD)', included: true, highlight: true },
        { text: 'Selo de verificado', included: true, highlight: true },
        { text: '"Quem visitou meu perfil"', included: true, highlight: true },
        { text: 'Controle total de hardware', included: true },
        { text: 'Comentários ilimitados', included: true },
        { text: 'Criar conteúdo pago (exclusivo VIP)', included: false },
      ],
    },
    {
      id: 'vip',
      name: 'VIP Creator',
      price: 'R$ 145,90',
      priceNote: '/mês',
      description: 'Para criadores de conteúdo',
      annualPrice: 'R$ 1.510,80',
      annualNote: '/ano (R$ 125,90/mês)',
      icon: <Star className="h-6 w-6" />,
      gradient: 'from-[hsl(45,93%,47%)]/20 via-orange-500/10 to-red-500/20',
      features: [
        { text: 'Tudo do Premium', included: true },
        { text: 'Monetize seu conteúdo', included: true, highlight: true },
        { text: 'Canal de assinantes exclusivo', included: true, highlight: true },
        { text: 'Dashboard financeiro + saques', included: true, highlight: true },
        { text: 'Mensagens pagas de fãs', included: true, highlight: true },
        { text: 'Borda dourada no avatar', included: true },
        { text: 'Destaque no topo das buscas', included: true },
        { text: 'Programa de afiliados', included: true },
      ],
    },
  ];

  const triggerConfetti = () => {
    const count = 200;
    confetti({
      particleCount: count,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#FF007F', '#9333ea', '#fbbf24', '#22c55e'],
      zIndex: 9999,
    });
  };

  const handleContinue = async () => {
    if (!selectedPlan) return;
    
    setIsLoading(true);
    
    if (selectedPlan !== 'free') {
      triggerConfetti();
    }
    
    // Small delay for animation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    onSelectPlan(selectedPlan);
    setIsLoading(false);
  };

  const handleSkip = () => {
    onSelectPlan('free');
    onSkip?.();
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Escolha seu plano
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            Comece gratuitamente ou desbloqueie todo o potencial da plataforma
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={cn(
                "relative p-5 sm:p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300",
                "backdrop-blur-xl bg-card/80",
                selectedPlan === plan.id
                  ? "border-primary shadow-[0_0_30px_rgba(255,0,127,0.3)] scale-[1.02]"
                  : "border-border/50 hover:border-primary/50 hover:shadow-lg",
                plan.gradient && `bg-gradient-to-br ${plan.gradient}`
              )}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1 flex items-center gap-1">
                    <Flame className="h-3 w-3" />
                    MAIS POPULAR
                  </Badge>
                </div>
              )}

              {/* Selected Check */}
              {selectedPlan === plan.id && (
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <Check className="h-5 w-5 text-primary-foreground" />
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-4">
                <div className={cn(
                  "w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center",
                  plan.id === 'free' && "bg-muted text-muted-foreground",
                  plan.id === 'premium' && "bg-primary/20 text-primary",
                  plan.id === 'vip' && "bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)]"
                )}>
                  {plan.icon}
                </div>
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="text-center mb-4 pb-4 border-b border-border/50">
                {plan.originalPrice && (
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-sm text-muted-foreground line-through">{plan.originalPrice}</span>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5">
                      <Tag className="w-2.5 h-2.5 mr-0.5" />-25%
                    </Badge>
                  </div>
                )}
                <span className={cn(
                  "text-3xl font-bold",
                  plan.id === 'free' && "text-foreground",
                  plan.id === 'premium' && "text-primary",
                  plan.id === 'vip' && "text-[hsl(45,93%,47%)]"
                )}>
                  {plan.price}
                </span>
                {plan.priceNote && (
                  <span className="text-sm text-muted-foreground ml-1">{plan.priceNote}</span>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    {feature.included ? (
                      <Check className={cn(
                        "h-4 w-4 flex-shrink-0",
                        feature.highlight ? "text-primary" : "text-green-500"
                      )} />
                    ) : (
                      <span className="h-4 w-4 flex-shrink-0 text-muted-foreground/50">✕</span>
                    )}
                    <span className={cn(
                      feature.included ? "text-foreground" : "text-muted-foreground/50 line-through",
                      feature.highlight && "font-medium"
                    )}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={handleContinue}
            disabled={!selectedPlan || isLoading}
            size="lg"
            className={cn(
              "w-full sm:w-auto min-w-[200px] gap-2 transition-all duration-300",
              selectedPlan === 'premium' && "bg-primary hover:bg-primary/90",
              selectedPlan === 'vip' && "bg-gradient-to-r from-[hsl(45,93%,47%)] to-orange-500 hover:from-[hsl(45,93%,57%)] hover:to-orange-400",
              !selectedPlan && "opacity-50"
            )}
          >
            {isLoading ? (
              <span className="animate-pulse">Processando...</span>
            ) : (
              <>
                Continuar
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            Começar gratuitamente
          </Button>
        </div>

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>Pagamento seguro • Cancele a qualquer momento</span>
        </div>
      </div>
    </div>
  );
}
