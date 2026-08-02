import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  QrCode, 
  Copy, 
  Check, 
  Clock, 
  Shield, 
  Lock, 
  RefreshCw,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  PartyPopper,
  CreditCard,
  Crown,
  Bug
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { usePixCheckout } from '@/hooks/usePixCheckout';
import { useAuth } from '@/hooks/useAuth';
import { useSettingValue } from '@/hooks/useSystemSettings';
import { useCreateCartAbandonment, useMarkCartRecovered } from '@/hooks/useCartAbandonment';
import { useTrackConversionEvent } from '@/hooks/useConversionEvents';
import { PhoneCaptureStep } from '@/components/PhoneCaptureStep';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import confetti from 'canvas-confetti';
import { cn } from '@/lib/utils';
import CardPaymentForm from '@/components/CardPaymentForm';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';
import { SocialDiscountPreview } from '@/components/social-score/SocialDiscountPreview';

type CheckoutStep = 'phone' | 'payment';

// CPF/CNPJ mask helpers
function maskCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function maskCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
function maskCpfCnpj(v: string) {
  const digits = v.replace(/\D/g, '');
  return digits.length <= 11 ? maskCpf(v) : maskCnpj(v);
}
function isValidCpf(cpf: string) {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rem = (sum * 10) % 11; if (rem === 10) rem = 0;
  if (rem !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rem = (sum * 10) % 11; if (rem === 10) rem = 0;
  return rem === parseInt(d[10]);
}
function isValidCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(d[i]) * w1[i];
  let rem = sum % 11; const d1 = rem < 2 ? 0 : 11 - rem;
  if (parseInt(d[12]) !== d1) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(d[i]) * w2[i];
  rem = sum % 11; const d2 = rem < 2 ? 0 : 11 - rem;
  return parseInt(d[13]) === d2;
}

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('phone');
  const [userPhone, setUserPhone] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [cartId, setCartId] = useState<string | null>(null);
  const [pioneerInvalidated, setPioneerInvalidated] = useState(false);
  const [couponRemoved, setCouponRemoved] = useState(false);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [simulatingPayment, setSimulatingPayment] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [cpfCnpjSaved, setCpfCnpjSaved] = useState(false);
  const [cpfCnpjError, setCpfCnpjError] = useState('');
  const [autoSaving, setAutoSaving] = useState(false);

  // Master admin (único que vê o botão de simulação)
  const isMasterAdmin = (user?.email || '').trim().toLowerCase() === 'ocultomaster@gmail.com';

  // Load CPF/CNPJ from profile (auto-preenchimento)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('cpf_cnpj')
        .eq('user_id', user.id)
        .maybeSingle();
      if ((data as any)?.cpf_cnpj) {
        setCpfCnpj(maskCpfCnpj((data as any).cpf_cnpj));
        setCpfCnpjSaved(true);
      }
    })();
  }, [user?.id]);

  const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCpfCnpj(e.target.value);
    setCpfCnpj(masked);
    setCpfCnpjSaved(false);
    setCpfCnpjError('');
  };

  const saveCpfCnpj = async () => {
    if (!user?.id) return;
    const digits = cpfCnpj.replace(/\D/g, '');
    if (digits.length <= 11) {
      if (!isValidCpf(digits)) { setCpfCnpjError('CPF inválido'); return; }
    } else {
      if (!isValidCnpj(digits)) { setCpfCnpjError('CNPJ inválido'); return; }
    }
    try {
      // Try update first, fallback to upsert (for profiles missing the row)
      const { data: updated, error: updateErr } = await supabase
        .from('profiles')
        .update({ cpf_cnpj: digits } as any)
        .eq('user_id', user.id)
        .select('user_id')
        .maybeSingle();

      if (updateErr) {
        console.error('[CPF save] update error:', updateErr);
        setCpfCnpjError(updateErr.message || 'Erro ao salvar');
        toast({ title: 'Erro ao salvar CPF/CNPJ', description: updateErr.message, variant: 'destructive' });
        return;
      }

      if (!updated) {
        // Linha de profile ainda não existe — cria via upsert
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert({ user_id: user.id, cpf_cnpj: digits } as any, { onConflict: 'user_id' });
        if (upsertErr) {
          console.error('[CPF save] upsert error:', upsertErr);
          setCpfCnpjError(upsertErr.message || 'Erro ao salvar');
          toast({ title: 'Erro ao salvar CPF/CNPJ', description: upsertErr.message, variant: 'destructive' });
          return;
        }
      }

      setCpfCnpjSaved(true);
      setCpfCnpjError('');
      toast({ title: 'CPF/CNPJ salvo com sucesso!' });
    } catch (e: any) {
      console.error('[CPF save] exception:', e);
      setCpfCnpjError(e?.message || 'Erro ao salvar');
      toast({ title: 'Erro ao salvar CPF/CNPJ', description: e?.message, variant: 'destructive' });
    }
  };

  // Auto-save debounced (1s após digitar CPF/CNPJ válido)
  useEffect(() => {
    if (!user?.id) return;
    if (cpfCnpjSaved) return;
    const digits = cpfCnpj.replace(/\D/g, '');
    const valid = digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false;
    if (!valid) return;
    setAutoSaving(true);
    const t = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .upsert({ user_id: user.id, cpf_cnpj: digits } as any, { onConflict: 'user_id' });
        if (!error) {
          setCpfCnpjSaved(true);
          setCpfCnpjError('');
        }
      } finally {
        setAutoSaving(false);
      }
    }, 1000);
    return () => { clearTimeout(t); setAutoSaving(false); };
  }, [cpfCnpj, cpfCnpjSaved, user?.id]);

  // Check sandbox mode
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('pix_gateway_config')
        .select('sandbox_mode')
        .maybeSingle();
      if (data?.sandbox_mode) setSandboxMode(true);
    })();
  }, []);


  // Cart abandonment hooks
  const createCartAbandonment = useCreateCartAbandonment();
  const markCartRecovered = useMarkCartRecovered();
  const trackEvent = useTrackConversionEvent();

  // Parse URL params
  const planType = searchParams.get('plan') as 'monthly' | 'annual' || 'monthly';
  const rawAmount = parseFloat(searchParams.get('amount') || '0');
  // Derive tier name: explicit param OR infer from amount (≤50 = Premium, >50 = VIP)
  const tierName = searchParams.get('tier') || (rawAmount <= 50 ? 'Premium' : 'VIP');
  const rawCouponCode = searchParams.get('coupon');
  const hasGhostMode = searchParams.get('ghostMode') === 'true';
  const rawOriginalPrice = parseFloat(searchParams.get('original') || rawAmount.toString());

  // If pioneer coupon was invalidated OR user clicked "Remover", revert to original price
  const couponInactive = pioneerInvalidated || couponRemoved;
  const amount = couponInactive ? rawOriginalPrice : rawAmount;
  const couponCode = couponInactive ? null : (rawCouponCode ? rawCouponCode.trim().toUpperCase() : null);
  const originalPrice = rawOriginalPrice;

  // Validate pioneer slots at payment time (fresh check, ignores cache)
  const validatePioneerSlots = useCallback(async () => {
    if (rawCouponCode !== 'PIONEIRO25') return true;
    try {
      const { data, error } = await supabase.rpc('get_pioneer_slots_status');
      if (error) return true; // fail-open, server will validate
      const slots = data as { is_full: boolean };
      if (slots.is_full) {
        setPioneerInvalidated(true);
        toast({
          title: '⚠️ Lote de Pioneiros Encerrado',
          description: 'Desculpe, o lote de pioneiros acabou de ser encerrado. O valor foi atualizado para o plano padrão.',
          variant: 'destructive',
        });
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }, [rawCouponCode]);

  // Check if coming from magic link (skip phone step)
  const fromMagicLink = searchParams.get('token');

  // Track checkout start on mount
  useEffect(() => {
    if (amount > 0) {
      trackEvent.mutate({ 
        eventType: 'checkout_start', 
        planType: planType === 'annual' ? 'premium' : 'premium',
        metadata: { amount, hasGhostMode }
      });
    }
  }, []);

  useEffect(() => {
    if (fromMagicLink) {
      setCheckoutStep('payment');
    }
  }, [fromMagicLink]);

  const handlePhoneSubmit = async (phone: string, name?: string) => {
    setUserPhone(phone);
    setUserName(name || '');

    try {
      createCartAbandonment.mutate({
        phone_number: phone,
        user_name: name,
        plan_type: planType,
        amount,
        coupon_code: couponCode || undefined,
        ghost_mode: hasGhostMode,
      }, {
        onSuccess: (data) => {
          if (data?.id) {
            setCartId(data.id);
          }
          setCheckoutStep('payment');
        },
        onError: () => {
          // Still proceed to payment even if cart creation fails
          setCheckoutStep('payment');
        }
      });
    } catch {
      setCheckoutStep('payment');
    }
  };

  const handlePaymentSuccess = async (transactionId: string) => {
    // Track payment success
    trackEvent.mutate({ 
      eventType: 'payment_success', 
      planType: 'premium',
      metadata: { transactionId, amount }
    });

    // Mark cart as recovered
    if (cartId) {
      markCartRecovered.mutate(cartId);
    }

    // CRITICAL: Invalidate all caches so plan_type updates immediately
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['payment-status'] });
    
    setShowSuccess(true);
    triggerCelebration();
    
    // Redirect after 3 seconds (C55: fast feedback)
    setTimeout(() => {
      navigate('/feed');
    }, 3000);
  };

  const { state, generatePix, regeneratePix, copyPixCode, cancelPayment } = usePixCheckout({
    amount,
    planType,
    description: `Assinatura ${planType === 'annual' ? 'Anual' : 'Mensal'} OCULTO`,
    onSuccess: handlePaymentSuccess,
    onExpired: () => {
      // Handle expiration
    },
  });

  // Validate pioneer slots and auto-generate PIX when entering payment step (only if CPF/CNPJ saved)
  useEffect(() => {
    if (checkoutStep === 'payment' && amount > 0 && state.status === 'idle' && cpfCnpjSaved) {
      validatePioneerSlots().then(() => {
        generatePix();
      });
    }
  }, [checkoutStep, amount, state.status, generatePix, validatePioneerSlots, cpfCnpjSaved]);

  // Celebration animation
  const triggerCelebration = () => {
    // Single burst instead of continuous RAF loop — saves CPU on low-end devices
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FF007F', '#9b87f5', '#ffffff'],
    });
  };

  // Timer display — isolated to avoid full page re-renders
  const timerRef = useRef<HTMLSpanElement>(null);
  const getTimeRemaining = useCallback(() => {
    if (!state.expiresAt) return null;
    const diff = state.expiresAt.getTime() - Date.now();
    if (diff <= 0) return { minutes: 0, seconds: 0, percentage: 0 };
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    const totalSeconds = 30 * 60;
    const percentage = (diff / (totalSeconds * 1000)) * 100;
    return { minutes, seconds, percentage };
  }, [state.expiresAt]);

  // Update timer text via DOM ref — zero re-renders
  useEffect(() => {
    if (state.status !== 'waiting') return;
    const interval = setInterval(() => {
      const tr = getTimeRemaining();
      if (timerRef.current && tr) {
        timerRef.current.textContent = `Expira em ${String(tr.minutes).padStart(2, '0')}:${String(tr.seconds).padStart(2, '0')}`;
        timerRef.current.className = tr.minutes < 5 ? 'text-amber-500 font-medium' : 'text-muted-foreground';
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.status, getTimeRemaining]);

  const handleCopy = async () => {
    await copyPixCode();
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Redirect if no amount — send to plans page
  if (!amount || amount <= 0) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Checkout Inválido</h2>
            <p className="text-muted-foreground">
              Parâmetros de pagamento não encontrados. Escolha um plano para continuar.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild className="bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold">
                <Link to="/checkout?plan=monthly&amount=25.90">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Assinar Premium — R$ 25,90/mês
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/checkout?plan=monthly&amount=145.90">
                  <Crown className="h-4 w-4 mr-2" />
                  Assinar VIP — R$ 145,90/mês
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/feed">Voltar ao Feed</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success screen
  if (showSuccess || state.status === 'confirmed') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-primary/30 bg-gradient-to-b from-primary/5 to-background">
          <CardContent className="pt-8 text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto animate-pulse">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <PartyPopper className="absolute -right-2 top-0 h-8 w-8 text-primary animate-bounce" />
              <PartyPopper className="absolute -left-2 top-0 h-8 w-8 text-secondary animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
            
            <h2 className="text-2xl font-black mb-2">Pagamento Confirmado!</h2>
            <p className="text-muted-foreground mb-6">
              Sua assinatura {planType === 'annual' ? 'Anual' : 'Mensal'} foi ativada com sucesso.
            </p>
            
            <div className="bg-muted/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-muted-foreground">Valor pago</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(amount)}</p>
            </div>
            
            <Button asChild className="w-full" size="lg">
              <Link to="/feed">
                <Sparkles className="h-5 w-5 mr-2" />
                Explorar Agora
              </Link>
            </Button>
            
            <p className="text-xs text-muted-foreground mt-4">
              Redirecionando automaticamente em 5 segundos...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phone capture step
  if (checkoutStep === 'phone') {
    return (
      <div className="min-h-dvh bg-background scrollbar-hide overflow-x-hidden">
        {/* Header */}
        <header className="border-b bg-card/50 sticky top-0 z-10">
          <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
            <button type="button" className="inline-flex items-center justify-center h-10 w-10 rounded-md hover:bg-accent" onClick={() => navigate('/feed')}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-bold">Checkout</h1>
              <p className="text-sm text-muted-foreground">Passo 1 de 2 - Seus dados</p>
            </div>
          </div>
        </header>

        <main className="container max-w-lg mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Quase lá! 🎉</CardTitle>
              <CardDescription>
                Para garantir sua vaga, precisamos de algumas informações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PhoneCaptureStep
                onSubmit={handlePhoneSubmit}
                isLoading={createCartAbandonment.isPending}
              />
            </CardContent>
          </Card>

          {/* Order summary mini */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">Plano {planType === 'annual' ? 'Anual' : 'Mensal'}</p>
                <p className="text-sm text-muted-foreground">
                  {planType === 'annual' ? '12 meses' : '1 mês'} de acesso VIP
                </p>
              </div>
              <p className="text-xl font-bold text-primary">{formatCurrency(amount)}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Payment step
  return (
    <div className="min-h-dvh bg-background scrollbar-hide overflow-x-hidden">
      {/* Header */}
      <header className="border-b bg-card/50 sticky top-0 z-10">
        <div className="container max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCheckoutStep('phone')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base leading-tight">Checkout</h1>
            <p className="text-[11px] sm:text-sm text-muted-foreground leading-tight">Passo 2 de 2 - Pagamento</p>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <ErrorBoundary inline>
        <div className="grid md:grid-cols-2 gap-3 sm:gap-6">
          {/* Order Summary */}
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">Resumo do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">
                    Plano {planType === 'annual' ? 'Anual' : 'Mensal'} {tierName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {planType === 'annual' ? '12 meses de acesso' : '1 mês de acesso'}
                  </p>
                </div>
                <Badge variant="secondary">{tierName}</Badge>
              </div>

              {hasGhostMode && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Ghost Mode</span>
                  <span>Incluído</span>
                </div>
              )}

              {couponCode && originalPrice > amount && (
                <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-green-300 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Cupom aplicado
                    </span>
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono text-[11px] text-green-200 bg-green-500/15 px-1.5 py-0.5 rounded">
                        {couponCode}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-green-200 hover:text-green-100 hover:bg-green-500/20"
                        onClick={() => {
                          setCouponRemoved(true);
                          toast({
                            title: 'Cupom removido',
                            description: 'Subtotal e total recalculados para o valor original.',
                          });
                        }}
                        aria-label="Remover cupom aplicado"
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-muted-foreground line-through">
                      {formatCurrency(originalPrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-green-400">
                    <span>Desconto</span>
                    <span>-{formatCurrency(originalPrice - amount)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-green-500/20">
                    <span className="text-xs font-semibold">Total com desconto</span>
                    <span className="text-base font-bold text-green-300">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                </div>
              )}

              {couponRemoved && rawCouponCode && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                  <span>Cupom <code className="font-mono text-foreground">{rawCouponCode}</code> removido. Total restaurado.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setCouponRemoved(false)}
                  >
                    Reaplicar
                  </Button>
                </div>
              )}

              {pioneerInvalidated && (
                <div className="flex items-center gap-2 text-sm text-amber-500 bg-amber-500/10 rounded-lg p-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Lote pioneiro encerrado — valor atualizado para o plano padrão.</span>
                </div>
              )}

              {/* Aura Social — prévia de desconto dinâmico */}
              <SocialDiscountPreview
                userId={user?.id}
                kind={tierName === 'VIP' ? 'discount_vip' : 'discount_sub'}
                amount={amount}
                label={tierName === 'VIP' ? 'VIP' : 'Mensal'}
              />

              <Separator />

              <div className="flex justify-between items-center">
                <span className="font-bold">Total</span>
                <div className="text-right">
                  {originalPrice > amount && (
                    <p className="text-sm text-muted-foreground line-through">
                      {formatCurrency(originalPrice)}
                    </p>
                  )}
                  <p className="text-xl font-bold text-primary">{formatCurrency(amount)}</p>
                </div>
              </div>

              {/* Security badges */}
              <div className="flex flex-wrap gap-2 pt-4">
                <Badge variant="outline" className="text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  Pagamento Seguro
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Criptografado
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card className="border-primary/20">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">Escolha como pagar</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Selecione sua forma de pagamento preferida
              </CardDescription>
            </CardHeader>
             <CardContent className="space-y-4 p-4 sm:p-6">
              {/* CPF/CNPJ field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  CPF ou CNPJ <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpfCnpj}
                    onChange={handleCpfCnpjChange}
                    className={cn(
                      "flex-1 min-w-0 bg-muted border rounded-lg px-3 py-2 text-sm w-full",
                      cpfCnpjError ? "border-destructive" : cpfCnpjSaved ? "border-green-500/50" : "border-border"
                    )}
                    maxLength={18}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant={cpfCnpjSaved ? "outline" : "default"}
                    onClick={saveCpfCnpj}
                    disabled={cpfCnpj.replace(/\D/g, '').length < 11 || cpfCnpjSaved}
                    className="shrink-0 w-full sm:w-auto"
                  >
                    {cpfCnpjSaved ? (
                      <><Check className="h-4 w-4 text-green-500 mr-1" /> Salvo</>
                    ) : autoSaving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
                {cpfCnpjError && (
                  <p className="text-xs text-destructive">{cpfCnpjError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Obrigatório para gerar cobranças PIX
                </p>
                <div className="flex items-start gap-2 text-[11px] text-muted-foreground/80 bg-muted/40 border border-border/50 rounded-md p-2 mt-1">
                  <Lock className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                  <span>
                    Seus dados são protegidos por <strong>criptografia de ponta a ponta</strong> e
                    {' '}<strong>não são compartilhados com terceiros</strong>, em conformidade com a
                    LGPD (Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014) e
                    o GDPR (Regulamento UE 2016/679).
                  </span>
                </div>
              </div>

              <Separator />

              <Tabs value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'pix' | 'card')}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="pix" className="flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    PIX
                  </TabsTrigger>
                <TabsTrigger value="card" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Cartão
                  </TabsTrigger>
                </TabsList>

                {/* PIX Tab */}
                <TabsContent value="pix" className="space-y-4 mt-4">
              {/* Idle placeholder — antes da geração do PIX */}
              {state.status === 'idle' && (
                <div className="space-y-3 py-2">
                  <div className="flex justify-center">
                    <div className="bg-white/5 border border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2">
                      <QrCode className="h-20 w-20 text-muted-foreground/40" />
                      <p className="text-[11px] text-muted-foreground text-center">
                        QR Code será gerado após confirmar CPF/CNPJ
                      </p>
                    </div>
                  </div>
                  {couponCode && originalPrice > amount && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-2 text-xs flex items-center justify-between">
                      <span className="text-green-400">Desconto aplicado: {couponCode}</span>
                      <span className="font-semibold text-green-400">
                        -{formatCurrency(originalPrice - amount)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {/* Loading state */}
              {state.status === 'generating' && (
                <div className="space-y-4 py-6">
                  <div className="flex justify-center">
                    <Skeleton className="w-48 h-48 rounded-xl" />
                  </div>
                  <Skeleton className="h-4 w-3/4 mx-auto" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-4 w-1/2 mx-auto" />
                </div>
              )}

              {/* Error state */}
              {state.status === 'error' && (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <p className="text-destructive font-medium mb-2">Erro ao gerar PIX</p>
                  <p className="text-sm text-muted-foreground mb-4">{state.error}</p>
                  <Button onClick={regeneratePix}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar Novamente
                  </Button>
                </div>
              )}

              {/* Expired state */}
              {state.status === 'expired' && (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                  <p className="font-medium mb-2">PIX Expirado</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    O código expirou. Gere um novo para continuar.
                  </p>
                  <Button onClick={regeneratePix}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Gerar Novo PIX
                  </Button>
                </div>
              )}

              {/* Waiting for payment */}
              {state.status === 'waiting' && (
                <>
                  {/* Timer — updated via ref, zero re-renders */}
                  {state.expiresAt && (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span ref={timerRef} className="text-muted-foreground">
                        Expira em --:--
                      </span>
                    </div>
                  )}

                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="bg-white p-3 sm:p-4 rounded-xl shadow-lg">
                      {state.qrCodeBase64 ? (
                        <img 
                          src={`data:image/png;base64,${state.qrCodeBase64}`} 
                          alt="QR Code PIX" 
                          className="w-40 h-40 sm:w-56 sm:h-56"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : state.qrCode ? (
                        <QRCodeSVG
                          value={state.qrCode}
                          size={160}
                          level="M"
                          includeMargin={false}
                        />
                      ) : (
                        <div className="w-40 h-40 sm:w-56 sm:h-56 bg-muted flex items-center justify-center">
                          <QrCode className="h-16 w-16 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumo do desconto aplicado */}
                  {couponCode && originalPrice > amount && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-2 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground line-through">
                          {formatCurrency(originalPrice)}
                        </span>
                        <span className="text-green-400">Cupom {couponCode}</span>
                      </div>
                      <div className="flex items-center justify-between font-semibold">
                        <span>Total a pagar</span>
                        <span className="text-green-400">{formatCurrency(amount)}</span>
                      </div>
                    </div>
                  )}
                  {state.qrCode && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground text-center">
                        Ou copie o código PIX:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={state.qrCode}
                          className="flex-1 min-w-0 bg-muted rounded-lg px-3 py-2 text-xs font-mono truncate"
                        />
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={handleCopy}
                          className="shrink-0"
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Status indicator */}
                  <div className="flex items-center justify-center gap-2 text-sm bg-amber-500/10 text-amber-500 rounded-lg p-3">
                    <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    Aguardando pagamento...
                  </div>

                  {/* Sandbox: Simulate payment button */}
                  {sandboxMode && state.transactionId && isMasterAdmin && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-dashed border-primary/50 text-primary"
                      disabled={simulatingPayment}
                      onClick={async () => {
                        setSimulatingPayment(true);
                        try {
                          const { error } = await (supabase as any)
                            .from('transactions')
                            .update({ status: 'completed' })
                            .eq('id', state.transactionId);
                          if (error) throw error;
                          toast({
                            title: '🧪 Sandbox: Pagamento simulado',
                            description: 'Status alterado para COMPLETED via simulação.',
                          });
                        } catch (e: any) {
                          toast({
                            title: 'Erro na simulação',
                            description: e.message,
                            variant: 'destructive',
                          });
                        } finally {
                          setSimulatingPayment(false);
                        }
                      }}
                    >
                      <Bug className="h-4 w-4" />
                      {simulatingPayment ? 'Simulando...' : '🧪 Confirmar Pagamento (Sandbox)'}
                    </Button>
                  )}

                  {/* Instructions */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>1. Abra o app do seu banco</p>
                    <p>2. Escolha pagar com PIX</p>
                    <p>3. Escaneie o QR Code ou cole o código</p>
                    <p>4. Confirme o pagamento</p>
                  </div>
                </>
              )}
                </TabsContent>

                {/* Card Tab */}
                <TabsContent value="card" className="mt-4">
                  <CardPaymentForm
                    amount={amount}
                    planType={planType}
                    tierName={tierName}
                    couponCode={couponCode || undefined}
                    ghostMode={hasGhostMode}
                    onSuccess={() => {
                      if (cartId) {
                        markCartRecovered.mutate(cartId);
                      }
                      setShowSuccess(true);
                      triggerCelebration();
                    }}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        </ErrorBoundary>

        {/* Cancel button */}
        <div className="text-center mt-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="text-muted-foreground"
          >
            Cancelar e voltar
          </Button>
        </div>
      </main>
    </div>
  );
}
