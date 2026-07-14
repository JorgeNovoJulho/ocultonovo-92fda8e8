import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CreditCard, QrCode, ShieldCheck, Sparkles, Check, Ticket, X, CheckCircle2, Loader2, Ghost, Copy, Clock, AlertCircle, RefreshCw, Flame, Gift, PartyPopper, PartyPopper as Party } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useViewStore } from "@/store/useViewStore";
import { validateCouponCode, incrementCouponUsage, type Coupon } from "@/hooks/useCoupons";
import { useActivePlans, useGhostModeConfig } from "@/hooks/useSubscriptionPlans";
import { useActivateGhostMode } from "@/hooks/useGhostMode";
import { useGeneratePixPayment, type PixPaymentResult } from "@/hooks/usePixGateway";
import { useEarlyBirdAvailability, useValidateSubscriptionCoupon, useClaimEarlyBirdSlot, type CouponValidationResult } from "@/hooks/useEarlyBirdPromotion";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseExternal";
import { usePioneerStatus, applyPioneerDiscount } from "@/hooks/usePioneerDiscount";

interface SubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubscribe?: () => void;
  creatorName?: string;
  /** ID do criador alvo da assinatura (perfil VIP). Se omitido, é assinatura da plataforma. */
  creatorId?: string;
}

