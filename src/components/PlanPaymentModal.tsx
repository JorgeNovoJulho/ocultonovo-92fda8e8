import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  QrCode,
  Copy,
  CheckCircle2,
  Loader2,
  Crown,
  Sparkles,
  CreditCard,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import type { PlanWithCreator } from "./PlanSubscribeModal";
import { useBetaGuard } from "@/hooks/useBetaGuard";
import { useCreateBetaGrant } from "@/hooks/useBetaGrants";

type BillingCycle = "monthly" | "annual" | "lifetime";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

// Fake PIX code for demo
const FAKE_PIX_CODE =
  "00020126580014BR.GOV.BCB.PIX0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986540510.005802BR5913OCULTO SWING6009SAO PAULO62070503***6304ABCD";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PlanWithCreator;
  billingCycle: BillingCycle;
  amount: number;
  onSuccess: () => void;
  affiliateIdFromLink?: string | null;
  affiliateUsernameFromLink?: string | null;
}

export function PlanPaymentModal({ open, onOpenChange, plan, billingCycle, amount, onSuccess, affiliateIdFromLink = null, affiliateUsernameFromLink = null }: Props) {
  const [tab, setTab] = useState<"pix" | "card">("pix");
  const [copied, setCopied] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const secondsLeftRef = useRef(300);
  const timerSpanRef = useRef<HTMLSpanElement>(null);

  // Card mock
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [cardName, setCardName] = useState("");
  const [cardExp, setCardExp] = useState("12/29");
  const [cardCvc, setCardCvc] = useState("123");

  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const { isLocked: betaLocked } = useBetaGuard('subscriptions');
  const vipChannelBeta = useBetaGuard('vip_channels');
  const isBetaMode = betaLocked || vipChannelBeta.isLocked;
  const betaGrant = useCreateBetaGrant();


  // Countdown timer (PIX)
  useEffect(() => {
    if (!open || isPaid || tab !== "pix") return;
    secondsLeftRef.current = 300;
    const interval = setInterval(() => {
      secondsLeftRef.current -= 1;
      if (secondsLeftRef.current <= 0) {
        secondsLeftRef.current = 0;
        clearInterval(interval);
      }
      const s = secondsLeftRef.current;
      const text = `Expira em ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      if (timerSpanRef.current) {
        timerSpanRef.current.textContent = text;
        timerSpanRef.current.className = s > 60
          ? "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground bg-muted/30"
          : "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-destructive bg-destructive/10";
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [open, isPaid, tab]);

  const handleCopy = () => {
    navigator.clipboard.writeText(FAKE_PIX_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Confirma pagamento — em modo Beta cria beta grant (sem cobrança).
  // Em produção (monetização ativa) grava subscription real.
  const handleConfirmPayment = async (method: "pix" | "card") => {
    if (!profile?.id) return;
    setIsProcessing(true);

    try {
      if (isBetaMode) {
        await betaGrant.mutateAsync({
          grantType: 'creator_subscription',
          creatorId: plan.profile_id,
          planId: plan.id,
          metadata: { simulated_method: method, simulated_amount: amount, billing_cycle: billingCycle },
        });
        await queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
        await queryClient.invalidateQueries({ queryKey: ["is-subscribed"] });
        setIsPaid(true);
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        return;
      }

      const expiresAt = new Date();
      if (billingCycle === "monthly") expiresAt.setMonth(expiresAt.getMonth() + 1);
      else if (billingCycle === "annual") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      else expiresAt.setFullYear(expiresAt.getFullYear() + 99);

      const { error } = await (supabase as any)
        .from("subscriptions")
        .upsert(
          {
            subscriber_id: profile.id,
            creator_id: plan.profile_id,
            status: "active",
            price: amount,
            expires_at: expiresAt.toISOString(),
          },
          { onConflict: "subscriber_id,creator_id" }
        );

      if (error) throw error;

      // Resolve afiliado: prioriza ID; senão tenta username
      let resolvedAffiliateId: string | null = affiliateIdFromLink ?? null;
      if (!resolvedAffiliateId && affiliateUsernameFromLink) {
        try {
          const { data: aff } = await (supabase as any)
            .from("profiles")
            .select("id")
            .eq("username", affiliateUsernameFromLink)
            .maybeSingle();
          if (aff?.id) resolvedAffiliateId = aff.id;
        } catch { /* segue sem afiliado */ }
      }

      const { data: txRow, error: txErr } = await (supabase as any)
        .from("transactions")
        .insert({
          user_id: profile.user_id,
          type: "subscription",
          amount,
          status: "completed",
          description: `Assinatura: ${plan.title} (${billingCycle}) — ${method.toUpperCase()}`,
          seller_id: plan.profile_id,
          affiliate_id: resolvedAffiliateId,
          affiliate_applied: !!resolvedAffiliateId,
        })
        .select("id")
        .single();

      if (txErr) console.error("[plan-payment] tx insert error:", txErr.message);

      // Atribuição de comissão de afiliado (5%) — usa split atômico no servidor
      if (txRow?.id && resolvedAffiliateId) {
        try {
          await (supabase as any).rpc("process_payment_split", {
            p_transaction_id: txRow.id,
            p_payment_external_id: `sim_sub_${txRow.id}`,
            p_flow_type: "creator_content",
            p_gross_amount: amount,
            p_creator_id: plan.profile_id,
            p_affiliate_id: resolvedAffiliateId,
            p_provider: method === "pix" ? "pix_sim" : "card_sim",
          });
        } catch (splitErr: any) {
          console.error("[plan-payment] split RPC error:", splitErr?.message);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["is-subscribed"] });

      setIsPaid(true);
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    } catch (err: any) {
      toast({
        title: "Erro ao processar pagamento",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => () => { secondsLeftRef.current = 0; }, []);

  const handleClose = useCallback(() => {
    if (isPaid) onSuccess();
    else onOpenChange(false);
    setIsPaid(false);
    setIsProcessing(false);
    setCopied(false);
  }, [isPaid, onSuccess, onOpenChange]);

  const cycleLabel = { monthly: "Mensal", annual: "Anual", lifetime: "Vitalício" }[billingCycle];

  const cardValid = cardNumber.replace(/\s/g, "").length >= 13 && cardName.trim().length > 2 && /^\d{2}\/\d{2}$/.test(cardExp) && cardCvc.length >= 3;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="w-[95vw] max-w-sm p-0 gap-0 bg-card border-border overflow-hidden max-h-[90dvh] flex flex-col">
        {isPaid ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
              <Sparkles className="h-10 w-10 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {isBetaMode ? "Acesso Beta liberado ✨" : "Assinatura Ativa! 🎉"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isBetaMode ? "Você tem acesso temporário ao canal de " : "Você agora tem acesso ao conteúdo exclusivo de "}
                <span className="text-foreground font-semibold">
                  {plan.creator.name || plan.creator.username}
                </span>
              </p>
              {isBetaMode && (
                <p className="text-[11px] text-amber-400 mt-2 leading-relaxed">
                  Nenhuma cobrança foi feita. Quando o lançamento oficial começar,
                  esta assinatura beta será cancelada e você precisará assinar novamente.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
              <Crown className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">{plan.title}</span>
              <Badge className="text-xs bg-green-500/20 text-green-300 border-green-500/30">{cycleLabel}</Badge>
            </div>
            <Button
              onClick={handleClose}
              className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-bold"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {isBetaMode ? "Acessar canal" : "Ver Minhas Assinaturas"}
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40">
              <DialogTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-primary" />
                Pagamento
              </DialogTitle>
              <DialogDescription className="text-xs">
                Escolha o método de pagamento abaixo
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0 scrollbar-hide">
              {isBetaMode && (
                <div className="rounded-xl border border-[hsl(45,93%,47%)]/40 bg-[hsl(45,93%,47%)]/10 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                    <span className="text-xs font-bold text-[hsl(45,93%,47%)]">Modo Beta · Simulação</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Nenhuma cobrança será feita. Esta é uma <strong>assinatura beta temporária</strong>.
                    Quando o lançamento oficial começar, ela será cancelada e você precisará assinar novamente.
                  </p>
                </div>
              )}
              {/* Plan info */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/30 border border-border/30">
                <div>
                  <p className="text-xs text-muted-foreground">Plano</p>
                  <p className="font-semibold text-sm text-foreground truncate max-w-[160px]">{plan.title}</p>
                  <p className="text-xs text-muted-foreground">{cycleLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-primary">
                    {isBetaMode ? <span className="line-through opacity-60 mr-1">{formatCurrency(amount)}</span> : formatCurrency(amount)}
                    {isBetaMode && <span className="block text-[11px] text-amber-400">R$ 0,00 (beta)</span>}
                  </p>
                </div>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="pix" className="gap-1.5"><QrCode className="h-3.5 w-3.5" />PIX</TabsTrigger>
                  <TabsTrigger value="card" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Cartão</TabsTrigger>
                </TabsList>

                {/* PIX */}
                <TabsContent value="pix" className="space-y-3 mt-3">
                  <div className="flex flex-col items-center space-y-3">
                    <div className="p-3 rounded-2xl bg-white shadow-lg">
                      <QRCodeSVG value={FAKE_PIX_CODE} size={170} level="M" includeMargin={false} />
                    </div>
                    <span
                      ref={timerSpanRef}
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground bg-muted/30"
                    >
                      Expira em 05:00
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopy} className="w-full gap-2 text-xs h-9">
                    {copied ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Código copiado!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copiar código PIX</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleConfirmPayment("pix")}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:opacity-90 font-bold gap-2"
                  >
                    {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirmando…</> : <><CheckCircle2 className="h-4 w-4" /> Confirmar Pagamento PIX</>}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Após pagar no app do seu banco, clique em "Confirmar Pagamento"
                  </p>
                </TabsContent>

                {/* CARTÃO */}
                <TabsContent value="card" className="space-y-3 mt-3">
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Número do cartão</Label>
                      <Input
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="0000 0000 0000 0000"
                        inputMode="numeric"
                        className="h-9 text-sm font-mono tracking-wider"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Nome impresso no cartão</Label>
                      <Input
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value.toUpperCase())}
                        placeholder="NOME COMPLETO"
                        className="h-9 text-sm uppercase"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Validade</Label>
                        <Input
                          value={cardExp}
                          onChange={(e) => setCardExp(e.target.value)}
                          placeholder="MM/AA"
                          inputMode="numeric"
                          maxLength={5}
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">CVC</Label>
                        <Input
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ""))}
                          placeholder="000"
                          inputMode="numeric"
                          maxLength={4}
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleConfirmPayment("card")}
                    disabled={isProcessing || !cardValid}
                    className={cn(
                      "w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-bold gap-2",
                      !cardValid && "opacity-60"
                    )}
                  >
                    {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</> : <><CreditCard className="h-4 w-4" /> Pagar {formatCurrency(amount)}</>}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Pagamento simulado. Cartão de teste: 4242 4242 4242 4242
                  </p>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
