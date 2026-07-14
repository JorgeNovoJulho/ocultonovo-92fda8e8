import { Check, X, Crown, Zap, Users, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useActivePlans, SubscriptionPlan } from "@/hooks/useSubscriptionPlans";
import { Skeleton } from "@/components/ui/skeleton";

interface PlansContent {
  badge?: string;
  title?: string;
  subtitle?: string;
}

interface PlansSectionProps {
  content: PlansContent;
}

// Ícone por tipo de plano
const getPlanIcon = (planType: string): LucideIcon => {
  switch (planType) {
    case 'free': return Users;
    case 'premium': return Zap;
    case 'vip': return Crown;
    default: return Users;
  }
};

const getCtaText = (plan: SubscriptionPlan) => {
  if (plan.cta_text) return plan.cta_text;
  if (plan.plan_type === 'free') return 'Começar Grátis';
  return `Assinar ${plan.name}`;
};

export function PlansSection({ content }: PlansSectionProps) {
  const [isAnnual, setIsAnnual] = useState(true);
  const { data: plans, isLoading } = useActivePlans();

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-[150px]" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 px-4 py-1.5">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            {content.badge || "Planos & Preços"}
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            {content.title || (
              <>
                Escolha seu{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                  nível de acesso
                </span>
              </>
            )}
          </h2>
          <p className="text-lg text-muted-foreground">
            {content.subtitle || "Recursos exclusivos para cada tipo de experiência"}
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <Label
            htmlFor="billing-toggle"
            className={cn(
              "text-sm font-medium cursor-pointer transition-colors",
              !isAnnual ? "text-foreground" : "text-muted-foreground"
            )}
          >
            Mensal
          </Label>
          <Switch
            id="billing-toggle"
            checked={isAnnual}
            onCheckedChange={setIsAnnual}
            className="data-[state=checked]:bg-primary"
          />
          <Label
            htmlFor="billing-toggle"
            className={cn(
              "text-sm font-medium cursor-pointer transition-colors flex items-center gap-2",
              isAnnual ? "text-foreground" : "text-muted-foreground"
            )}
          >
            Anual
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
              Até 20% OFF
            </Badge>
          </Label>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {isLoading && (!plans || (plans as SubscriptionPlan[]).length === 0) ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[520px] rounded-2xl" />
            ))
          ) : (
            (plans || []).map((plan) => {
              const Icon = getPlanIcon(plan.plan_type);
              const displayPrice = isAnnual ? plan.price_annual_per_month : plan.price_monthly;
              const isVip = plan.plan_type === 'vip';
              const isPopular = plan.is_popular;
              const savings = plan.price_monthly > 0
                ? Math.round((1 - plan.price_annual_per_month / plan.price_monthly) * 100)
                : 0;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative rounded-2xl overflow-hidden transition-all duration-500",
                    isPopular && "md:-mt-4 md:mb-4 z-10",
                    isVip && "border-2 border-amber-500/30"
                  )}
                >
                  {/* Top accent border */}
                  {isPopular && (
                    <div className="absolute -top-px left-0 right-0 h-1 bg-gradient-to-r from-primary via-pink-500 to-secondary" />
                  )}
                  {isVip && (
                    <div className="absolute -top-px left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                  )}

                  {/* Card content */}
                  <div
                    className={cn(
                      "relative h-full p-6 sm:p-8 bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl flex flex-col",
                      isPopular && "bg-gradient-to-b from-primary/10 to-card border-primary/30 shadow-[0_0_50px_rgba(255,0,127,0.15)]",
                      isVip && "bg-gradient-to-b from-amber-500/10 to-card"
                    )}
                  >
                    {/* Badge */}
                    {isPopular && (
                      <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground text-xs">
                        Mais Popular
                      </Badge>
                    )}
                    {isVip && (
                      <Badge className="absolute top-4 right-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs">
                        Creator
                      </Badge>
                    )}

                    {/* Icon */}
                    <div
                      className={cn(
                        "w-14 h-14 rounded-xl flex items-center justify-center mb-5",
                        isPopular
                          ? "bg-gradient-to-br from-primary to-secondary"
                          : isVip
                          ? "bg-gradient-to-br from-amber-500 to-orange-500"
                          : "bg-muted"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-7 w-7",
                          isPopular || isVip ? "text-white" : "text-muted-foreground"
                        )}
                      />
                    </div>

                    {/* Plan name & description */}
                    <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{plan.description}</p>

                    {/* Price */}
                    <div className="mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">
                          {displayPrice === 0
                            ? "Grátis"
                            : `R$ ${displayPrice.toFixed(2).replace(".", ",")}`}
                        </span>
                        {displayPrice > 0 && (
                          <span className="text-muted-foreground text-sm">/mês</span>
                        )}
                      </div>
                      {isAnnual && savings > 0 && (
                        <p className="text-xs text-emerald-400 mt-1 font-medium">
                          Economia de {savings}% no plano anual
                        </p>
                      )}
                    </div>

                    {/* CTA Button */}
                    <Link to="/signup" className="block mb-6">
                      <Button
                        className={cn(
                          "w-full h-12 font-semibold",
                          isPopular
                            ? "bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground shadow-[0_0_20px_rgba(255,0,127,0.3)]"
                            : isVip
                            ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white"
                            : "bg-muted hover:bg-muted/80 text-foreground"
                        )}
                      >
                        {getCtaText(plan)}
                      </Button>
                    </Link>

                    {/* Features */}
                    <ul className="space-y-2.5 mt-auto">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <Check
                            className={cn(
                              "h-4 w-4 mt-0.5 flex-shrink-0",
                              isPopular
                                ? "text-primary"
                                : isVip
                                ? "text-amber-500"
                                : "text-emerald-500"
                            )}
                          />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                      {plan.restrictions.map((restriction, i) => (
                        <li key={`r-${i}`} className="flex items-start gap-3 text-sm">
                          <X className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive/50" />
                          <span className="text-muted-foreground/60">{restriction}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom note */}
        <p className="text-center text-sm text-muted-foreground mt-12">
          Todos os planos incluem acesso ao aplicativo. Cancele a qualquer momento.
        </p>
      </div>
    </section>
  );
}