export function SubscriptionModal({ open, onOpenChange, onSubscribe, creatorName, creatorId }: SubscriptionModalProps) {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [appliedSubscriptionCoupon, setAppliedSubscriptionCoupon] = useState<CouponValidationResult | null>(null);
  const [showPriceAnimation, setShowPriceAnimation] = useState(false);
  const [addGhostMode, setAddGhostMode] = useState(false);
  const [referrerHandle, setReferrerHandle] = useState('');
  const [pixTimer, setPixTimer] = useState(0);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixData, setPixData] = useState<PixPaymentResult | null>(null);
  const [pixPaid, setPixPaid] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [payerCpf, setPayerCpf] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const pixPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const setPremium = useViewStore((s) => s.setPremium);
  const { data: plans } = useActivePlans();
  const { data: ghostConfig } = useGhostModeConfig();
  const activateGhostMode = useActivateGhostMode();
  const generatePixPayment = useGeneratePixPayment();
  const validateSubscriptionCoupon = useValidateSubscriptionCoupon();
  const claimEarlyBirdSlot = useClaimEarlyBirdSlot();
  const earlyBird = useEarlyBirdAvailability();
  const pioneer = usePioneerStatus();

  // Early Bird info
  const currentEarlyBird = selectedPlan === 'annual' ? earlyBird.annual : earlyBird.monthly;
  const hasEarlyBirdSlot = currentEarlyBird.isActive && currentEarlyBird.available > 0;

  // Encontrar planos do banco ou usar valores padrão
  const premiumPlan = plans?.find(p => p.plan_type === 'premium');
  const monthlyPrice = premiumPlan?.price_monthly || 25.90;
  const annualPerMonthPrice = premiumPlan?.price_annual_per_month || 19.90;
  const annualTotalPrice = annualPerMonthPrice * 12;

  const basePrice = selectedPlan === 'annual' ? annualTotalPrice : monthlyPrice;
  const ghostPrice = ghostConfig?.enabled && addGhostMode ? (ghostConfig?.price || 9.99) : 0;
  
  // Para plano anual, ghost mode é multiplicado por 12
  const ghostTotal = selectedPlan === 'annual' ? ghostPrice * 12 : ghostPrice;
  
  // Apply pioneer discount first (25% on base price)
  const pioneerDiscountedBase = pioneer.isPioneer ? applyPioneerDiscount(basePrice, true) : basePrice;
  const pioneerDiscountAmount = pioneer.isPioneer ? basePrice - pioneerDiscountedBase : 0;
  
  // Calcular desconto (cupom de criador OU cupom de assinatura)
  const discountPercent = appliedCoupon ? appliedCoupon.discount : 0;
  const subscriptionDiscount = appliedSubscriptionCoupon?.valid ? (appliedSubscriptionCoupon.discount_applied || 0) : 0;
  const subtotal = pioneerDiscountedBase + ghostTotal;
  const discount = appliedSubscriptionCoupon?.valid ? subscriptionDiscount : subtotal * (discountPercent / 100);
  const finalPrice = Math.max(0, subtotal - discount);

  const couponInputRef = useRef<HTMLInputElement>(null);

  // Timer do PIX baseado em dados reais
  useEffect(() => {
    if (!open || !pixData?.expires_at) {
      return;
    }

    const updateTimer = () => {
      const expiresAt = new Date(pixData.expires_at!).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setPixTimer(remaining);
      
      if (remaining <= 0) {
        setPixData(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [open, pixData?.expires_at]);

  // Reset quando fecha o modal
  useEffect(() => {
    if (!open) {
      setPixData(null);
      setPixTimer(0);
      setPixPaid(false);
      setCheckingPayment(false);
      if (pixPollingRef.current) {
        clearInterval(pixPollingRef.current);
        pixPollingRef.current = null;
      }
    }
  }, [open]);

  // Polling de confirmação do PIX em tempo real
  const startPixPolling = useCallback((transactionId: string) => {
    if (pixPollingRef.current) clearInterval(pixPollingRef.current);
    
    pixPollingRef.current = setInterval(async () => {
      try {
        const { data: tx } = await (supabase as any)
          .from('transactions')
          .select('status')
          .eq('external_id', transactionId)
          .maybeSingle();

        if (tx?.status === 'completed') {
          clearInterval(pixPollingRef.current!);
          pixPollingRef.current = null;

          setPixPaid(true);
          setCheckingPayment(false);

          // Confetti triplo!
          confetti({ particleCount: 180, spread: 90, origin: { y: 0.5 }, zIndex: 9999 });
          setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.5, x: 0.1 }, zIndex: 9999 }), 200);
          setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.5, x: 0.9 }, zIndex: 9999 }), 400);

          // Liberar plano no estado local imediatamente
          setPremium(true);
          onSubscribe?.();
        }
      } catch {
        // Silently retry
      }
    }, 3000); // Poll a cada 3 segundos
  }, [setPremium, onSubscribe]);

  // Formatar timer
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Prefill payer email from auth user
  useEffect(() => {
    if (!open) return;
    if (payerEmail) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mascarar CPF: 000.000.000-00
  const formatCpfMask = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  const cleanCpf = payerCpf.replace(/\D/g, '');
  const isValidCpf = cleanCpf.length === 11;
  const isValidName = payerName.trim().split(/\s+/).length >= 2 && payerName.trim().length >= 5;
  const canGeneratePix = isValidEmail(payerEmail) && isValidCpf && isValidName;

  // Gerar PIX real via Edge Function
  const handleGeneratePix = async () => {
    if (!canGeneratePix) {
      toast({
        title: 'Preencha seus dados',
        description: 'Nome completo, CPF e e‑mail válidos são obrigatórios para gerar o PIX.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const referrer = referrerHandle.trim().replace(/^@/, '').toLowerCase().slice(0, 32) || undefined;
      const result = await generatePixPayment.mutateAsync({
        amount: finalPrice,
        description: `Assinatura ${selectedPlan === 'annual' ? 'Anual' : 'Mensal'}${creatorName ? ` · ${creatorName}` : ' OCULTO'}${addGhostMode ? ' + Modo Fantasma' : ''}`,
        creator_id: creatorId,
        payer_email: payerEmail.trim(),
        payer_name: payerName.trim(),
        payer_cpf_cnpj: cleanCpf,
        ...(referrer ? { referrer_handle: referrer } as any : {}),
      } as any);

      if (result.success) {
        setPixData(result);
        setCheckingPayment(true);
        // Calcular timer inicial
        if (result.expires_at) {
          const expiresAt = new Date(result.expires_at).getTime();
          const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
          setPixTimer(remaining);
        } else {
          setPixTimer(900); // 15 minutos padrão
        }
        // Iniciar polling se tiver transaction_id real
        if (result.transaction_id) {
          startPixPolling(result.transaction_id);
        }
      }
    } catch {
      // Erro já é tratado pelo hook
    }
  };

  // Copiar código PIX
  const handleCopyPix = () => {
    if (!pixData?.qr_code) return;
    navigator.clipboard.writeText(pixData.qr_code);
    setPixCopied(true);
    toast({
      title: "Código copiado!",
      description: "Cole no app do seu banco para pagar.",
    });
    setTimeout(() => setPixCopied(false), 3000);
  };

  // Shake animation for invalid coupon
  const triggerShake = () => {
    if (couponInputRef.current) {
      couponInputRef.current.classList.add('animate-shake');
      setTimeout(() => {
        couponInputRef.current?.classList.remove('animate-shake');
      }, 500);
    }
  };

  // Confetti celebration for valid coupon
  const triggerConfetti = () => {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      colors: ['#22c55e', '#16a34a', '#15803d'],
    });

    fire(0.2, {
      spread: 60,
      colors: ['#22c55e', '#16a34a', '#15803d'],
    });

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: ['#22c55e', '#16a34a', '#15803d', '#fbbf24'],
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      colors: ['#22c55e', '#16a34a', '#15803d'],
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
      colors: ['#22c55e', '#16a34a', '#15803d', '#fbbf24'],
    });
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    if (!couponCode.trim()) {
      setCouponError('Digite um código de cupom');
      triggerShake();
      return;
    }
    
    setCouponLoading(true);
    try {
      // Primeiro, tentar validar como cupom de assinatura (admin)
      const subscriptionResult = await validateSubscriptionCoupon.mutateAsync({
        code: couponCode.trim(),
        planType: selectedPlan,
        originalPrice: subtotal,
      });

      if (subscriptionResult.valid) {
        setAppliedSubscriptionCoupon(subscriptionResult);
        setAppliedCoupon(null);
        setCouponCode('');
        triggerConfetti();
        setShowPriceAnimation(true);
        setTimeout(() => setShowPriceAnimation(false), 2000);
        setPixData(null);
        return;
      }

      // Se não for cupom de assinatura, tentar como cupom de criador (afiliado)
      const creatorCoupon = await validateCouponCode(couponCode.trim());
      if (creatorCoupon) {
        setAppliedCoupon(creatorCoupon);
        setAppliedSubscriptionCoupon(null);
        setCouponCode('');
        triggerConfetti();
        setShowPriceAnimation(true);
        setTimeout(() => setShowPriceAnimation(false), 2000);
        setPixData(null);
      } else {
        // Mostrar erro do cupom de assinatura se houver
        setCouponError(subscriptionResult.error || 'Cupom inválido, expirado ou esgotado');
        triggerShake();
      }
    } catch {
      setCouponError('Erro ao validar cupom');
      triggerShake();
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setAppliedSubscriptionCoupon(null);
    setCouponError('');
    setShowPriceAnimation(false);
    setPixData(null);
  };

  // Confetti especial para Early Bird
  const triggerEarlyBirdConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#FF007F', '#FFD700', '#FF1493'],
        zIndex: 9999,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#FF007F', '#FFD700', '#FF1493'],
        zIndex: 9999,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const handleSubscribe = async () => {
    // Increment coupon usage if applied (cupom de criador)
    if (appliedCoupon) {
      await incrementCouponUsage(appliedCoupon.id);
    }
    
    // Se cupom de assinatura foi aplicado, registrar uso
    if (appliedSubscriptionCoupon?.valid && appliedSubscriptionCoupon.coupon_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc('apply_subscription_coupon', {
          p_coupon_id: appliedSubscriptionCoupon.coupon_id,
          p_user_id: user.id,
          p_subscription_id: null,
          p_discount_applied: appliedSubscriptionCoupon.discount_applied || 0,
          p_original_price: appliedSubscriptionCoupon.original_price || 0,
          p_final_price: appliedSubscriptionCoupon.final_price || 0,
        });
      }
    }
    
    // Claim Early Bird slot se disponível
    if (hasEarlyBirdSlot) {
      try {
        const result = await claimEarlyBirdSlot.mutateAsync(selectedPlan);
        if (result.success) {
          triggerEarlyBirdConfetti();
          toast({
            title: '🎉 Parabéns!',
            description: `Você é o #${result.position} a garantir a oferta de lançamento! +${result.bonus_months} meses grátis!`,
          });
        }
      } catch {
        // Erro já tratado pelo hook, continuar com assinatura
      }
    }
    
    // Ativar Ghost Mode se selecionado
    if (addGhostMode && ghostConfig?.enabled) {
      await activateGhostMode.mutateAsync();
    }
    
    setPremium(true);
    onSubscribe?.();
    onOpenChange(false);
    
    // Reset state
    setAppliedCoupon(null);
    setAppliedSubscriptionCoupon(null);
    setCouponCode('');
    setCouponError('');
    setShowPriceAnimation(false);
    setAddGhostMode(false);
    setPixData(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setAppliedCoupon(null);
      setAppliedSubscriptionCoupon(null);
      setCouponCode('');
      setCouponError('');
      setShowPriceAnimation(false);
      setAddGhostMode(false);
      setPixData(null);
    }
    onOpenChange(open);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[96vw] max-w-lg sm:max-w-lg bg-card border-border max-h-[92vh] overflow-y-auto scrollbar-hide p-3 sm:p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-bold text-center flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {creatorName ? `Assine ${creatorName}` : 'Desbloqueie o OCULTO'}
          </DialogTitle>
        </DialogHeader>

        {/* Early Bird Banner */}
        {hasEarlyBirdSlot && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-primary/20 via-purple-500/10 to-[hsl(45,93%,47%)]/20 border border-primary/30 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm font-bold text-foreground">🚀 Oferta de Lançamento!</span>
              <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5">
                +{currentEarlyBird.bonusMonths} meses grátis
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Restam apenas <strong className="text-primary">{currentEarlyBird.available}</strong> vagas!</span>
              <span className="text-[10px]">Seja um dos 1000 primeiros</span>
            </div>
          </div>
        )}

        {/* Plan selection */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 my-3 sm:my-4">
          <button
            onClick={() => {
              setSelectedPlan('annual');
              setAppliedSubscriptionCoupon(null);
              setPixData(null);
            }}
            className={`relative p-3 sm:p-4 rounded-lg border-2 transition-all ${
              selectedPlan === 'annual'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/50'
            }`}
          >
            {selectedPlan === 'annual' && (
              <div className="absolute -top-2 -right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
              </div>
            )}
            <div className="absolute -top-2 left-1 sm:left-2 px-1.5 sm:px-2 py-0.5 bg-primary text-primary-foreground text-[10px] sm:text-xs font-semibold rounded">
              POPULAR
            </div>
            <p className="font-semibold text-foreground mt-2 text-sm sm:text-base">Acesso Anual</p>
            <p className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(annualPerMonthPrice)}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">/mês (anual)</p>
            
          </button>

          <button
            onClick={() => {
              setSelectedPlan('monthly');
              setAppliedSubscriptionCoupon(null);
              setPixData(null);
            }}
            className={`relative p-3 sm:p-4 rounded-lg border-2 transition-all ${
              selectedPlan === 'monthly'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/50'
            }`}
          >
            {selectedPlan === 'monthly' && (
              <div className="absolute -top-2 -right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
              </div>
            )}
            <p className="font-semibold text-foreground text-sm sm:text-base">Mensal Flex</p>
            <p className="text-xl sm:text-2xl font-bold text-secondary">{formatCurrency(monthlyPrice)}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">/mês</p>
            
          </button>
        </div>

        {/* Ghost Mode Add-on */}
        {ghostConfig?.enabled && (
          <div 
            className={cn(
              "p-3 sm:p-4 rounded-lg border-2 transition-all cursor-pointer",
              addGhostMode 
                ? "border-primary bg-primary/5" 
                : "border-border/50 hover:border-primary/50"
            )}
            onClick={() => {
              setAddGhostMode(!addGhostMode);
              setPixData(null);
            }}
          >
            <div className="flex items-start gap-2 sm:gap-3">
              <Checkbox 
                checked={addGhostMode} 
                onCheckedChange={(checked) => {
                  setAddGhostMode(!!checked);
                  setPixData(null);
                }}
                className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                  <Ghost className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5 transition-colors shrink-0",
                    addGhostMode ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className="font-semibold text-foreground text-sm sm:text-base">Modo Fantasma</span>
                  <span className="text-xs sm:text-sm font-medium text-primary">
                    +{formatCurrency(ghostConfig.price)}/mês
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Navegue sem deixar rastros
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Coupon Section */}
        <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 rounded-lg bg-muted/20 border border-dashed border-border/50">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Ticket className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Tem um cupom de desconto?</span>
          </div>
          
          {appliedCoupon ? (
            <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30 animate-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-[hsl(142,76%,36%)] shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-[hsl(142,76%,36%)] text-sm sm:text-base truncate">
                    {appliedCoupon.discount}% OFF!
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {appliedCoupon.code}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveCoupon}
                className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground shrink-0"
               aria-label="Fechar">
                <X className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Ticket className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <Input
                  ref={couponInputRef}
                  placeholder="Código"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setCouponError('');
                  }}
                  disabled={couponLoading}
                  className={cn(
                    "bg-muted/30 border-border/50 pl-7 sm:pl-10 font-mono uppercase transition-transform text-sm",
                    couponError && "border-destructive"
                  )}
                />
              </div>
              <Button
                variant="outline"
                onClick={handleApplyCoupon}
                disabled={couponLoading}
                className="shrink-0 px-3 sm:px-4"
                size="sm"
              >
                {couponLoading ? (
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                ) : (
                  'Aplicar'
                )}
              </Button>
            </div>
          )}
          
          {couponError && (
            <p className="text-xs text-destructive animate-fade-in">{couponError}</p>
          )}
        </div>

        {/* Price Summary with Animation */}
        <div className={cn(
          "space-y-2 p-2 sm:p-3 rounded-lg transition-all duration-500 text-sm",
          appliedCoupon ? "bg-[hsl(142,76%,36%)]/5 border border-[hsl(142,76%,36%)]/20" : "bg-muted/10"
        )}>
          {/* Success animation banner */}
          {showPriceAnimation && (
            <div className="flex items-center justify-center gap-2 py-2 mb-2 rounded-lg bg-[hsl(142,76%,36%)]/20 animate-pulse">
              <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-[hsl(142,76%,36%)]" />
              <span className="text-xs sm:text-sm font-semibold text-[hsl(142,76%,36%)]">
                🎉 Desconto aplicado!
              </span>
            </div>
          )}

          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">
              Plano {selectedPlan === 'annual' ? 'Anual' : 'Mensal'}
            </span>
            <span className={cn("text-foreground", pioneer.isPioneer && "line-through text-muted-foreground")}>{formatCurrency(basePrice)}</span>
          </div>

          {pioneer.isPioneer && pioneerDiscountAmount > 0 && (
            <div className="flex justify-between text-xs sm:text-sm animate-fade-in">
              <span className="text-green-400 flex items-center gap-1">
                🏆 Pioneiro (-25%)
              </span>
              <span className="text-green-400">-{formatCurrency(pioneerDiscountAmount)}</span>
            </div>
          )}

          {addGhostMode && ghostConfig?.enabled && (
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Ghost className="h-3 w-3 text-primary" />
                Fantasma
                {selectedPlan === 'annual' && <span className="text-[10px]">(12x)</span>}
              </span>
              <span className="text-primary">+{formatCurrency(ghostTotal)}</span>
            </div>
          )}
          
          {appliedCoupon && (
            <div className="flex justify-between text-xs sm:text-sm animate-fade-in">
              <span className="text-[hsl(142,76%,36%)]">Desconto ({appliedCoupon.discount}%)</span>
              <span className="text-[hsl(142,76%,36%)]">-{formatCurrency(discount)}</span>
            </div>
          )}
          
          <div className="flex justify-between font-bold border-t border-border/30 pt-2">
            <span>Total</span>
            <span className={cn(
              "transition-all duration-500",
              appliedCoupon && "text-[hsl(142,76%,36%)]",
              showPriceAnimation && "scale-110"
            )}>
              <span className="text-base sm:text-lg">
                {formatCurrency(finalPrice)}
              </span>
            </span>
          </div>
        </div>

        {/* Campo opcional: indicador (afiliado manual) */}
        <div className="space-y-1.5">
          <Label htmlFor="referrer-handle" className="text-xs sm:text-sm flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[hsl(45,93%,47%)]" />
            Possui um indicador? <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            id="referrer-handle"
            value={referrerHandle}
            onChange={(e) => setReferrerHandle(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 32))}
            placeholder="@usuario"
            maxLength={32}
            autoComplete="off"
            className="bg-muted/30 border-border text-sm h-9 sm:h-10"
          />
          <p className="text-[11px] text-muted-foreground">
            Quem te indicou ganha 5% de comissão. Validado pelo backend (sem autoindicação).
          </p>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 py-2 px-3 sm:px-4 bg-muted/30 rounded-lg">
          <ShieldCheck className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
          <span className="text-xs sm:text-sm text-muted-foreground">Conexão Segura · Pagamento Protegido</span>
        </div>

        {/* Payment tabs */}
        <Tabs
          defaultValue={(typeof window !== 'undefined' && localStorage.getItem('preferred_payment_tab')) === 'pix' ? 'pix' : 'credit'}
          className="w-full"
          onValueChange={(val) => {
            try { localStorage.setItem('preferred_payment_tab', val); } catch {}
          }}
        >
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 h-9 sm:h-10">
            <TabsTrigger value="credit" className="gap-1 sm:gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
              Crédito
            </TabsTrigger>
            <TabsTrigger value="pix" className="gap-1 sm:gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <QrCode className="h-3 w-3 sm:h-4 sm:w-4" />
              PIX
            </TabsTrigger>
          </TabsList>

          <TabsContent value="credit" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="card-number" className="text-xs sm:text-sm">Número do Cartão</Label>
              <Input
                id="card-number"
                placeholder="1234 5678 9012 3456"
                className="bg-muted/30 border-border text-sm h-9 sm:h-10"
              />
            </div>
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="card-name" className="text-xs sm:text-sm">Nome no Cartão</Label>
              <Input
                id="card-name"
                placeholder="NOME COMPLETO"
                className="bg-muted/30 border-border text-sm h-9 sm:h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="expiry" className="text-xs sm:text-sm">Validade</Label>
                <Input
                  id="expiry"
                  placeholder="MM/AA"
                  className="bg-muted/30 border-border text-sm h-9 sm:h-10"
                />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="cvv" className="text-xs sm:text-sm">CVV</Label>
                <Input
                  id="cvv"
                  placeholder="123"
                  type="password"
                  className="bg-muted/30 border-border text-sm h-9 sm:h-10"
                />
              </div>
            </div>
            <Button
              onClick={handleSubscribe}
              className="w-full glow-primary bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold h-10 sm:h-12 text-sm sm:text-lg"
            >
              Assinar por {formatCurrency(finalPrice)}
              {selectedPlan === 'annual' ? '/ano' : '/mês'}
            </Button>
          </TabsContent>

          <TabsContent value="pix" className="mt-3 sm:mt-4">
            <div className="flex flex-col items-center py-3 sm:py-4 space-y-3 sm:space-y-4">

              {/* ── Modal de Pagamento Recebido ── */}
              {pixPaid ? (
                <div className="flex flex-col items-center text-center space-y-5 py-6 px-4 animate-fade-in">
                  <div className="w-24 h-24 rounded-full bg-green-500/15 flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="h-12 w-12 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">Pagamento Recebido! 🎉</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Seu plano foi ativado com sucesso.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <Sparkles className="h-4 w-4 text-green-400 shrink-0" />
                    <span className="text-sm font-medium text-green-300">
                      Acesso Premium liberado agora!
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Valor pago: <span className="text-primary font-bold">{formatCurrency(finalPrice)}</span>
                  </p>
                  <Button
                    onClick={() => handleClose(false)}
                    className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-bold h-12"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Continuar no OCULTO
                  </Button>
                </div>
              ) : generatePixPayment.isPending && !pixData ? (
              /* Gerando PIX — spinner */
                <div className="flex flex-col items-center space-y-4 py-8">
                  <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl bg-muted/30 border-2 border-dashed border-border flex items-center justify-center">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center">Gerando QR Code PIX…</p>
                </div>
              ) : !pixData ? (
                <div className="flex flex-col items-center space-y-3 py-2 w-full">
                  <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl bg-muted/30 border-2 border-dashed border-border flex items-center justify-center">
                    <QrCode className="h-10 w-10 sm:h-14 sm:w-14 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center">
                    Preencha seus dados para gerar o QR Code PIX
                  </p>

                  <div className="w-full space-y-2 text-left">
                    <div className="space-y-1">
                      <Label htmlFor="pix-name" className="text-xs">Nome completo</Label>
                      <Input
                        id="pix-name"
                        autoComplete="name"
                        placeholder="Como está no documento"
                        value={payerName}
                        onChange={(e) => setPayerName(e.target.value)}
                        className="bg-muted/30 border-border text-sm h-10"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="pix-cpf" className="text-xs">CPF</Label>
                        <Input
                          id="pix-cpf"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="000.000.000-00"
                          value={payerCpf}
                          onChange={(e) => setPayerCpf(formatCpfMask(e.target.value))}
                          className="bg-muted/30 border-border text-sm h-10"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pix-email" className="text-xs">E‑mail</Label>
                        <Input
                          id="pix-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="seu@email.com"
                          value={payerEmail}
                          onChange={(e) => setPayerEmail(e.target.value)}
                          className="bg-muted/30 border-border text-sm h-10"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 leading-snug">
                      Usamos seus dados apenas para emitir a cobrança PIX no gateway. Nada é compartilhado publicamente.
                    </p>
                  </div>

                  <Button
                    size="lg"
                    onClick={handleGeneratePix}
                    disabled={generatePixPayment.isPending || !canGeneratePix}
                    className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold h-12"
                  >
                    {generatePixPayment.isPending ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <QrCode className="h-5 w-5 mr-2" />
                    )}
                    Gerar QR Code PIX
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Valor: <span className="font-semibold text-primary">{formatCurrency(finalPrice)}</span>
                  </p>
                </div>
              ) : (
                <>
                  {/* QR Code real */}
                  <div className="relative">
                    <div className="w-40 h-40 sm:w-48 sm:h-48 bg-white rounded-lg p-2 sm:p-3 shadow-lg">
                      {pixData.qr_code_base64 ? (
                        <img loading="lazy" decoding="async" 
                          src={`data:image/png;base64,${pixData.qr_code_base64}`} 
                          alt="QR Code PIX" 
                          className="w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted rounded">
                          <QrCode className="h-16 w-16 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    {/* Badge de valor */}
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 sm:px-4 py-1 bg-primary text-primary-foreground text-xs sm:text-sm font-bold rounded-full shadow-lg">
                      {formatCurrency(finalPrice)}
                    </div>
                  </div>

                  {/* Timer de expiração */}
                  <div className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg",
                    pixTimer < 60 ? "bg-destructive/20 text-destructive" : "bg-muted/50 text-muted-foreground"
                  )}>
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="text-xs sm:text-sm font-medium">
                      Expira em: <span className="font-mono">{formatTimer(pixTimer)}</span>
                    </span>
                    {pixTimer < 60 && <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />}
                  </div>

                  <p className="text-xs sm:text-sm text-muted-foreground text-center px-4">
                    Escaneie o QR Code com o app do seu banco<br />
                    ou copie o código abaixo
                  </p>

                  {/* Código PIX com botão copiar */}
                  {pixData.qr_code && (
                    <div className="w-full space-y-2 px-2">
                      <Label className="text-xs text-muted-foreground">Código PIX Copia e Cola:</Label>
                      <div className="flex w-full gap-2">
                        <Input
                          readOnly
                          value={pixData.qr_code}
                          className="bg-muted/30 border-border text-xs font-mono h-9"
                        />
                        <Button 
                          variant={pixCopied ? "default" : "outline"} 
                          onClick={handleCopyPix}
                          size="sm"
                          className={cn(
                            "shrink-0 gap-1 transition-all px-2 sm:px-3",
                            pixCopied && "bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,36%)] text-primary-foreground"
                          )}
                        >
                          {pixCopied ? (
                            <>
                              <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="hidden sm:inline">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="hidden sm:inline">Copiar</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Status: aguardando confirmação em tempo real */}
                  {checkingPayment && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                      <span>Aguardando confirmação do pagamento…</span>
                    </div>
                  )}

                  {/* Botão para gerar novo PIX */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGeneratePix}
                    disabled={generatePixPayment.isPending}
                    className="text-xs text-muted-foreground"
                  >
                    <RefreshCw className={cn("h-3 w-3 mr-1", generatePixPayment.isPending && "animate-spin")} />
                    Gerar novo código
                  </Button>

                  <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                    Após o pagamento, sua assinatura será ativada automaticamente
                  </p>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
