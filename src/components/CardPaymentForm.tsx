import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Lock, AlertCircle, Calendar, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface CardPaymentFormProps {
  amount: number;
  planType: string;
  tierName?: string;
  couponCode?: string;
  ghostMode?: boolean;
  onSuccess?: () => void;
}

// Preços dos planos
const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  Premium: { monthly: 25.90, annual: 249.90 },
  VIP: { monthly: 145.90, annual: 1399.90 },
};

function detectCardBrand(number: string): string {
  const cleaned = number.replace(/\D/g, '');
  if (/^4/.test(cleaned)) return 'visa';
  if (/^5[1-5]/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  if (/^6(?:011|5)/.test(cleaned)) return 'discover';
  if (/^(?:2131|1800|35)/.test(cleaned)) return 'jcb';
  if (/^3(?:0[0-5]|[68])/.test(cleaned)) return 'diners';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(cleaned)) return 'elo';
  return 'unknown';
}

function formatCardNumber(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  const groups = cleaned.match(/.{1,4}/g) || [];
  return groups.join(' ').substr(0, 19);
}

function formatExpiry(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length >= 2) {
    return cleaned.substr(0, 2) + '/' + cleaned.substr(2, 2);
  }
  return cleaned;
}

const brandLogos: Record<string, string> = {
  visa: '💳 Visa',
  mastercard: '💳 Mastercard',
  amex: '💳 Amex',
  elo: '💳 Elo',
  discover: '💳 Discover',
  unknown: '💳',
};

