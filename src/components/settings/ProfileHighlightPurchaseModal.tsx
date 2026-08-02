import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const MASTER_EMAIL = 'ocultomaster@ocultoswing.com.br';
import { Crown, CreditCard, Copy, Loader2, QrCode, ShieldCheck, Sparkles, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useProfile } from '@/hooks/useProfile';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';
import {
  useActivateHighlight,
  useCreateProfileHighlightCardPayment,
  useMyProfileHighlight,
  useProfileHighlightBillingInfo,
  useProfileHighlightPrice,
  useSaveProfileHighlightBillingInfo,
} from '@/hooks/useProfileHighlight';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function maskCpfCnpj(v: string) {
  const digits = onlyDigits(v);
  if (digits.length <= 11) {
    return digits
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digits
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskPhone(v: string) {
  const digits = onlyDigits(v).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export function ProfileHighlightPurchaseModal({ open, onOpenChange }: Props) {
  const price = useProfileHighlightPrice();
  const { user } = useAuth();
  const isMasterAdmin = (user?.email || '').trim().toLowerCase() === MASTER_EMAIL;
  const { isBeta } = usePlatformPhase();
  // Durante o Beta, NENHUMA cobrança real acontece: PIX e cartão são
  // substituídos por uma ativação simulada (sem chamadas Asaas / sem valor).
  // Quando o Beta encerra, o fluxo real volta automaticamente.
  const useFakePayments = isBeta;
  const { profile } = useProfile();
  const activate = useActivateHighlight();
  const billing = useProfileHighlightBillingInfo();
  const saveBilling = useSaveProfileHighlightBillingInfo();
  const cardPayment = useCreateProfileHighlightCardPayment();
  const { data: currentHighlight } = useMyProfileHighlight();

  const [mockState, setMockState] = useState<{ status: 'idle' | 'loading' | 'error'; error?: string }>({ status: 'idle' });
  const [remaining, setRemaining] = useState('');

  // Countdown ao vivo
  useEffect(() => {
    if (!currentHighlight?.expires_at) {
      setRemaining('');
      return;
    }
    const tick = () => {
      const ms = new Date(currentHighlight.expires_at).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('Expirado');
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setRemaining(`${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [currentHighlight?.expires_at]);

  const handleMockActivate = async () => {
    setMockState({ status: 'loading' });
    try {
      // Simula pequeno atraso de "gateway"
      await new Promise((r) => setTimeout(r, 900));
      await activate.mutateAsync(`mock-${Date.now()}`);
      setMockState({ status: 'idle' });
      onOpenChange(false);
    } catch (error: any) {
      setMockState({
        status: 'error',
        error: getFriendlyError(error, 'Falha ao confirmar pagamento simulado.'),
      });
    }
  };

  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [pixState, setPixState] = useState<{
    status: 'idle' | 'loading' | 'waiting' | 'confirming';
    qrCode: string;
    qrCodeBase64: string;
    txId: string;
    externalId: string;
  }>({ status: 'idle', qrCode: '', qrCodeBase64: '', txId: '', externalId: '' });

  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;

  const getFriendlyError = (error: unknown, fallback: string) => {
    const message = String((error as any)?.message || error || '').toLowerCase();

    if (message.includes('oculto_profile_highlights')) {
      return 'A estrutura do destaque ainda não foi criada no banco externo.';
    }

    if (message.includes('phone_number')) {
      return 'A coluna de telefone ainda não existe no cadastro do banco externo.';
    }

    if (message.includes('cpf_cnpj')) {
      return 'A coluna de CPF/CNPJ ainda não existe no cadastro do banco externo.';
    }

    return fallback;
  };

  useEffect(() => {
    if (!open) return;
    setCpfCnpj(maskCpfCnpj(billing.data?.cpfCnpj || ''));
    setPhone(maskPhone(billing.data?.phoneNumber || ''));
    setCardName(billing.data?.payerName?.toUpperCase() || '');
  }, [open, billing.data?.cpfCnpj, billing.data?.phoneNumber, billing.data?.payerName]);

  useEffect(() => {
    if (!pixState.txId || !open) return;

    const unsub = subscribeTable('transactions', async (payload: any) => {
      if (payload?.eventType !== 'UPDATE') return;
      const row = payload?.new as any;
      if (!row || row.id !== pixState.txId) return;
      const status = row?.status;
      if (status !== 'completed') return;
      try {
        setPixState((prev) => ({ ...prev, status: 'confirming' }));
        await activate.mutateAsync(pixState.externalId);
        onOpenChange(false);
      } catch (error: any) {
        toast.error('Pagamento confirmado, mas a ativação falhou', {
          description: error?.message || 'Tente abrir o modal novamente.',
        });
      }
    }, { events: ['UPDATE'] });

    return () => { unsub(); };
  }, [activate, onOpenChange, open, pixState.externalId, pixState.txId]);


  const isBusy = activate.isPending || saveBilling.isPending || cardPayment.isPending || pixState.status === 'loading';

  const canSubmit = useMemo(() => {
    const cpfOk = onlyDigits(cpfCnpj).length >= 11;
    const phoneOk = onlyDigits(phone).length >= 10;
    if (!cpfOk || !phoneOk) return false;
    if (method === 'pix') return true;
    return onlyDigits(cardNumber).length >= 13 && cardName.trim().length >= 3 && expiry.length === 5 && cvv.length >= 3;
  }, [cpfCnpj, phone, method, cardNumber, cardName, expiry, cvv]);

  const persistBilling = async () => {
    await saveBilling.mutateAsync({
      cpfCnpj: onlyDigits(cpfCnpj),
      phoneNumber: onlyDigits(phone),
    });
  };

  const handleGeneratePix = async () => {
    if (!profile?.id || !billing.data?.payerEmail) {
      toast.error('Complete seus dados antes de continuar.');
      return;
    }

    try {
      await persistBilling();
      setPixState({ status: 'loading', qrCode: '', qrCodeBase64: '', txId: '', externalId: '' });

      const { data: tx, error: txError } = await (supabase as any)
        .from('transactions')
        .insert({
          user_id: profile.id,
          amount: price,
          type: 'profile_highlight',
          status: 'pending',
          description: 'Destaque dourado do perfil por 24 horas',
          metadata: { feature_type: 'profile_highlight', duration_hours: 24 },
        })
        .select('id')
        .single();

      if (txError) throw txError;

      const { data, error } = await supabase.functions.invoke('pix-gateway', {
        body: {
          action: 'generate',
          amount: price,
          description: 'Destaque dourado do perfil por 24 horas',
          transaction_id: tx.id,
          payer_email: billing.data.payerEmail,
          payer_name: billing.data.payerName,
          payer_user_id: profile.user_id,
          payer_cpf_cnpj: onlyDigits(cpfCnpj),
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Não foi possível gerar o PIX.');

      await (supabase as any)
        .from('transactions')
        .update({ external_id: data.transaction_id, provider: data.provider || 'asaas' })
        .eq('id', tx.id);

      setPixState({
        status: 'waiting',
        qrCode: data.qr_code || '',
        qrCodeBase64: data.qr_code_base64 || '',
        txId: tx.id,
        externalId: data.transaction_id || '',
      });
    } catch (error: any) {
      setPixState({ status: 'idle', qrCode: '', qrCodeBase64: '', txId: '', externalId: '' });
      toast.error('Erro ao gerar PIX', {
        description: getFriendlyError(error, 'Tente novamente.'),
      });
    }
  };

  const handleCardPayment = async () => {
    if (!billing.data?.payerEmail) {
      toast.error('Seu e-mail não foi encontrado.');
      return;
    }

    try {
      await persistBilling();

      const [expMonth, expYear] = expiry.split('/');
      const payment = await cardPayment.mutateAsync({
        amount: price,
        description: 'Destaque dourado do perfil por 24 horas',
        payerEmail: billing.data.payerEmail,
        payerName: billing.data.payerName,
        payerCpfCnpj: onlyDigits(cpfCnpj),
        payerPhone: onlyDigits(phone),
        card: {
          holderName: cardName,
          number: onlyDigits(cardNumber),
          expiryMonth: expMonth,
          expiryYear: `20${expYear}`,
          ccv: onlyDigits(cvv),
        },
      });

      await activate.mutateAsync(payment.payment_id);
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao processar cartão', {
        description: getFriendlyError(error, 'Tente novamente.'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-0.75rem)] max-w-[min(42rem,100vw-0.75rem)] max-h-[92dvh] overflow-y-auto overflow-x-hidden scrollbar-hide border-border/60 bg-background p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Crown className="h-5 w-5 text-primary" />
            Destacar meu perfil
          </DialogTitle>
          <DialogDescription>
            Ative o destaque dourado por 24 horas com PIX instantâneo ou cartão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-x-hidden">
          {/* Banner de status atual */}
          {currentHighlight ? (
            <div className="rounded-lg border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-500/20 p-2">
                  <Crown className="h-5 w-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-amber-400">Destaque ATIVO</p>
                    <Badge className="bg-amber-500 text-black hover:bg-amber-500">Ao vivo</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Expira em <span className="font-mono font-semibold text-amber-400">{remaining || '—'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Seu perfil está em destaque com moldura dourada nas sugestões. Após expirar, voltará automaticamente ao modo normal.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-foreground flex items-center gap-2">
                    Destaque Dourado · 24 horas
                    <Badge variant="outline" className="text-[10px]">Inativo</Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">Moldura premium nas sugestões do feed.</p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {useFakePayments ? 'Grátis no Beta' : formatBRL(price)}
                </Badge>
              </div>
            </div>
          )}

          {/* Ativação simulada — Beta (todos os usuários) ou admin master */}
          {!currentHighlight && (useFakePayments || isMasterAdmin) && (
            <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-400/90">
                <Zap className="h-3.5 w-3.5" />
                <span className="font-semibold">
                  {useFakePayments ? 'Modo Beta — pagamento simulado' : 'Modo demonstração'}
                </span>
                <span className="text-muted-foreground">— sem cobrança real</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {useFakePayments
                  ? 'Durante o período de testes, o Destaque Dourado é ativado gratuitamente. Nenhum PIX ou cartão é cobrado e nenhuma chamada ao gateway de pagamento é feita. Ao final do Beta, a cobrança real volta automaticamente.'
                  : 'Atalho de admin: ative agora sem pagamento real.'}
              </p>
              {mockState.status === 'error' && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{mockState.error}</span>
                </div>
              )}
              <Button
                onClick={handleMockActivate}
                disabled={mockState.status === 'loading' || activate.isPending}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold"
                size="sm"
              >
                {mockState.status === 'loading' || activate.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ativando destaque...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {useFakePayments ? 'Ativar destaque grátis (Beta)' : 'Confirmar pagamento (mock) e ativar'}
                  </>
                )}
              </Button>
            </div>
          )}

          {!useFakePayments && (<>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input value={cpfCnpj} onChange={(e) => setCpfCnpj(maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
            </div>
          </div>

          <Tabs value={method} onValueChange={(value) => setMethod(value as 'pix' | 'card')}>
            <TabsList className="grid h-auto min-h-12 w-full grid-cols-2">
              <TabsTrigger value="pix" className="gap-2 px-2 py-2 text-sm"><QrCode className="h-4 w-4 shrink-0" />PIX</TabsTrigger>
              <TabsTrigger value="card" className="gap-2 px-2 py-2 text-sm"><CreditCard className="h-4 w-4 shrink-0" />Cartão</TabsTrigger>
            </TabsList>

            <TabsContent value="pix" className="space-y-4 pt-3">
              {pixState.status === 'waiting' || pixState.status === 'confirming' ? (
                <div className="space-y-4 rounded-lg border border-border/50 bg-muted/20 p-4">
                  <div className="flex justify-center">
                    {pixState.qrCodeBase64 ? (
                      <img loading="lazy" decoding="async" src={`data:image/png;base64,${pixState.qrCodeBase64}`} alt="QR Code PIX do destaque dourado" className="h-auto w-full max-w-[192px] rounded-lg border border-border bg-white p-3 sm:max-w-[224px]" />
                    ) : (
                      <QRCodeSVG value={pixState.qrCode} size={isMobile ? 168 : 192} includeMargin />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Código copia e cola</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input readOnly value={pixState.qrCode} className="font-mono text-xs" />
                      <Button type="button" variant="outline" className="w-full shrink-0 sm:w-auto" onClick={() => navigator.clipboard.writeText(pixState.qrCode)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className={`h-4 w-4 ${pixState.status === 'confirming' ? 'animate-spin' : ''}`} />
                    {pixState.status === 'confirming' ? 'Pagamento detectado, ativando destaque...' : 'Aguardando confirmação do pagamento.'}
                  </div>
                </div>
              ) : (
                <Button onClick={handleGeneratePix} disabled={!canSubmit || isBusy} className="w-full">
                  {pixState.status === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                  Gerar QR Code PIX
                </Button>
              )}
            </TabsContent>

            <TabsContent value="card" className="space-y-4 pt-3">
              <div className="space-y-2">
                <Label>Nome no cartão</Label>
                <Input value={cardName} onChange={(e) => setCardName(e.target.value.toUpperCase())} placeholder="NOME COMO NO CARTÃO" />
              </div>
              <div className="space-y-2">
                <Label>Número do cartão</Label>
                <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value.replace(/[^\d ]/g, '').replace(/(.{4})/g, '$1 ').trim())} placeholder="0000 0000 0000 0000" maxLength={19} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Validade</Label>
                  <Input value={expiry} onChange={(e) => setExpiry(e.target.value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5))} placeholder="MM/AA" maxLength={5} />
                </div>
                <div className="space-y-2">
                  <Label>CVV</Label>
                  <Input value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" maxLength={4} />
                </div>
              </div>
              <Button onClick={handleCardPayment} disabled={!canSubmit || isBusy} className="w-full">
                {cardPayment.isPending || activate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Pagar com cartão
              </Button>
            </TabsContent>
          </Tabs>
          </>)}

          <Separator />

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
            <span>Pagamento protegido com validação do gateway e ativação automática do destaque após confirmação.</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            O destaque começa assim que o pagamento for confirmado.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}