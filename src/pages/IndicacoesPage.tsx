import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Share2, Wallet, Users, TrendingUp, Lock, Gift, Crown, Sparkles, ShieldCheck, AlertCircle, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useReferralLedger } from "@/hooks/useReferralLedger";
import { useCreatorReferralCode, useMyAfilhadas } from "@/hooks/useCreatorReferrals";
import { ShareLinkStatsCard } from "@/components/profile/ShareLinkStatsCard";
import {
  CreatorAffiliateInbox,
  MyAffiliateLinksPanel,
  AffiliatePerformanceDashboard,
} from "@/components/affiliates/AffiliateComponents";
import { buildCreatorInviteUrl } from "@/lib/inviteLinks";

const fmt = (n: number) => `R$ ${(Number(n) || 0).toFixed(2)}`;

interface ProgramConfig {
  commission_pct: number;
  tracking_window_days: number;
  withdraw_min_amount: number;
  withdraw_monthly_limit: number;
  valid_plans: string[];
  enabled: boolean;
}

function usePlatformReferralConfig() {
  return useQuery({
    queryKey: ["referral-program-config"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProgramConfig | null> => {
      const { data } = await (supabase as any)
        .from("referral_program_config")
        .select("commission_pct, tracking_window_days, withdraw_min_amount, withdraw_monthly_limit, valid_plans, enabled")
        .eq("id", true)
        .maybeSingle();
      return data as any;
    },
  });
}

function useReferralWithdrawals() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["referral-withdrawals", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("referral_withdrawals")
        .select("id, amount, status, pix_key, requested_at, reviewed_at, paid_at, rejection_reason")
        .eq("user_id", user!.id)
        .order("requested_at", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable("referral_withdrawals", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.user_id !== user.id) return;
      list.refetch();
    });
    return () => { try { unsub(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const request = useMutation({
    mutationFn: async ({ amount, pixKey }: { amount: number; pixKey: string }) => {
      const { data, error } = await (supabase as any).rpc("referral_request_withdrawal", {
        p_amount: amount,
        p_pix_key: pixKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["affiliate-stats"] });
    },
  });

  return { list: list.data || [], isLoading: list.isLoading, request };
}

function PlatformTab() {
  const { user } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { code: creatorInviteCode } = useCreatorReferralCode();
  const { toast } = useToast();
  const { data: config } = usePlatformReferralConfig();
  const { stats, rows, isLoading } = useReferralLedger(50);
  const { list: withdrawals, request: requestWithdrawal } = useReferralWithdrawals();

  // Fonte UNIFICADA com a guia "Indicados" do perfil — mesma origem (creator_referrals via useMyAfilhadas)
  const { data: afilhadas = [], isLoading: loadingAfilhadas } = useMyAfilhadas();
  const unifiedTotalReferrals = afilhadas.length;
  const unifiedConverted = afilhadas.filter((a: any) => Number(a?.total_commission_earned || 0) > 0).length;
  const unifiedTotalEarned = afilhadas.reduce(
    (sum: number, a: any) => sum + Number(a?.total_commission_earned || 0),
    0,
  );

  // Fallback chain: profile.username → auth metadata → email prefix
  const metaUsername = ((user as any)?.user_metadata?.username || "").toString();
  const emailPrefix = ((user as any)?.email || "").split("@")[0] || "";
  const rawUsername = (((profile as any)?.username || metaUsername || emailPrefix) || "")
    .trim()
    .toLowerCase();
  const shareCode = creatorInviteCode || null;
  const canShare = !!shareCode;
  const shareUrl = buildCreatorInviteUrl(shareCode);

  const isFree = !((profile as any)?.is_premium || (profile as any)?.is_vip);
  const balance = Number(stats?.pending_payout || 0);
  const minWithdraw = Number(config?.withdraw_min_amount ?? 250);
  // Privacidade: usar SEMPRE @username; nunca display_name/nome real.
  const shareName = (rawUsername ? `@${rawUsername}` : "alguém").toString().trim();
  const shareText = `Oi! Eu sou ${shareName} no OCULTO. Vem conhecer pelo meu convite:`;

  const [amount, setAmount] = useState<string>("");
  const [pixKey, setPixKey] = useState<string>((profile as any)?.pix_key || "");

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copiado!", description: shareUrl });
  };

  const share = async () => {
    if (!shareUrl) return;
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "Oculto",
          text: shareText,
          url: shareUrl,
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        toast({ title: "Convite copiado!", description: "Texto pronto para colar e compartilhar." });
      } catch {
        toast({ title: "Não foi possível compartilhar", variant: "destructive" });
      }
    }
  };

  const copyPixCode = async () => {
    if (!pixKey.trim()) {
      toast({ title: "Nenhuma chave PIX preenchida", description: "Digite ou cole sua chave antes de copiar.", variant: "destructive" });
      return;
    }

    try {
      await navigator.clipboard.writeText(pixKey.trim());
      toast({ title: "Código Pix copiado!", description: "Sua chave PIX foi enviada para a área de transferência." });
    } catch {
      toast({ title: "Erro ao copiar", description: "Não foi possível copiar sua chave PIX.", variant: "destructive" });
    }
  };

  const submitWithdraw = () => {
    const v = Number(amount.replace(",", "."));
    if (!v || v < minWithdraw) {
      toast({ title: "Valor inválido", description: `Mínimo ${fmt(minWithdraw)}`, variant: "destructive" });
      return;
    }
    if (!pixKey.trim()) {
      toast({ title: "Chave PIX obrigatória", variant: "destructive" });
      return;
    }
    requestWithdrawal.mutate(
      { amount: v, pixKey: pixKey.trim() },
      {
        onSuccess: () => {
          toast({ title: "Saque solicitado", description: "Processamento em até 7 dias úteis." });
          setAmount("");
        },
        onError: (e: any) => {
          toast({ title: "Não foi possível solicitar", description: e?.message || "Erro", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Saiba mais */}
      <Link
        to="/programa-indicacoes#indicacoes-gerais"
        className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs hover:bg-primary/10 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold">Saiba como funciona cada programa de indicação</span>
        </span>
        <span className="text-primary font-bold">Ver →</span>
      </Link>

      {/* Hero share */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Indique e ganhe {config?.commission_pct ?? 5}%</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Você recebe {config?.commission_pct ?? 5}% sobre a primeira assinatura paga (Premium ou VIP) feita por quem entrar pelo seu link em até {config?.tracking_window_days ?? 90} dias.
          </p>

          {canShare ? (
            <>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl!} className="text-xs" />
                <Button size="sm" variant="outline" onClick={copy}><Copy className="h-3.5 w-3.5" /></Button>
                <Button size="sm" onClick={share}><Share2 className="h-3.5 w-3.5 mr-1" />Compartilhar</Button>
              </div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                Este é o seu link único e permanente. Cada novo cadastro feito por ele fica vinculado a você.
              </p>
            </>
          ) : profileLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : !rawUsername ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1.5">
                <p className="font-semibold text-amber-500">Defina um @username no perfil</p>
                <p className="text-muted-foreground">Seu link de indicação usa o seu @username e é único por usuário.</p>
                <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                  <Link to="/profile">Ir para o perfil</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
              <Gift className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-xs space-y-1.5">
                <p className="font-semibold text-primary">Seu link está sendo preparado automaticamente</p>
                <p className="text-muted-foreground">
                  Assim que seu @username estiver disponível, seu link permanente de indicação aparece aqui automaticamente.
                </p>
                <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                  <Link to="/profile">Completar perfil</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ShareLinkStatsCard />

      {/* KPIs — UNIFICADOS com a guia "Indicados" do perfil (creator_referrals) */}
      <div className="grid grid-cols-3 gap-2">
        <Kpi icon={<Users className="h-3.5 w-3.5" />} label="Indicados" value={String(unifiedTotalReferrals)} loading={loadingAfilhadas} />
        <Kpi icon={<TrendingUp className="h-3.5 w-3.5" />} label="Convertidos" value={String(unifiedConverted)} loading={loadingAfilhadas} />
        <Kpi icon={<Wallet className="h-3.5 w-3.5" />} label="Ganho" value={fmt(unifiedTotalEarned)} loading={loadingAfilhadas} highlight />
      </div>

      {/* Saldo + saque */}
      <Card id="saque" className="scroll-mt-20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Saldo disponível
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-primary">{fmt(balance)}</span>
            <span className="text-xs text-muted-foreground">Pago: {fmt(stats?.total_paid || 0)}</span>
          </div>

          {isFree ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-amber-500">Saque bloqueado no plano Free</p>
                <p className="text-muted-foreground">Você pode indicar e acumular saldo. Para sacar, faça upgrade para Premium ou VIP.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={`Mínimo ${fmt(minWithdraw)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Input
                  placeholder="Chave PIX"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={copyPixCode}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar código Pix
              </Button>
              <Button
                className="w-full"
                disabled={requestWithdrawal.isPending || balance < minWithdraw}
                onClick={submitWithdraw}
              >
                {requestWithdrawal.isPending ? "Solicitando..." : "Solicitar saque PIX"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Até {config?.withdraw_monthly_limit ?? 3} saques/mês · processamento em 7 dias úteis
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saques recentes */}
      {withdrawals.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Saques recentes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {withdrawals.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
                <div>
                  <p className="font-semibold">{fmt(w.amount)}</p>
                  <p className="text-muted-foreground">{new Date(w.requested_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                  {w.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Comissões recentes */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Comissões recentes</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma comissão ainda. Compartilhe seu link!</p>
          ) : (
            <div className="space-y-1.5">
              {rows.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
                  <div>
                    <p className="font-medium">{r.source}</p>
                    <p className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-primary font-semibold">{fmt(r.commission_amount)}</p>
                    <p className="text-muted-foreground text-[10px]">{r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VipChannelTab() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isVip = (profile as any)?.is_vip;
  const username = (profile as any)?.username || (user as any)?.user_metadata?.username || "voce";

  if (!isVip) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 text-center space-y-2">
          <Crown className="h-8 w-8 mx-auto text-amber-500" />
          <p className="font-semibold">Recurso exclusivo para Creators VIP</p>
          <p className="text-xs text-muted-foreground">
            Como Creator VIP você pode aprovar afiliados que divulguem seu canal e definir comissões personalizadas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <AffiliatePerformanceDashboard />
      <MyAffiliateLinksPanel />
      <CreatorAffiliateInbox creatorUsername={username} />
    </div>
  );
}

function VipContentTab() {
  return (
    <Card>
      <CardContent className="pt-6 text-center space-y-2">
        <Gift className="h-8 w-8 mx-auto text-primary" />
        <p className="font-semibold">Conteúdo VIP avulso</p>
        <p className="text-xs text-muted-foreground">
          Comissões sobre vendas de PPV e mídias avulsas aparecem no histórico da aba <strong>Plataforma</strong>, identificadas pela origem.
        </p>
      </CardContent>
    </Card>
  );
}

export default function IndicacoesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "platform";

  return (
    <div className="container mx-auto max-w-3xl py-6 px-3 space-y-4">
      <header>
        <h1 className="text-xl font-bold">Indicações</h1>
        <p className="text-xs text-muted-foreground">
          Ganhe indicando novos membros, divulgando canais VIP ou conteúdo avulso.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="platform">Plataforma</TabsTrigger>
          <TabsTrigger value="vip-channel">Canal VIP</TabsTrigger>
          <TabsTrigger value="vip-content">Conteúdo VIP</TabsTrigger>
        </TabsList>
        <TabsContent value="platform" className="mt-4"><PlatformTab /></TabsContent>
        <TabsContent value="vip-channel" className="mt-4"><VipChannelTab /></TabsContent>
        <TabsContent value="vip-content" className="mt-4"><VipContentTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon, label, value, loading, highlight }: { icon: React.ReactNode; label: string; value: string; loading?: boolean; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/40" : ""}>
      <CardContent className="pt-3 pb-2">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon}{label}</div>
        {loading ? <Skeleton className="h-5 w-16 mt-1" /> : <div className="text-base font-bold mt-0.5">{value}</div>}
      </CardContent>
    </Card>
  );
}
