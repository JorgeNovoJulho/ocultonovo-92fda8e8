import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Copy, Check, CreditCard, QrCode, Sparkles, ShieldCheck, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import type { PairCard } from '@/hooks/usePerfectPair';
import { useBetaGuard } from '@/hooks/useBetaGuard';

const PRICE = 4.99;

interface Props {
  card: PairCard | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPaid: (card: PairCard) => void;
}

const onlyDigits = (s: string) => s.replace(/\D+/g, '');
const formatCardNumber = (s: string) =>
  onlyDigits(s).slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const formatCpf = (s: string) => {
  const v = onlyDigits(s).slice(0, 11);
  return v
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export function SuperDmPaymentModal({ card, open, onOpenChange, onPaid }: Props) {
  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [loading, setLoading] = useState(false);
  const { isLocked: betaLocked, lockedLabel: betaLockedLabel } = useBetaGuard('monetization');
  const [pix, setPix] = useState<{ payment_id: string; qr_code_base64: string | null; copy_paste: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [card4, setCard4] = useState({ number: '', holder_name: '', expiry_month: '', expiry_year: '', cvv: '', cpf: '' });
  // Dados do pagador (obrigatórios pelo Asaas para gerar o PIX)
  const [payerName, setPayerName] = useState('');
  const [payerCpf, setPayerCpf] = useState('');
  const [savePayerProfile, setSavePayerProfile] = useState(true);
  const [pixError, setPixError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Pré-preenche nome/CPF a partir do perfil do usuário logado
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: prof } = await (supabase as any)
        .from('profiles')
        .select('name, display_name, cpf')
        .or(`user_id.eq.${uid},id.eq.${uid}`)
        .maybeSingle();
      if (cancelled || !prof) return;
      setPayerName((prev) => prev || prof.display_name || prof.name || '');
      if (prof.cpf) setPayerCpf((prev) => prev || formatCpf(String(prof.cpf)));
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPix(null);
      setLoading(false);
      setMethod('pix');
      setCard4({ number: '', holder_name: '', expiry_month: '', expiry_year: '', cvv: '', cpf: '' });
      setPixError(null);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [open]);

  useEffect(() => {
    if (!pix?.payment_id || !card) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase.functions.invoke('create-super-dm-payment', {
        body: { action: 'check', payment_id: pix.payment_id },
      });
      if (data?.status === 'paid') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        toast.success('💎 Super DM enviado!');
        onPaid(card);
        onOpenChange(false);
      }
    }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [pix?.payment_id, card]);

  if (!card) return null;

  const cpfDigits = onlyDigits(payerCpf);
  const cpfTouched = payerCpf.length > 0;
  const cpfValid = cpfDigits.length === 11;
  const cpfError =
    cpfTouched && !cpfValid
      ? cpfDigits.length < 11
        ? `Faltam ${11 - cpfDigits.length} dígitos no CPF.`
        : 'CPF deve ter exatamente 11 dígitos.'
      : null;
  const nameValid = payerName.trim().length >= 2;
  const payerValid = nameValid && cpfValid;

  const persistPayerToProfile = async () => {
    if (!savePayerProfile) return;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      await (supabase as any)
        .from('profiles')
        .update({ name: payerName.trim(), cpf: cpfDigits })
        .or(`user_id.eq.${uid},id.eq.${uid}`);
    } catch {
      // silencioso — não bloqueia o fluxo de pagamento
    }
  };

  const startPix = async () => {
    if (!payerValid) {
      toast.error('Preencha seu nome completo e CPF para gerar o PIX');
      return;
    }
    setPixError(null);
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('create-super-dm-payment', {
      body: {
        action: 'create',
        target_profile_id: card.id,
        payment_method: 'pix',
        payer: { name: payerName.trim(), cpf: cpfDigits },
      },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error || error?.message || 'Não foi possível gerar o QR Code PIX. Verifique seus dados e tente novamente.';
      setPixError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      return;
    }
    setPix(data as any);
    void persistPayerToProfile();
  };

  const payCard = async () => {
    const num = onlyDigits(card4.number);
    const cardCpf = onlyDigits(card4.cpf) || cpfDigits;
    if (num.length < 13 || !card4.holder_name.trim() || !card4.expiry_month || !card4.expiry_year || !card4.cvv) {
      toast.error('Preencha todos os campos do cartão');
      return;
    }
    if (cardCpf.length !== 11) {
      toast.error('Informe o CPF do titular (11 dígitos)');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('create-super-dm-payment', {
      body: {
        action: 'create',
        target_profile_id: card.id,
        payment_method: 'card',
        card: { ...card4, number: num, cpf: cardCpf },
        payer: { name: payerName.trim() || card4.holder_name.trim(), cpf: cardCpf },
      },
    });

    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Cartão recusado');
      return;
    }
    if ((data as any)?.status === 'paid') {
      toast.success('💎 Super DM enviado!');
      onPaid(card);
      onOpenChange(false);
    } else {
      setPix(data as any);
    }
  };

  const copyPix = async () => {
    if (!pix?.copy_paste) return;
    await navigator.clipboard.writeText(pix.copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="scrollbar-hide flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-md flex-col overflow-y-auto overscroll-contain rounded-2xl border-white/10 bg-gradient-to-b from-[#150733] to-[#0b0420] p-0 text-foreground"
      >
        <div className="px-5 pt-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-black">
                <Sparkles className="h-4 w-4" />
              </span>
              Super DM para {card.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Destaque seu interesse com uma notificação exclusiva.{' '}
              <strong className="text-amber-400">R$ {PRICE.toFixed(2).replace('.', ',')}</strong> via PIX ou cartão.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 pb-5 pt-3">
          {betaLocked && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">{betaLockedLabel}</div>
                <div className="text-amber-200/80">
                  Super DM pago volta no lançamento oficial. Durante o Beta, nenhuma cobrança é feita.
                </div>
              </div>
            </div>
          )}
          <Tabs value={method} onValueChange={(v) => setMethod(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/5">
              <TabsTrigger value="pix" className="data-[state=active]:bg-fuchsia-600/30">
                <QrCode className="mr-1 h-4 w-4" /> PIX
              </TabsTrigger>
              <TabsTrigger value="card" className="data-[state=active]:bg-fuchsia-600/30">
                <CreditCard className="mr-1 h-4 w-4" /> Cartão
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pix" className="mt-3 space-y-3">
              {!pix ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="pix-payer-name" className="text-xs">Nome completo do pagador</Label>
                    <Input
                      id="pix-payer-name"
                      autoComplete="name"
                      placeholder="Como aparece no seu documento"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pix-payer-cpf" className="text-xs">CPF do pagador</Label>
                    <Input
                      id="pix-payer-cpf"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      value={payerCpf}
                      onChange={(e) => setPayerCpf(formatCpf(e.target.value))}
                      aria-invalid={!!cpfError}
                      aria-describedby="pix-payer-cpf-help"
                      className={cpfError ? 'border-rose-500/60 focus-visible:ring-rose-500/40' : ''}
                    />
                    {cpfError ? (
                      <p id="pix-payer-cpf-help" className="text-[10px] text-rose-300">
                        {cpfError}
                      </p>
                    ) : (
                      <p id="pix-payer-cpf-help" className="text-[10px] text-muted-foreground">
                        Obrigatório pelo Banco Central para gerar o QR Code PIX.
                      </p>
                    )}
                  </div>

                  <label className="flex items-start gap-2 rounded-md bg-white/[0.03] px-2 py-1.5 text-[11px] text-foreground/80 cursor-pointer">
                    <Checkbox
                      checked={savePayerProfile}
                      onCheckedChange={(v) => setSavePayerProfile(v === true)}
                      className="mt-[2px]"
                      aria-label="Salvar nome e CPF para próximas cobranças"
                    />
                    <span>
                      Salvar nome e CPF no meu perfil para próximas cobranças.
                      <span className="block text-[10px] text-muted-foreground">
                        Você pode remover a qualquer momento nas configurações.
                      </span>
                    </span>
                  </label>

                  {pixError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-200"
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">Não foi possível gerar o PIX</div>
                        <div className="break-words text-rose-200/90">{pixError}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setPixError(null); void startPix(); }}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[10.5px] font-semibold text-rose-100 hover:bg-rose-500/30"
                      >
                        <RefreshCw className="h-3 w-3" /> Tentar novamente
                      </button>
                    </div>
                  )}

                  <Button
                    className="h-11 w-full bg-gradient-to-br from-fuchsia-600 to-pink-600 font-semibold disabled:opacity-60"
                    disabled={loading || !payerValid || betaLocked}
                    onClick={startPix}
                    aria-label={`Gerar PIX de R$ ${PRICE.toFixed(2).replace('.', ',')}`}
                  >
                    {betaLocked ? (
                      <><Lock className="mr-2 h-4 w-4" /> {betaLockedLabel}</>
                    ) : loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Gerar PIX de R$ ${PRICE.toFixed(2).replace('.', ',')}`
                    )}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  {pix.qr_code_base64 && (
                    <div className="flex justify-center">
                      <img
                        loading="lazy"
                        decoding="async"
                        src={`data:image/png;base64,${pix.qr_code_base64}`}
                        alt="QR PIX"
                        className="h-48 w-48 rounded-lg bg-white p-2"
                      />
                    </div>
                  )}
                  {pix.copy_paste && (
                    <Button variant="outline" className="h-11 w-full" onClick={copyPix}>
                      {copied ? <Check className="mr-1 h-4 w-4 text-green-500" /> : <Copy className="mr-1 h-4 w-4" />}
                      {copied ? 'Copiado!' : 'Copiar código PIX'}
                    </Button>
                  )}
                  <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Aguardando pagamento…
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="card" className="mt-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome impresso no cartão</Label>
                <Input
                  autoComplete="cc-name"
                  placeholder="Ex.: MARIA SILVA"
                  value={card4.holder_name}
                  onChange={(e) => setCard4({ ...card4, holder_name: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Número do cartão</Label>
                <Input
                  autoComplete="cc-number"
                  inputMode="numeric"
                  placeholder="0000 0000 0000 0000"
                  value={card4.number}
                  onChange={(e) => setCard4({ ...card4, number: formatCardNumber(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Mês</Label>
                  <Input
                    autoComplete="cc-exp-month"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="MM"
                    value={card4.expiry_month}
                    onChange={(e) => setCard4({ ...card4, expiry_month: onlyDigits(e.target.value).slice(0, 2) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ano</Label>
                  <Input
                    autoComplete="cc-exp-year"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="AAAA"
                    value={card4.expiry_year}
                    onChange={(e) => setCard4({ ...card4, expiry_year: onlyDigits(e.target.value).slice(0, 4) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CVV</Label>
                  <Input
                    autoComplete="cc-csc"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="123"
                    value={card4.cvv}
                    onChange={(e) => setCard4({ ...card4, cvv: onlyDigits(e.target.value).slice(0, 4) })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CPF do titular</Label>
                <Input
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={card4.cpf}
                  onChange={(e) => setCard4({ ...card4, cpf: formatCpf(e.target.value) })}
                />
              </div>
              <Button
                className="mt-1 h-11 w-full bg-gradient-to-br from-fuchsia-600 to-pink-600 font-semibold"
                disabled={loading || betaLocked}
                onClick={payCard}
              >
                {betaLocked ? (
                  <><Lock className="mr-2 h-4 w-4" /> {betaLockedLabel}</>
                ) : loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Pagar R$ ${PRICE.toFixed(2).replace('.', ',')}`
                )}
              </Button>
              <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                Pagamento processado com criptografia ponta-a-ponta.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
