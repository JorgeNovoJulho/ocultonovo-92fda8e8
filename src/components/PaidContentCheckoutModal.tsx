import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { QrCode, CreditCard, Copy, CheckCircle2, Loader2, Lock, UserCheck, ShieldCheck, AlertTriangle, Clock } from 'lucide-react';
import { useCreatePaidContentCheckout, usePaidContentStatusCheck } from '@/hooks/usePaidContentCheckout';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { paidCheckoutStore, formatAttemptDate, attemptStatusLabel } from '@/lib/paidContentCheckoutStorage';
import { usePaidCheckoutState } from '@/hooks/usePaidCheckoutState';
import { useLastPixCodeStore } from '@/store/useLastPixCodeStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import CouponInput from '@/components/checkout/CouponInput';
import type { AppliedCoupon } from '@/hooks/useCouponApplier';
import type { CouponTarget } from '@/lib/coupons';
import { useBetaGuard } from '@/hooks/useBetaGuard';
import { useCreateBetaGrant } from '@/hooks/useBetaGrants';
import { Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId: string;
  price: number;
  sellerName?: string;
  /** Necessário para validar cupons do criador. */
  sellerId?: string | null;
  /** Tipo de conteúdo para validar applies_to do cupom. */
  couponTarget?: CouponTarget;
  /** Pré-preenche o campo de cupom (ex.: vindo da URL ?coupon=XYZ). */
  initialCouponCode?: string;
  affiliateIdFromLink?: string | null;
  affiliateUsernameFromLink?: string | null;
  /** Método inicial selecionado. Default 'pix'. */
  defaultMethod?: 'pix' | 'card';
  /** Se true, oculta as tabs e força o método escolhido. */
  lockMethod?: boolean;
}