export default function CardPaymentForm({ 
  amount: initialAmount, 
  planType: initialPlanType, 
  tierName = 'Premium',
  couponCode, 
  ghostMode,
  onSuccess 
}: CardPaymentFormProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Billing cycle state — default to what was passed via URL
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    initialPlanType === 'annual' ? 'annual' : 'monthly'
  );

  // Derive final amount from billing cycle if we have plan prices
  const planPrices = PLAN_PRICES[tierName];
  const amount = planPrices
    ? billingCycle === 'annual' ? planPrices.annual : planPrices.monthly
    : initialAmount;
  const planType = billingCycle;

  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentLockRef = useRef(false);

  const cardBrand = detectCardBrand(cardNumber);
  
  const isFormValid = 
    cardNumber.replace(/\D/g, '').length >= 13 &&
    cardName.length >= 3 &&
    expiry.length === 5 &&
    cvv.length >= 3;

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !user) return;
    if (paymentLockRef.current) return;
    paymentLockRef.current = true;

    setIsProcessing(true);
    setError(null);

    try {
      // Busca dados do perfil para a ASAAS (nome, cpf_cnpj). Email vem do auth.
      const { data: prof } = await supabase
        .from('profiles')
        .select('name, cpf_cnpj')
        .eq('user_id', user.id)
        .maybeSingle();

      const payerName = (prof?.name || cardName || user.email || 'Cliente').toString();
      const payerCpfCnpj = (prof?.cpf_cnpj || '').replace(/\D/g, '');
      if (!payerCpfCnpj || payerCpfCnpj.length < 11) {
        throw new Error('Cadastre seu CPF/CNPJ no perfil antes de pagar com cartão.');
      }
      if (!user.email) throw new Error('E-mail do usuário não disponível.');

      const cycleLabel = billingCycle === 'annual' ? 'Anual' : 'Mensal';
      const description = `Plano ${tierName} - ${cycleLabel}`;

      const { data, error: fnError } = await supabase.functions.invoke('asaas-card-checkout', {
        body: {
          amount,
          description,
          type: 'subscription',
          payerEmail: user.email,
          payerName,
          payerCpfCnpj,
          card: {
            holderName: cardName,
            number: cardNumber.replace(/\D/g, ''),
            expiryMonth: expiry.split('/')[0],
            expiryYear: '20' + expiry.split('/')[1],
            ccv: cvv,
          },
          metadata: {
            plan_type: tierName.toLowerCase(),
            billing_cycle: billingCycle,
            coupon_code: couponCode || null,
            ghost_mode: !!ghostMode,
          },
        },
      });

      if (fnError) throw fnError;

      if (data?.success) {
        toast({
          title: '✅ Pagamento aprovado!',
          description: 'Sua assinatura foi ativada com sucesso.',
        });
        onSuccess?.();
        setTimeout(() => navigate('/'), 2000);
      } else {
        throw new Error(data?.error || 'Pagamento não aprovado');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Erro ao processar pagamento');
      toast({
        title: 'Erro no pagamento',
        description: err.message || 'Não foi possível processar seu pagamento.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      paymentLockRef.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Billing Cycle Selector */}
      <div className="space-y-2">
        <Label>Período de cobrança</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={cn(
              "flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left",
              billingCycle === 'monthly'
                ? "border-primary bg-primary/10"
                : "border-border/40 bg-muted/20 hover:border-border"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <CreditCard className={cn("h-3.5 w-3.5", billingCycle === 'monthly' ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-sm font-semibold", billingCycle === 'monthly' ? "text-primary" : "text-foreground")}>
                Mensal
              </span>
            </div>
            <span className="text-xs font-bold text-foreground">
              {planPrices ? formatCurrency(planPrices.monthly) : formatCurrency(initialAmount)}
            </span>
            <span className="text-[10px] text-muted-foreground">/mês</span>
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={cn(
              "flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left relative",
              billingCycle === 'annual'
                ? "border-primary bg-primary/10"
                : "border-border/40 bg-muted/20 hover:border-border"
            )}
          >
            <Badge className="absolute -top-2 right-2 text-[9px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">
              Economize
            </Badge>
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className={cn("h-3.5 w-3.5", billingCycle === 'annual' ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-sm font-semibold", billingCycle === 'annual' ? "text-primary" : "text-foreground")}>
                Anual
              </span>
            </div>
            <span className="text-xs font-bold text-foreground">
              {planPrices ? formatCurrency(planPrices.annual) : formatCurrency(initialAmount * 12)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {planPrices ? `≈ ${formatCurrency(planPrices.annual / 12)}/mês` : '/ano'}
            </span>
          </button>
        </div>
      </div>

      {/* Card Fields */}
      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          {/* Número do Cartão */}
          <div className="space-y-2">
            <Label htmlFor="cardNumber">Número do Cartão</Label>
            <div className="relative">
              <Input
                id="cardNumber"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                maxLength={19}
                className="pr-16"
                disabled={isProcessing}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                {brandLogos[cardBrand]}
              </span>
            </div>
          </div>

          {/* Nome no Cartão */}
          <div className="space-y-2">
            <Label htmlFor="cardName">Nome no Cartão</Label>
            <Input
              id="cardName"
              placeholder="NOME COMO ESTÁ NO CARTÃO"
              value={cardName}
              onChange={(e) => setCardName(e.target.value.toUpperCase())}
              disabled={isProcessing}
            />
          </div>

          {/* Validade e CVV */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiry">Validade</Label>
              <Input
                id="expiry"
                placeholder="MM/AA"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                maxLength={5}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cvv">CVV</Label>
              <Input
                id="cvv"
                placeholder="123"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substr(0, 4))}
                maxLength={4}
                type="password"
                disabled={isProcessing}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        Pagamento 100% seguro com criptografia SSL
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90"
        size="lg"
        disabled={!isFormValid || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Pagar {formatCurrency(amount)}
            {billingCycle === 'annual' ? '/ano' : '/mês'}
          </>
        )}
      </Button>

      {/* Accepted Cards */}
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span>Aceitamos:</span>
        <span>Visa</span>
        <span>•</span>
        <span>Mastercard</span>
        <span>•</span>
        <span>Elo</span>
        <span>•</span>
        <span>Amex</span>
      </div>
    </form>
  );
}
