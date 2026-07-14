import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Crown,
  ExternalLink,
  Settings2,
  Calendar,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Sparkles,
  Radar,
  RotateCcw,
  Plus,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  RefreshCw,
  Infinity,
  ImageIcon,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCreatorPlans, type CreatorPlan } from "@/hooks/useSubscriptionPlans";
import { getAnnualDiscountPercent } from "@/lib/creatorPlanPersistence";
import { buildChannelRoute } from "@/lib/channelRoute";
import { supabase } from "@/lib/supabaseExternal";
import { useQueryClient } from "@tanstack/react-query";
import { useMySubscriptions } from "@/hooks/useMySubscriptions";
import { useCancelSubscription } from "@/hooks/useSubscriptions";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BetaLockedNotice } from "@/components/beta/BetaLockedNotice";
import { useBetaGuard } from "@/hooks/useBetaGuard";
import { getHandleInitial, getPublicHandle } from "@/lib/userHandle";
import { ChannelBanner } from "@/components/channel/ChannelBanner";

// Local subscription type for the card component
export interface MySubscription {
  id: string;
  creatorId: string;
  creatorName: string;
  handle: string;
  avatarUrl: string;
  isVerified: boolean;
  // Dados do CANAL VIP (nunca expor identidade real do criador)
  channelTitle: string;
  channelBanner: string | null;
  subscriberCount: number;
  channelRoute: string;
  renewalDate: string;
  price: number;
  status: 'active' | 'expiring' | 'cancelled';
  subscribedSince: string;
}

// Format date to "25/Fev" style
function formatRenewalDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = parseISO(dateStr);
    const day = format(d, "dd");
    const month = format(d, "MMM", { locale: ptBR });
    return `${day}/${month.charAt(0).toUpperCase() + month.slice(1, 3)}`;
  } catch {
    return "—";
  }
}

// Format date to "Jan 2024" style
function formatSubscribedSince(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    return format(d, "MMM yyyy", { locale: ptBR })
      .replace(/^\w/, c => c.toUpperCase());
  } catch {
    return "—";
  }
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const getStatusConfig = (status: MySubscription["status"]) => {
  switch (status) {
    case "active":
      return {
        label: "Ativo",
        icon: CheckCircle2,
        className: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30",
      };
    case "expiring":
      return {
        label: "Expirando",
        icon: AlertCircle,
        className: "bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        icon: XCircle,
        className: "bg-destructive/10 text-destructive border-destructive/30",
      };
  }
};

// ── Card de assinatura: mostra o CANAL VIP (nunca nome/foto real do criador) ─
function MySubscriptionCard({
  sub,
  onManage,
}: {
  sub: MySubscription;
  onManage: (sub: MySubscription) => void;
}) {
  const statusConfig = getStatusConfig(sub.status);
  const subscriberLabel = sub.subscriberCount === 1 ? "assinante" : "assinantes";

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all hover:border-primary/30 flex flex-col",
        sub.status === "cancelled" && "opacity-60"
      )}
    >
      <CardContent className="p-0 flex flex-col flex-1">
        <ChannelBanner
          bannerUrl={sub.channelBanner}
          avatarUrl={sub.avatarUrl}
          channelTitle={sub.channelTitle}
          handle={sub.handle}
        />

        <div className="pt-3 px-3 pb-3 flex flex-col flex-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Users className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {sub.subscriberCount.toLocaleString("pt-BR")} {subscriberLabel}
            </span>
            <span className={cn("ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", statusConfig.className)}>
              {statusConfig.label}
            </span>
          </div>

          {/* Renewal + price */}
          <div className="flex items-center justify-between py-2 px-2.5 rounded-lg bg-muted/30 mb-3 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Renova em: {sub.renewalDate}</span>
            </div>
            <span className="font-bold text-[hsl(45,93%,47%)] ml-2 whitespace-nowrap">
              {formatCurrency(sub.price)}
            </span>
          </div>

          {/* Actions — leva ao CANAL, não ao perfil */}
          <div className="flex gap-1.5 mt-auto">
            <Button
              asChild
              size="sm"
              className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-xs h-8"
            >
              <Link to={sub.channelRoute}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Acessar Canal
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onManage(sub)}
              className="shrink-0 h-8 w-8"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card de plano criado pelo criador VIP ────────────────────────────────────
