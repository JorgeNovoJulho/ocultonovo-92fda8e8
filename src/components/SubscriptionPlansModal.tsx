import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useActivePlans } from "@/hooks/useSubscriptionPlans";
import {
  Crown,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  Star,
  Zap,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";

interface SubscriptionPlansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const planIcons: Record<string, typeof Crown> = {
  free: Star,
  premium: Zap,
  vip: Crown,
};

// Fallback enquanto o banco carrega (mantém UX mesmo offline)
const FALLBACK_PLANS = [
  { id: 'free', plan_type: 'free', name: 'Free', description: 'Acesso básico à plataforma',
    features: [], restrictions: [],
    price_monthly: 0, price_annual_per_month: 0, price_annual_total: 0 },
];

export function SubscriptionPlansModal({ open, onOpenChange }: SubscriptionPlansModalProps) {
  const { data: dbPlans, isLoading } = useActivePlans();
  // Mapeia para o shape interno (mantém compatibilidade com JSX existente)
  const plans = (dbPlans && dbPlans.length > 0)
    ? dbPlans.map(p => ({
        id: p.id,
        plan_type: p.plan_type,
        name: p.name,
        description: p.description || '',
        features: p.features,
        restrictions: p.restrictions,
        price_monthly: p.price_monthly,
        price_annual_per_month: p.price_annual_per_month,
        price_annual_total: p.price_annual_total,
      }))
    : FALLBACK_PLANS;
  const { profile } = useProfile();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const paymentLockRef = useRef(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [focusedPlanId, setFocusedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardData, setCardData] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
  });

  const currentPlan = profile?.plan_type || "free";

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    return cleaned.match(/.{1,4}/g)?.join(" ").substring(0, 19) || cleaned;
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 2) return cleaned.substring(0, 2) + "/" + cleaned.substring(2, 4);
    return cleaned;
  };

  const isFormValid =
    cardData.number.replace(/\D/g, "").length >= 13 &&
    cardData.name.length >= 3 &&
    cardData.expiry.length === 5 &&
    cardData.cvv.length >= 3;

  const findPlan = (planType: string) => plans.find(p => p.plan_type === planType);

  const getPrice = (planType: string) => {
    const p = findPlan(planType);
    if (!p) return 0;
    return billingCycle === 'annual' ? p.price_annual_per_month : p.price_monthly;
  };

  const getAnnualTotal = (planType: string) => {
    const p = findPlan(planType);
    if (!p) return 0;
    return p.price_annual_total || p.price_annual_per_month * 12;
  };

  const getAnnualSavings = (planType: string) => {
    const p = findPlan(planType);
    if (!p || !p.price_monthly) return 0;
    return Math.round(((p.price_monthly - p.price_annual_per_month) / p.price_monthly) * 100);
  };

  const handleSelectPlan = (planType: string) => {
    if (planType === currentPlan || planType === "free") return;
    setSelectedPlan(planType);
    setShowPayment(true);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !user || !selectedPlan) return;
    // Idempotency guard: prevent double submissions
    if (paymentLockRef.current) return;
    paymentLockRef.current = true;

    setIsProcessing(true);
    try {
      const amount = billingCycle === 'annual' ? getAnnualTotal(selectedPlan) : getPrice(selectedPlan);
      const { data: prof } = await supabase
        .from('profiles')
        .select('name, cpf_cnpj')
        .eq('user_id', user.id)
        .maybeSingle();
      const payerCpfCnpj = (prof?.cpf_cnpj || '').replace(/\D/g, '');
      if (!payerCpfCnpj || payerCpfCnpj.length < 11) {
        throw new Error('Cadastre seu CPF/CNPJ no perfil antes de pagar com cartão.');
      }
      if (!user.email) throw new Error('E-mail do usuário não disponível.');

      const tierLabel = selectedPlan.toLowerCase().includes('vip') ? 'VIP' : 'Premium';
      const cycleLabel = billingCycle === 'annual' ? 'Anual' : 'Mensal';

      const { data, error } = await supabase.functions.invoke("asaas-card-checkout", {
        body: {
          amount,
          description: `Plano ${tierLabel} - ${cycleLabel}`,
          type: 'subscription',
          payerEmail: user.email,
          payerName: prof?.name || cardData.name || user.email,
          payerCpfCnpj,
          card: {
            holderName: cardData.name,
            number: cardData.number.replace(/\D/g, ""),
            expiryMonth: cardData.expiry.split("/")[0],
            expiryYear: "20" + cardData.expiry.split("/")[1],
            ccv: cardData.cvv,
          },
          metadata: {
            plan_type: selectedPlan,
            billing_cycle: billingCycle,
          },
        },
      });

      if (error) throw error;

      if (data?.success) {
        onOpenChange(false);
        navigate("/payment-success");
      } else {
        throw new Error(data?.error || "Pagamento não aprovado");
      }
    } catch (err: any) {
      toast({
        title: "Erro no pagamento",
        description: err.message || "Não foi possível processar.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      paymentLockRef.current = false;
    }
  };

  const handleBack = () => {
    setShowPayment(false);
    setSelectedPlan(null);
    setCardData({ number: "", name: "", expiry: "", cvv: "" });
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setShowPayment(false);
      setSelectedPlan(null);
      setFocusedPlanId(null);
      setExpandedPlan(null);
      setCardData({ number: "", name: "", expiry: "", cvv: "" });
    }
    onOpenChange(value);
  };

  const toggleExpand = (planId: string) => {
    setExpandedPlan(expandedPlan === planId ? null : planId);
  };

  const selectedPlanData = plans?.find((p) => p.plan_type === selectedPlan);
  const focusedPlan = plans.find((p) => p.id === focusedPlanId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-lg bg-card border-border p-0 gap-0 max-h-[92dvh] overflow-hidden rounded-2xl flex flex-col">
        <div className="p-4 sm:p-5 pb-2">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-center flex items-center justify-center gap-2">
              <Crown className="h-5 w-5 text-[hsl(45,93%,47%)]" />
              {showPayment ? "Finalizar Pagamento" : focusedPlan ? `Plano ${focusedPlan.name}` : "Planos de Assinatura"}
            </DialogTitle>
          </DialogHeader>
        </div>

        {!showPayment && focusedPlan ? (
          <div className="overflow-y-auto scrollbar-hide px-4 sm:px-5 pb-4 sm:pb-5 space-y-4 flex-1 min-h-0">
            <Button variant="ghost" size="sm" onClick={() => setFocusedPlanId(null)} className="gap-2 -ml-2">
              <ArrowLeft className="h-4 w-4" /> Voltar aos planos
            </Button>

            {(() => {
              const isCurrentPlan = currentPlan === focusedPlan.plan_type;
              const isFree = focusedPlan.plan_type === "free";
              const isVip = focusedPlan.plan_type === "vip";
              const isPremium = focusedPlan.plan_type === "premium";
              const PlanIcon = planIcons[focusedPlan.plan_type] || Star;
              const price = isFree ? 0 : getPrice(focusedPlan.plan_type);
              const savings = isFree ? 0 : getAnnualSavings(focusedPlan.plan_type);

              return (
                <div className={cn(
                  "relative rounded-2xl border-2 p-5 space-y-4",
                  isCurrentPlan ? "border-primary/50 bg-primary/5" : isVip ? "border-[hsl(45,93%,47%)]/40 bg-[hsl(45,93%,47%)]/5" : isPremium ? "border-primary/40" : "border-border/50"
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <PlanIcon className={cn("h-5 w-5", isVip ? "text-[hsl(45,93%,47%)]" : isPremium ? "text-primary" : "text-muted-foreground")} />
                        <h3 className="text-xl font-bold text-foreground">{focusedPlan.name}</h3>
                        {isCurrentPlan && <Badge variant="outline" className="border-primary text-primary">ATUAL</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{focusedPlan.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {isFree ? <span className="text-lg font-bold text-muted-foreground">Grátis</span> : billingCycle === 'annual' ? (
                        <>
                          <span className={cn("text-xl font-bold", isVip ? "text-[hsl(45,93%,47%)]" : "text-primary")}>{formatCurrency(getAnnualTotal(focusedPlan.plan_type))}</span>
                          <span className="text-xs text-muted-foreground block">/ano</span>
                          <span className="text-xs text-[hsl(142,76%,36%)] font-semibold block">{formatCurrency(price)}/mês • -{savings}%</span>
                        </>
                      ) : (
                        <>
                          <span className={cn("text-xl font-bold", isVip ? "text-[hsl(45,93%,47%)]" : "text-primary")}>{formatCurrency(price)}</span>
                          <span className="text-xs text-muted-foreground block">/mês</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Benefícios inclusos</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {focusedPlan.features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                          <Check className="h-4 w-4 text-[hsl(142,76%,36%)] shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {focusedPlan.restrictions?.length > 0 && (
                    <div className="space-y-2 border-t border-border/40 pt-4">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Limitações</p>
                      <ul className="space-y-1">
                        {focusedPlan.restrictions.map((restriction, i) => <li key={i} className="text-sm text-muted-foreground">{restriction}</li>)}
                      </ul>
                    </div>
                  )}

                  {!isCurrentPlan && !isFree && (
                    <Button onClick={() => handleSelectPlan(focusedPlan.plan_type)} className={cn("w-full", isVip ? "bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] hover:opacity-90" : "bg-primary text-primary-foreground hover:opacity-90")}>
                      Selecionar plano {focusedPlan.name}
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>
        ) : !showPayment ? (
          <div className="overflow-y-auto scrollbar-hide px-4 sm:px-5 pb-4 sm:pb-5 space-y-3 flex-1 min-h-0">
            {/* Billing cycle toggle */}
            <div className="flex items-center justify-center gap-1 p-1 rounded-full bg-muted/30 border border-border/50 mx-auto w-fit">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium transition-all",
                  billingCycle === 'monthly'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Mensal
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium transition-all relative",
                  billingCycle === 'annual'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Anual
                <span className="absolute -top-2.5 -right-2 text-[9px] font-bold text-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/15 px-1.5 rounded-full">
                  ECONOMIZE
                </span>
              </button>
            </div>

            {plans.map((plan) => {
                const isCurrentPlan = currentPlan === plan.plan_type;
                const isFree = plan.plan_type === "free";
                const isVip = plan.plan_type === "vip";
                const isPremium = plan.plan_type === "premium";
                const PlanIcon = planIcons[plan.plan_type] || Star;
                const isExpanded = expandedPlan === plan.id;
                const price = isFree ? 0 : getPrice(plan.plan_type);
                const savings = isFree ? 0 : getAnnualSavings(plan.plan_type);

                return (
                  <div
                    key={plan.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFocusedPlanId(plan.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setFocusedPlanId(plan.id);
                      }
                    }}
                    className={cn(
                      "relative rounded-xl border-2 p-3.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50",
                      isCurrentPlan
                        ? "border-primary/50 bg-primary/5"
                        : isVip
                        ? "border-[hsl(45,93%,47%)]/40 hover:border-[hsl(45,93%,47%)]/70 bg-[hsl(45,93%,47%)]/5"
                        : isPremium
                        ? "border-primary/30 hover:border-primary/60"
                        : "border-border/50 hover:border-border"
                    )}
                  >
                    {/* Tags */}
                    {isPremium && !isCurrentPlan && (
                      <Badge className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-[10px] px-2">
                        POPULAR
                      </Badge>
                    )}
                    {isVip && !isCurrentPlan && (
                      <Badge className="absolute -top-2.5 left-4 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] text-[10px] px-2">
                        EXCLUSIVO
                      </Badge>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <PlanIcon
                            className={cn(
                              "h-4 w-4",
                              isVip ? "text-[hsl(45,93%,47%)]" : isPremium ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                          <h3 className="font-bold text-sm text-foreground">{plan.name}</h3>
                          {isCurrentPlan && (
                            <Badge variant="outline" className="text-[10px] border-primary text-primary px-1.5 py-0">
                              ATUAL
                            </Badge>
                          )}
                        </div>

                        {plan.description && (
                          <p className="text-[11px] text-muted-foreground mb-2 leading-snug">{plan.description}</p>
                        )}

                        {/* Features - show first 4 or all if expanded */}
                        <ul className="space-y-1">
                          {(isExpanded ? plan.features : plan.features.slice(0, 4)).map((feat, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Check className="h-3 w-3 text-[hsl(142,76%,36%)] shrink-0" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>

                        {/* Restrictions (shown only for free plan when expanded) */}
                        {isFree && isExpanded && plan.restrictions && plan.restrictions.length > 0 && (
                          <ul className="space-y-1 mt-2 pt-2 border-t border-border/30">
                            {plan.restrictions.map((restriction, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70">
                                <span>{restriction}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {isFree && !isExpanded && plan.restrictions && plan.restrictions.length > 0 && (
                          <p className="text-[10px] text-destructive/70 mt-1">
                            +{plan.restrictions.length} limitações do chat
                          </p>
                        )}

                        {/* Expand/collapse */}
                        {plan.features.length > 4 && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleExpand(plan.id);
                            }}
                            className="flex items-center gap-1 mt-1.5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3" />
                                Mostrar menos
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                +{plan.features.length - 4} benefícios
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Price + Button */}
                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                        <div>
                          {isFree ? (
                            <span className="text-base font-bold text-muted-foreground">Grátis</span>
                          ) : (
                            <>
                              {billingCycle === 'annual' ? (
                                <>
                                  <span
                                    className={cn(
                                      "text-lg font-bold",
                                      isVip ? "text-[hsl(45,93%,47%)]" : "text-primary"
                                    )}
                                  >
                                    {formatCurrency(getAnnualTotal(plan.plan_type))}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground block">/ano</span>
                                  <span className="text-[10px] text-[hsl(142,76%,36%)] font-semibold block">
                                    = {formatCurrency(price)}/mês
                                  </span>
                                  <span className="text-[9px] text-[hsl(142,76%,36%)]">
                                    -{savings}% off
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span
                                    className={cn(
                                      "text-lg font-bold",
                                      isVip ? "text-[hsl(45,93%,47%)]" : "text-primary"
                                    )}
                                  >
                                    {formatCurrency(price)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground block">/mês</span>
                                </>
                              )}
                            </>
                          )}
                        </div>

                        {isCurrentPlan ? (
                          <Button size="sm" variant="outline" disabled className="text-[11px] h-7 px-3">
                            Ativo
                          </Button>
                        ) : isFree ? null : (
                          <Button
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSelectPlan(plan.plan_type);
                            }}
                            className={cn(
                              "text-[11px] h-7 px-3",
                              isVip
                                ? "bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] hover:opacity-90"
                                : "bg-primary text-primary-foreground hover:opacity-90"
                            )}
                          >
                            Selecionar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Bottom note */}
            <p className="text-center text-[10px] text-muted-foreground pt-1">
              Cancele a qualquer momento • Pagamento seguro
            </p>
          </div>
        ) : (
          /* ========== PAYMENT VIEW ========== */
          <div className="overflow-y-auto scrollbar-hide px-4 sm:px-5 pb-4 sm:pb-5">
            <form onSubmit={handlePayment} className="space-y-4">
              {/* Plan summary */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border/50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-foreground">
                    Plano {selectedPlanData?.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {billingCycle === 'annual' ? 'Cobrança anual' : 'Cobrança mensal'}
                  </p>
                </div>
                <div className="text-right">
                  {billingCycle === 'annual' && selectedPlan ? (
                    <>
                      <span className="font-bold text-primary text-lg">
                        {formatCurrency(getAnnualTotal(selectedPlan))}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">/ano ({formatCurrency(getPrice(selectedPlan))}/mês)</span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-primary text-lg">
                        {formatCurrency(selectedPlan ? getPrice(selectedPlan) : 0)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">/mês</span>
                    </>
                  )}
                </div>
              </div>

              {/* Card form */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Número do Cartão</label>
                  <input
                    placeholder="0000 0000 0000 0000"
                    value={cardData.number}
                    onChange={(e) =>
                      setCardData((p) => ({ ...p, number: formatCardNumber(e.target.value) }))
                    }
                    maxLength={19}
                    disabled={isProcessing}
                    className="w-full h-10 px-3 rounded-md border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nome no Cartão</label>
                  <input
                    placeholder="NOME COMO ESTÁ NO CARTÃO"
                    value={cardData.name}
                    onChange={(e) =>
                      setCardData((p) => ({ ...p, name: e.target.value.toUpperCase() }))
                    }
                    disabled={isProcessing}
                    className="w-full h-10 px-3 rounded-md border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Validade</label>
                    <input
                      placeholder="MM/AA"
                      value={cardData.expiry}
                      onChange={(e) =>
                        setCardData((p) => ({ ...p, expiry: formatExpiry(e.target.value) }))
                      }
                      maxLength={5}
                      disabled={isProcessing}
                      className="w-full h-10 px-3 rounded-md border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">CVV</label>
                    <input
                      placeholder="123"
                      value={cardData.cvv}
                      onChange={(e) =>
                        setCardData((p) => ({
                          ...p,
                          cvv: e.target.value.replace(/\D/g, "").substring(0, 4),
                        }))
                      }
                      maxLength={4}
                      type="password"
                      disabled={isProcessing}
                      className="w-full h-10 px-3 rounded-md border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-[hsl(142,76%,36%)]" />
                Pagamento 100% seguro com criptografia SSL
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={!isFormValid || isProcessing}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Pagar {formatCurrency(selectedPlan ? (billingCycle === 'annual' ? getAnnualTotal(selectedPlan) : getPrice(selectedPlan)) : 0)}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