export function PaidContentCheckoutModal({
  open, onOpenChange, postId, price, sellerName,
  sellerId, couponTarget = 'long_video', initialCouponCode,
  affiliateIdFromLink, affiliateUsernameFromLink,
  defaultMethod = 'pix', lockMethod = false,
}: Props) {
  const [tab, setTab] = useState<'pix' | 'card'>(defaultMethod);
  const [affiliateInput, setAffiliateInput] = useState('');
  const [card, setCard] = useState({ holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '' });
  const [pix, setPix] = useState<{ code: string; b64?: string | null; txId: string; paymentId: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [pollSecs, setPollSecs] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponValidating, setCouponValidating] = useState(false);
  const checkout = useCreatePaidContentCheckout();
  const checkStatus = usePaidContentStatusCheck();
  const queryClient = useQueryClient();
  const { history, latest } = usePaidCheckoutState(postId);
  const { isLocked: betaLocked, lockedLabel: betaLockedLabel } = useBetaGuard('paid_content');
  const betaGrant = useCreateBetaGrant();

  const effectivePrice = appliedCoupon?.final_price ?? price;
  const formatted = effectivePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hasLinkAffiliate = !!affiliateIdFromLink;

  const registerCopiedPix = useLastPixCodeStore((s) => s.registerCopiedCode);

  // Restaura tentativa pendente persistida ao abrir o modal (sobrevive a reload).
  // Prioridade: PIX pendente > confirmação prévia > defaultMethod.
  useEffect(() => {
    if (!open) {
      setPix(null); setConfirmed(false); setAffiliateInput(''); setTab(defaultMethod);
      setAppliedCoupon(null);
      setPixCopied(false); setFailed(null); setPollSecs(0); setAttemptId(null);
      return;
    }
    if (latest?.status === 'pending' && latest.method === 'pix' && latest.pixCode && latest.txId && latest.paymentId) {
      // Sempre força a aba PIX e restaura QR/código já gerados
      setTab('pix');
      setPix({ code: latest.pixCode, b64: latest.pixB64 ?? null, txId: latest.txId, paymentId: latest.paymentId });
      setAttemptId(latest.id);
      const elapsed = Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 1000);
      setPollSecs(Math.min(elapsed, 600));
    } else if (latest?.status === 'confirmed') {
      setTab(defaultMethod);
      setConfirmed(true);
    } else {
      setTab(defaultMethod);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyPix = async () => {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.code);
      setPixCopied(true);
      // Registra último código PIX copiado para o usuário (auditoria local)
      registerCopiedPix({ code: pix.code, postId, amount: price });
      toast({
        title: '✅ PIX copiado!',
        description: 'Cole no app do seu banco para pagar. Liberação automática após confirmação.',
      });
      setTimeout(() => setPixCopied(false), 2200);
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' as any });
    }
  };

  // Polling status (PIX) — 3s, expira em 10min
  useEffect(() => {
    if (!pix || confirmed || failed) return;
    const startTs = latest && latest.id === attemptId ? new Date(latest.createdAt).getTime() : Date.now();

    const verify = async () => {
      const elapsed = Math.floor((Date.now() - startTs) / 1000);
      setPollSecs(elapsed);
      if (elapsed > 600) {
        const msg = 'Tempo esgotado. O PIX expirou — gere um novo para tentar de novo.';
        setFailed(msg);
        if (attemptId) paidCheckoutStore.update(postId, attemptId, { status: 'expired', reason: msg });
        return true; // stop
      }
      try {
        const r = await checkStatus(pix.txId, postId);
        if (r.confirmed) {
          setConfirmed(true);
          if (attemptId) paidCheckoutStore.update(postId, attemptId, { status: 'confirmed' });
          toast({ title: '✅ Conteúdo liberado!', description: 'Pagamento confirmado.' });
          queryClient.invalidateQueries({ queryKey: ['media-access'] });
          return true; // stop
        }
      } catch { /* ignora erro pontual de polling */ }
      return false;
    };

    const id = setInterval(async () => {
      const stop = await verify();
      if (stop) clearInterval(id);
    }, 3000);

    // Revalida ao voltar do app do banco (PIX behavior crítico)
    const onVisible = () => {
      if (document.visibilityState === 'visible') verify();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pix, confirmed, failed, postId, checkStatus, queryClient, attemptId, latest]);

  const submit = async () => {
    setFailed(null);
    try {
      const result = await checkout.mutateAsync({
        postId,
        paymentMethod: tab,
        affiliateUsername: hasLinkAffiliate ? null : (affiliateInput.trim() || null),
        affiliateIdFromLink: affiliateIdFromLink ?? null,
        card: tab === 'card' ? card : undefined,
      });
      if (result.already_purchased) {
        toast({ title: 'Você já possui acesso a este conteúdo' });
        onOpenChange(false);
        return;
      }
      if (tab === 'pix' && result.qr_code) {
        const att = paidCheckoutStore.start({
          postId, method: 'pix', amount: price,
          pixCode: result.qr_code, pixB64: result.qr_code_base64 ?? null,
          txId: result.transaction_id!, paymentId: result.payment_id!,
        });
        setAttemptId(att.id);
        setPix({ code: result.qr_code, b64: result.qr_code_base64 ?? null, txId: result.transaction_id!, paymentId: result.payment_id! });
      } else if (tab === 'card') {
        const att = paidCheckoutStore.start({ postId, method: 'card', amount: price });
        setAttemptId(att.id);
        if (result.status && ['CONFIRMED', 'RECEIVED'].includes(result.status)) {
          setConfirmed(true);
          paidCheckoutStore.update(postId, att.id, { status: 'confirmed' });
          toast({ title: '✅ Pagamento aprovado!', description: 'Conteúdo liberado.' });
          queryClient.invalidateQueries({ queryKey: ['media-access'] });
        } else {
          const reason = 'Pagamento recusado pela operadora. Verifique os dados do cartão.';
          paidCheckoutStore.update(postId, att.id, { status: 'failed', reason });
          setFailed(reason);
        }
      } else {
        setFailed('Não foi possível iniciar o pagamento. Tente novamente.');
      }
    } catch (e: any) {
      const reason = e?.message || 'Falha inesperada ao processar o pagamento.';
      if (attemptId) paidCheckoutStore.update(postId, attemptId, { status: 'failed', reason });
      setFailed(reason);
    }
  };

  const retry = () => {
    setPix(null); setFailed(null); setPollSecs(0); setAttemptId(null);
  };

  const affiliateBadge = useMemo(() => {
    if (hasLinkAffiliate) return `Indicado por @${affiliateUsernameFromLink ?? 'afiliado'}`;
    if (affiliateInput.trim()) return `Indicador manual: @${affiliateInput.trim().replace(/^@/, '')}`;
    return 'Sem indicador';
  }, [hasLinkAffiliate, affiliateUsernameFromLink, affiliateInput]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[hsl(45,93%,47%)]" /> Desbloquear conteúdo VIP
          </DialogTitle>
          <DialogDescription>
            {sellerName ? <>por <strong>{sellerName}</strong></> : 'Conteúdo exclusivo'} · Liberação automática após confirmação.
          </DialogDescription>
        </DialogHeader>

        {/* Banner de status persistente */}
        <div
          className={[
            'rounded-lg border px-3 py-2 text-xs flex items-center gap-2',
            confirmed
              ? 'border-green-500/40 bg-green-500/10 text-green-500'
              : failed
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : pix
              ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500'
              : 'border-border/60 bg-muted/30 text-muted-foreground',
          ].join(' ')}
        >
          {confirmed ? (
            <><CheckCircle2 className="h-4 w-4" /> Pagamento confirmado · conteúdo liberado</>
          ) : failed ? (
            <><AlertTriangle className="h-4 w-4" /> {failed}</>
          ) : pix ? (
            <><Clock className="h-4 w-4 animate-pulse" /> Pendente · aguardando PIX ({Math.max(0, 600 - pollSecs)}s)</>
          ) : (
            <><Lock className="h-3.5 w-3.5" /> Conteúdo bloqueado até a confirmação do pagamento</>
          )}
        </div>

        {confirmed ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-semibold">Acesso liberado!</p>
            <p className="text-xs text-muted-foreground">Você já pode ver o conteúdo. Próxima permissão: continuar explorando outros conteúdos VIP do criador.</p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Ver conteúdo</Button>
          </div>
        ) : failed ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p className="font-semibold">Pagamento não concluído</p>
            <p className="text-xs text-muted-foreground">{failed}</p>
            <p className="text-[11px] text-muted-foreground">O conteúdo permanece bloqueado até a confirmação.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button className="flex-1" onClick={retry}>
                Tentar de novo
              </Button>
            </div>
          </div>
        ) : pix ? (
          <div className="space-y-3 text-center">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-[hsl(45,93%,47%)]">{formatted}</p>
            </div>
            {pix.b64 ? (
              <img loading="lazy" decoding="async" src={`data:image/png;base64,${pix.b64}`} alt="PIX QR Code" className="w-48 h-48 mx-auto rounded-lg border" />
            ) : (
              <div className="w-48 h-48 mx-auto rounded-lg border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center gap-2 p-3">
                <QrCode className="h-16 w-16 text-muted-foreground/60" />
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  QR Code simulado<br />Use o código copiável abaixo
                </p>
              </div>
            )}
            <div className="text-left space-y-1">
              <Label className="text-[11px] text-muted-foreground">Pix copia-e-cola</Label>
              <code className="block text-[10px] bg-muted/40 p-2 rounded break-all max-h-24 overflow-y-auto font-mono">
                {pix.code}
              </code>
            </div>
            <Button
              variant={pixCopied ? 'default' : 'outline'}
              className={`w-full gap-2 transition-colors ${pixCopied ? 'bg-green-500 hover:bg-green-500/90 text-white border-green-500' : ''}`}
              onClick={copyPix}
            >
              {pixCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {pixCopied ? 'Copiado!' : 'Copiar código PIX'}
            </Button>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Aguardando confirmação do pagamento…
            </p>
            <p className="text-[10px] text-muted-foreground">
              <Lock className="h-3 w-3 inline mr-1" /> Conteúdo permanece bloqueado até a confirmação.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              {couponValidating ? (
                <div className="space-y-2 animate-pulse" aria-busy="true">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-20 rounded bg-muted/60" />
                    <div className="h-5 w-24 rounded bg-muted/60" />
                  </div>
                  <div className="h-2.5 w-2/3 rounded bg-muted/40" />
                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    <div className="h-3 w-12 rounded bg-muted/60" />
                    <div className="h-5 w-28 rounded bg-muted/60" />
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Validando cupom…
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Subtotal</span>
                    <span className={appliedCoupon ? 'text-xs text-muted-foreground line-through' : 'text-xl font-bold text-[hsl(45,93%,47%)]'}>
                      {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  {appliedCoupon && (
                    <>
                      <div className="flex items-center justify-between text-xs text-green-400">
                        <span>Cupom {appliedCoupon.code} (-{appliedCoupon.discount_percent}%)</span>
                        <span>-{appliedCoupon.amount_discounted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-border/40">
                        <span className="text-xs font-semibold">Total</span>
                        <span className="text-xl font-bold text-[hsl(45,93%,47%)]">{formatted}</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {sellerId && (
              <CouponInput
                creatorId={sellerId}
                targetType={couponTarget}
                targetId={postId}
                basePrice={price}
                onApplied={setAppliedCoupon}
                onStatusChange={(s) => setCouponValidating(s === 'validating')}
                initialCode={initialCouponCode}
              />
            )}

            <div className="rounded-lg border border-border/40 bg-card/40 p-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <Badge variant="outline" className="text-[10px]">{affiliateBadge}</Badge>
            </div>

            {!hasLinkAffiliate && (
              <div className="space-y-1">
                <Label className="text-xs">Possui um indicador? <span className="text-muted-foreground">(opcional)</span></Label>
                <Input value={affiliateInput} onChange={e => setAffiliateInput(e.target.value)} placeholder="@username" />
              </div>
            )}

            <Tabs value={tab} onValueChange={(v) => setTab(v as 'pix' | 'card')}>
              {!lockMethod && (
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="pix" className="gap-1"><QrCode className="h-3.5 w-3.5" /> PIX</TabsTrigger>
                  <TabsTrigger value="card" className="gap-1"><CreditCard className="h-3.5 w-3.5" /> Cartão</TabsTrigger>
                </TabsList>
              )}
              <TabsContent value="pix" className="text-xs text-muted-foreground py-2">
                Geramos o QR Code e liberamos o conteúdo automaticamente após o pagamento.
              </TabsContent>
              <TabsContent value="card" className="space-y-2 pt-2">
                <Input placeholder="Nome no cartão" value={card.holderName} onChange={e => setCard({ ...card, holderName: e.target.value })} />
                <Input placeholder="Número do cartão" value={card.number} onChange={e => setCard({ ...card, number: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="MM" maxLength={2} value={card.expiryMonth} onChange={e => setCard({ ...card, expiryMonth: e.target.value })} />
                  <Input placeholder="AAAA" maxLength={4} value={card.expiryYear} onChange={e => setCard({ ...card, expiryYear: e.target.value })} />
                  <Input placeholder="CVV" maxLength={4} value={card.ccv} onChange={e => setCard({ ...card, ccv: e.target.value })} />
                </div>
              </TabsContent>
            </Tabs>

            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0 text-green-500" />
              Conteúdo liberado automaticamente após confirmação do pagamento. Nenhum acesso é dado antes da confirmação.
            </p>

            {betaLocked ? (
              <div className="space-y-2 rounded-xl border border-[hsl(45,93%,47%)]/30 bg-[hsl(45,93%,47%)]/5 p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                  <span className="text-xs font-semibold text-[hsl(45,93%,47%)]">Modo Beta · Simulação</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Durante o Beta nenhuma cobrança é feita. Você libera este conteúdo como
                  <strong> acesso temporário</strong>. Quando a monetização oficial entrar no ar,
                  esse acesso será encerrado e será necessário comprar de verdade.
                </p>
                <Button
                  className="w-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-amber-500 text-black font-bold hover:opacity-90"
                  disabled={betaGrant.isPending}
                  onClick={async () => {
                    try {
                      await betaGrant.mutateAsync({
                        grantType: 'paid_content',
                        postId,
                        creatorId: sellerId ?? null,
                        metadata: { simulated_method: tab, simulated_amount: price },
                      });
                      setConfirmed(true);
                    } catch { /* toast já tratado no hook */ }
                  }}
                >
                  {betaGrant.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Liberar acesso Beta (sem cobrança)
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={submit} disabled={checkout.isPending}>
                {checkout.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {tab === 'pix'
                  ? <><QrCode className="h-4 w-4 mr-2" /> Gerar QR Code PIX · {formatted}</>
                  : <><CreditCard className="h-4 w-4 mr-2" /> Pagar com cartão · {formatted}</>}
              </Button>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="pt-3 border-t border-border/40 space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Histórico de tentativas ({history.length})
            </p>
            <ScrollArea className="max-h-40 pr-2">
              <div className="space-y-1.5">
                {history.map((h) => {
                  const canRetry = h.status === 'failed' || h.status === 'expired';
                  const color =
                    h.status === 'confirmed' ? 'text-green-500 border-green-500/30 bg-green-500/5'
                    : h.status === 'pending' ? 'text-yellow-500 border-yellow-500/30 bg-yellow-500/5'
                    : 'text-destructive border-destructive/30 bg-destructive/5';
                  return (
                    <div key={h.id} className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px] ${color}`}>
                      <div className="min-w-0">
                        <p className="font-semibold uppercase">
                          {h.method} · {attemptStatusLabel(h.status)}
                        </p>
                        <p className="text-[10px] opacity-80">{formatAttemptDate(h.createdAt)}</p>
                      </div>
                      {canRetry && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={retry}>
                          Repetir
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