function CreatorPlanCard({
  plan,
  profile,
  onEdit,
  onDelete,
}: {
  plan: CreatorPlan;
  profile: any;
  onEdit: (plan: CreatorPlan) => void;
  onDelete: (plan: CreatorPlan) => void;
}) {
  const bannerStyle = plan.banner_url
    ? { backgroundImage: `url(${plan.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(135deg, hsl(var(--primary)/0.35), hsl(var(--secondary)/0.35))" };

  // Renewal text: monthly by default
  const renewalText = plan.annual_price
    ? "Renovação anual"
    : "Renovação mensal";

  return (
    <Card className="overflow-hidden flex flex-col hover:border-primary/30 transition-all">
      <CardContent className="p-0 flex flex-col flex-1">
        {/* Banner */}
        <div className="h-20 relative flex-shrink-0" style={bannerStyle}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

          {/* Avatar + title at bottom of banner */}
          <div className="absolute bottom-2 left-2 right-10 z-10 flex items-end gap-2">
            <Avatar className="h-11 w-11 ring-2 ring-white/70 shadow-md flex-shrink-0">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {getHandleInitial(profile)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight drop-shadow truncate">{plan.title}</p>
                {profile && (
                  <p className="text-white/75 text-xs truncate drop-shadow">{getPublicHandle(profile)}</p>
              )}
            </div>
          </div>

          {/* Active badge */}
          <div className="absolute top-2 left-2 z-10">
            <Badge className={cn("text-xs", plan.is_enabled
              ? "bg-[hsl(142,76%,36%)]/20 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/40"
              : "bg-muted/50 text-muted-foreground border-border/30"
            )}>
              {plan.is_enabled ? "Ativo" : "Inativo"}
            </Badge>
          </div>

          {/* 3-dot menu */}
          <div className="absolute top-1.5 right-1.5 z-20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-7 w-7 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center backdrop-blur-sm transition-colors">
                  <MoreVertical className="h-3.5 w-3.5 text-white" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onEdit(plan)} className="gap-2 cursor-pointer">
                  <Pencil className="h-4 w-4 text-primary" />
                  Editar plano
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(plan)}
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir plano
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Prices + renewal info */}
        <div className="px-3 py-2.5 flex flex-col gap-1.5 flex-1">
          {plan.bio && (
            <p className="text-xs text-muted-foreground line-clamp-2">{plan.bio}</p>
          )}

          {/* Renewal info */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            <span>{renewalText}</span>
          </div>

          {/* Prices */}
          <div className="flex flex-col gap-1 text-xs mt-auto">
            <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <CreditCard className="h-3 w-3 text-[hsl(45,93%,47%)]" />
                <span>Mensal</span>
              </div>
              <span className="font-bold text-[hsl(45,93%,47%)]">{formatCurrency(plan.monthly_price)}</span>
            </div>
            {plan.annual_price && (() => {
              const discount = getAnnualDiscountPercent(plan.monthly_price, plan.annual_price);
              return (
                <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3 text-green-400" />
                    <span>Anual</span>
                    {discount > 0 && (
                      <Badge className="ml-1 px-1.5 py-0 h-4 text-[9px] font-bold bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/40">
                        {discount}% Desc.
                      </Badge>
                    )}
                  </div>
                  <span className="font-semibold text-foreground">{formatCurrency(plan.annual_price)}</span>
                </div>
              );
            })()}
            {plan.lifetime_price && (
              <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Infinity className="h-3 w-3 text-yellow-400" />
                  <span>Vitalício</span>
                </div>
                <span className="font-semibold text-foreground">{formatCurrency(plan.lifetime_price)}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function SubscriptionsBetaNotice() {
  const { isLocked } = useBetaGuard('subscriptions');
  if (!isLocked) return null;
  return (
    <BetaLockedNotice
      title="Assinaturas pagas em breve"
      message="A plataforma está no Beta Público. Você pode explorar tudo, mas cobranças de assinatura serão liberadas apenas no lançamento oficial."
    />
  );
}

export default function SubscriptionsPage() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Real DB subscriptions (criadores que o usuário assina)
  const { data: dbSubscriptions = [], isLoading: loadingSubscriptions, refetch: refetchSubs } = useMySubscriptions();
  const cancelSubMutation = useCancelSubscription();

  // Auto-refetch quando a sessão do usuário carrega/muda — garante que a vitrine
  // apareça mesmo após login recente, troca de conta ou mudanças de assinatura.
  useEffect(() => {
    if (user?.id) {
      refetchSubs();
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Map real DB data to component format.
  // Mostra dados do CANAL (subscription_plans) — nunca expõe identidade real do criador.
  const mySubscriptions: MySubscription[] = dbSubscriptions.map(sub => {
    const channelRoute = buildChannelRoute({
      ownerId: sub.creator?.id,
      ownerUserId: sub.creator?.user_id,
      ownerUsername: sub.creator?.username,
      ownerName: sub.channel?.title,
      channelId: sub.channel?.id,
      channelTitle: sub.channel?.title,
    });
    return {
      id: sub.id,
      creatorId:
        sub.creator?.username ||
        sub.creator?.user_id ||
        sub.creator?.id ||
        sub.creator_id,
      // Mantidos por compatibilidade com modais — não exibidos no card público.
      creatorName: getPublicHandle(sub.creator),
      handle: getPublicHandle(sub.creator),
      avatarUrl: sub.creator?.avatar_url || "",
      isVerified: false,
      // Dados públicos do canal
      channelTitle: sub.channel?.title || "Canal VIP",
      channelBanner: sub.channel?.banner_url || null,
      subscriberCount: sub.channel?.subscriber_count || 0,
      channelRoute,
      renewalDate: formatRenewalDate(sub.expires_at),
      price: sub.price,
      status: sub.status === 'active' ? 'active' : sub.status === 'cancelled' ? 'cancelled' : 'expiring',
      subscribedSince: formatSubscribedSince(sub.created_at),
    };
  });

  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<MySubscription | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // ── Auto-abre o checkout quando vier de "Assinar Agora" (?subscribe=1&creatorId=&creatorName=) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const subscribeFlag = searchParams.get('subscribe');
  const creatorIdParam = searchParams.get('creatorId');
  const creatorNameParam = searchParams.get('creatorName');
  const [showCheckoutFromUrl, setShowCheckoutFromUrl] = useState(false);
  const [pendingCreator, setPendingCreator] = useState<{ id?: string; name?: string }>({});

  useEffect(() => {
    if (subscribeFlag === '1') {
      setPendingCreator({ id: creatorIdParam ?? undefined, name: creatorNameParam ?? undefined });
      setShowCheckoutFromUrl(true);
      // Limpa params para não reabrir em refresh / navegação
      const next = new URLSearchParams(searchParams);
      next.delete('subscribe');
      next.delete('creatorId');
      next.delete('creatorName');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeFlag]);

  // Toda criação/edição de canal e planos VIP foi centralizada em /canal-vip.
  const openPricingModal = (tab: string = "planos", planId: string | null = null) => {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (planId) params.set("plan", planId);
    window.location.href = `/canal-vip?${params.toString()}`;
  };

  // All VIP users (creators or not) can see both sections
  const isVip = profile?.plan_type === "vip";

  // Fetch creator's own plans — always enabled so real plans load
  const { data: creatorPlans = [], isLoading: loadingPlans } = useCreatorPlans(profile?.id ?? null);

  const totalSpend = mySubscriptions
    .filter(s => s.status !== 'cancelled')
    .reduce((acc, s) => acc + s.price, 0);
  const activeCount = mySubscriptions.filter((s) => s.status !== "cancelled").length;

  const handleManage = (sub: MySubscription) => {
    setSelectedSub(sub);
    setShowManageModal(true);
  };

  const handleCancel = async () => {
    if (selectedSub) {
      await cancelSubMutation.mutateAsync(selectedSub.id);
      toast({
        title: "Assinatura cancelada",
        description: `Você não será cobrado novamente por ${selectedSub.creatorName}`,
      });
      setShowManageModal(false);
    }
  };

  const handleReactivate = async () => {
    if (selectedSub) {
      // Reactivate by updating status back to active
      await supabase
        .from('subscriptions' as any)
        .update({ status: 'active' })
        .eq('id', selectedSub.id);
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
      toast({
        title: "Assinatura reativada",
        description: `Sua assinatura de ${selectedSub.creatorName} foi reativada`,
      });
      setShowManageModal(false);
    }
  };

  const handleEditPlan = (plan: CreatorPlan) => {
    openPricingModal("planos", plan.id);
  };

  const handleDeletePlan = async (plan: CreatorPlan) => {
    setDeletingPlanId(plan.id);
    try {
      const { error } = await (supabase as any)
        .from("subscription_plans")
        .delete()
        .eq("id", plan.id);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["creator-plans"] });
      toast({ title: "Plano excluído", description: `"${plan.title}" foi removido com sucesso.` });
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    } finally {
      setDeletingPlanId(null);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Scrollable area */}
      <div className="pb-24 md:pb-8">
        <div className="p-4 md:p-6 space-y-8 max-w-4xl mx-auto">

          <SubscriptionsBetaNotice />

          {/* ── Header ── */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(45,93%,47%)]/20 to-primary/10">
                  <Crown className="h-6 w-6 text-[hsl(45,93%,47%)]" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">Assinaturas VIP</h1>
                  <p className="text-sm text-muted-foreground">Gerencie conteúdos exclusivos</p>
                </div>
              </div>

              {/* Botões de criadores — visíveis para todos os VIPs */}
              {isVip && (
                <div className="flex gap-1.5 flex-wrap shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPricingModal("preco")}
                    className="border-primary/30 text-primary hover:bg-primary/10 gap-1.5 text-xs h-8"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">PPV & DM</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPricingModal("asaas")}
                    className="border-green-500/30 text-green-400 hover:bg-green-500/10 gap-1.5 text-xs h-8"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Asaas</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPricingModal("planos")}
                    className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 gap-1.5 text-xs h-8"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Criar Assinatura</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── Summary Card ── */}
          <Card className="bg-gradient-to-r from-[hsl(45,93%,47%)]/5 via-card/50 to-primary/5 border-[hsl(45,93%,47%)]/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[hsl(45,93%,47%)]/10">
                    <CreditCard className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gasto Mensal</p>
                    <p className="text-xl font-bold text-[hsl(45,93%,47%)]">{formatCurrency(totalSpend)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Assinaturas Ativas</p>
                  <p className="text-xl font-bold text-foreground">{activeCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ══ SEÇÃO 1: Meus Planos de Assinatura (todos os VIPs) ══ */}
          {isVip && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                  <h2 className="font-semibold text-foreground">Meus Planos de Assinatura</h2>
                  <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">
                    {creatorPlans.length}/5
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openPricingModal("planos")}
                  className="h-8 text-xs gap-1 text-yellow-400 hover:bg-yellow-500/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Criar plano
                </Button>
              </div>

              <div className="mb-3 p-3 rounded-lg bg-muted/20 border border-border/40 flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 text-[hsl(45,93%,47%)] mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">Aqui você cria o canal pago</strong> (preço, capa, trailer).
                  Para <strong className="text-foreground">publicar posts exclusivos VIP</strong>, use <em>Criar Post</em> na barra lateral
                  e selecione visibilidade <em>VIP</em>. Mídias avulsas (PPV) também ficam em <em>Criar Post → Conteúdo Pago</em>.
                </span>
              </div>

              {loadingPlans ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[1,2].map(i => (
                    <div key={i} className="h-40 rounded-xl bg-muted/20 animate-pulse" />
                  ))}
                </div>
              ) : creatorPlans.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {creatorPlans.map((plan) => (
                    <CreatorPlanCard
                      key={plan.id}
                      plan={plan}
                      profile={profile}
                      onEdit={handleEditPlan}
                      onDelete={handleDeletePlan}
                    />
                  ))}
                </div>
              ) : (
                <Card className="border-dashed border-yellow-500/20">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                    <Crown className="h-8 w-8 text-[hsl(45,93%,47%)]/40 mb-2" />
                    <p className="text-sm font-medium text-foreground mb-1">Nenhum plano criado</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Crie planos para que seus fãs possam assinar seu conteúdo
                    </p>
                    <Button
                      size="sm"
                      onClick={() => openPricingModal("planos")}
                      className="bg-gradient-to-r from-gold to-primary text-gold-foreground font-semibold hover:opacity-90"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Criar primeiro plano
                    </Button>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {/* ══ SEÇÃO 2: Assinaturas do usuário (outros criadores) ══ */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground">Criadores que Assino</h2>
              {activeCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {activeCount} ativo{activeCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {loadingSubscriptions ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-48 rounded-xl bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : mySubscriptions.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {mySubscriptions.map((sub) => (
                  <MySubscriptionCard key={sub.id} sub={sub} onManage={handleManage} />
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-full bg-muted/30 mb-3">
                    <Sparkles className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    Nenhuma assinatura ativa
                  </h3>
                  <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                    Explore criadores VIP e desbloqueie conteúdos exclusivos. Se você já assinou um canal, a vitrine será atualizada automaticamente aqui.
                  </p>
                  <Button asChild size="sm" className="bg-gradient-to-r from-primary to-secondary">
                    <Link to="/vitrine-vip">
                      <Crown className="h-4 w-4 mr-2" />
                      Explorar Criadores VIP
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>

      {/* ── Manage Subscription Modal ── */}
      <Dialog open={showManageModal} onOpenChange={setShowManageModal}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Gerenciar Assinatura
            </DialogTitle>
            <DialogDescription>
              Gerencie sua assinatura de {selectedSub?.creatorName}
            </DialogDescription>
          </DialogHeader>

          {selectedSub && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={selectedSub.avatarUrl} alt={selectedSub.creatorName} />
                  <AvatarFallback>{selectedSub.creatorName[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold">{selectedSub.creatorName}</p>
                    {selectedSub.isVerified && (
                      <CheckCircle2 className="h-4 w-4 text-primary fill-primary/20" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{selectedSub.handle}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-border/30">
                  <span className="text-muted-foreground">Assinante desde</span>
                  <span className="font-medium">{selectedSub.subscribedSince}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/30">
                  <span className="text-muted-foreground">Próxima renovação</span>
                  <span className="font-medium">{selectedSub.renewalDate}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/30">
                  <span className="text-muted-foreground">Valor mensal</span>
                  <span className="font-semibold text-gold">
                    {formatCurrency(selectedSub.price)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={cn("text-xs", getStatusConfig(selectedSub.status).className)}>
                    {getStatusConfig(selectedSub.status).label}
                  </Badge>
                </div>
              </div>

              {selectedSub.status === "cancelled" ? (
                <Button
                  onClick={handleReactivate}
                  className="w-full bg-success text-success-foreground hover:bg-success/90"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reativar Assinatura
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar Renovação Automática
                </Button>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {selectedSub.status === "cancelled"
                  ? "Reative para continuar acessando o conteúdo exclusivo."
                  : "Você manterá acesso até o fim do período pago."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Checkout aberto pelo botão "Assinar Agora" vindo do feed/perfil */}
      <SubscriptionModal
        open={showCheckoutFromUrl}
        onOpenChange={setShowCheckoutFromUrl}
        creatorId={pendingCreator.id}
        creatorName={pendingCreator.name}
      />
    </div>
  );
}
