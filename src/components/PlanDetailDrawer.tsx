import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Crown, CheckCircle2, ExternalLink, Heart, Star, X as XIcon,
  Lock, Play, Image as ImageIcon, Film, Loader2, ShoppingCart, BadgeCheck,
  Users, Sliders, Check, MoreHorizontal, Snowflake, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useIsSubscribedTo,
  useMySubscriptions,
  useCancelSubscription,
} from "@/hooks/useSubscriptions";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useBatchMediaAccess } from "@/hooks/useMediaAccess";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlanWithCreator } from "./PlanSubscribeModal";
import { PlanSubscribeModal } from "./PlanSubscribeModal";
import { PaidContentCheckoutModal } from "./PaidContentCheckoutModal";
import { getAnnualDiscountPercent } from "@/lib/creatorPlanPersistence";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { useBetaGuard } from "@/hooks/useBetaGuard";
import { BetaMonetizationBanner } from "@/components/beta/BetaMonetizationBanner";

type BlurLevel = "none" | "light" | "medium" | "strong";
const BLUR_LEVELS: { value: BlurLevel; label: string }[] = [
  { value: "none", label: "Sem blur" },
  { value: "light", label: "Blur fraco" },
  { value: "medium", label: "Blur médio" },
  { value: "strong", label: "Blur forte" },
];
const BLUR_CLASS: Record<BlurLevel, string> = {
  none: "",
  light: "blur-md scale-105",
  medium: "blur-xl scale-110",
  strong: "blur-3xl scale-125",
};
function normalizeBlur(v: any): BlurLevel {
  return v === "none" || v === "light" || v === "strong" ? v : "medium";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

type SectionKey = "short_video" | "long_video" | "photo" | "photo_pack" | "video_pack" | "other";

interface PaidPostRow {
  id: string;
  content: string | null;
  media_url: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  privacy_level: string | null;
  unlock_price: number | null;
  paid_price: number | null;
  is_paid: boolean | null;
  section_type: SectionKey | null;
  preview_blur: BlurLevel | null;
  created_at: string;
}

function useCreatorPaidContent(creatorProfileId: string | undefined) {
  return useQuery({
    queryKey: ["creator-paid-content", creatorProfileId],
    enabled: !!creatorProfileId,
    queryFn: async (): Promise<PaidPostRow[]> => {
      const cols =
        "id, content, media_url, media_urls, media_type, privacy_level, unlock_price, paid_price, is_paid, section_type, preview_blur, created_at";
      // Inclui posts VIP/subscribers OU posts pagos avulsos (PPV) deste criador
      const { data, error } = await (supabase as any)
        .from("posts")
        .select(cols)
        .eq("creator_id", creatorProfileId)
        .or("privacy_level.in.(vip,subscribers),is_paid.eq.true")
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) {
        const fb = await (supabase as any)
          .from("posts")
          .select("id, content, media_url, media_type, preview_blur, created_at")
          .eq("creator_id", creatorProfileId)
          .not("media_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(120);
        return (fb.data || []) as PaidPostRow[];
      }
      return (data || []) as PaidPostRow[];
    },
    staleTime: 60_000,
  });
}

const SECTION_DEFS: { key: SectionKey; title: string; icon: "video" | "image" }[] = [
  { key: "short_video", title: "Vídeos curtos", icon: "video" },
  { key: "long_video", title: "Vídeos longos", icon: "video" },
  { key: "photo", title: "Imagens & Fotos", icon: "image" },
  { key: "photo_pack", title: "Packs de imagens", icon: "image" },
  { key: "video_pack", title: "Packs de vídeos", icon: "video" },
];

function inferSectionKey(p: PaidPostRow): SectionKey {
  if (p.section_type) return p.section_type;
  const isVideo = (p.media_type || "").toLowerCase().includes("video");
  const isPack = Array.isArray(p.media_urls) && p.media_urls.length > 1;
  if (isVideo && isPack) return "video_pack";
  if (isVideo) return "short_video";
  if (isPack) return "photo_pack";
  return "photo";
}

function useCreatorSubscribersCount(creatorProfileId: string | undefined) {
  return useQuery({
    queryKey: ["creator-subscribers-count", creatorProfileId],
    enabled: !!creatorProfileId,
    queryFn: async (): Promise<number> => {
      try {
        const { count } = await (supabase as any)
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", creatorProfileId)
          .eq("status", "active");
        return count || 0;
      } catch { return 0; }
    },
    staleTime: 60_000,
  });
}

function useFavoritePlan(planId: string | undefined) {
  const key = planId ? `vitrine_favorite_${planId}` : null;
  const [fav, setFav] = useState<boolean>(false);
  useEffect(() => {
    if (!key) return;
    try { setFav(localStorage.getItem(key) === "1"); } catch { /* noop */ }
  }, [key]);
  const toggle = () => {
    if (!key) return;
    const next = !fav;
    setFav(next);
    try {
      if (next) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch { /* noop */ }
    toast.success(next ? "Adicionado aos favoritos" : "Removido dos favoritos");
  };
  return { fav, toggle };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PlanWithCreator | null;
  onBack?: () => void;
}

export function PlanDetailDrawer({ open, onOpenChange, plan, onBack }: Props) {
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();
  const { data: isMasterAdmin = false } = useIsMasterAdmin();
  const isOwner = !!(plan?.profile_id && myProfile?.id && plan.profile_id === myProfile.id);
  const queryClient = useQueryClient();
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [buyTarget, setBuyTarget] = useState<{ postId: string; price: number } | null>(null);
  const [channelActionLoading, setChannelActionLoading] = useState<"freeze" | "delete" | "blur" | null>(null);
  const { isLocked: betaSubLocked, lockedLabel: subLockedLabel, guard: subGuard } = useBetaGuard('subscriptions');
  const { guard: ppvGuard } = useBetaGuard('paid_content');

  const { data: paidPosts = [], isLoading: loadingContent } =
    useCreatorPaidContent(plan?.profile_id);
  const { data: subscribersCount = 0 } = useCreatorSubscribersCount(plan?.profile_id);

  const postIds = useMemo(() => paidPosts.map((p) => p.id), [paidPosts]);
  const { data: accessMap = {} } = useBatchMediaAccess(postIds);

  const { data: isSubscribed } = useIsSubscribedTo(plan?.profile_id);
  const { data: mySubs = [] } = useMySubscriptions();
  const cancelSub = useCancelSubscription();
  const { fav, toggle: toggleFav } = useFavoritePlan(plan?.id);

  const mySub = useMemo(
    () => mySubs.find((s: any) => s.creator_id === plan?.profile_id && s.status === "active"),
    [mySubs, plan?.profile_id],
  );

  const videos = useMemo(
    () => paidPosts.filter((p) => (p.media_type || "").toLowerCase().includes("video")),
    [paidPosts],
  );
  const images = useMemo(
    () => paidPosts.filter((p) => !((p.media_type || "").toLowerCase().includes("video"))),
    [paidPosts],
  );
  const channelBlurValue = useMemo(
    () => normalizeBlur(paidPosts[0]?.preview_blur),
    [paidPosts],
  );

  const postsBySection = useMemo(() => {
    const map: Record<SectionKey, PaidPostRow[]> = {
      short_video: [], long_video: [], photo: [], photo_pack: [], video_pack: [], other: [],
    };
    paidPosts.forEach((p) => {
      const k = inferSectionKey(p);
      (map[k] || map.other).push(p);
    });
    return map;
  }, [paidPosts]);

  if (!plan) return null;

  const creatorName = plan.creator.name || plan.creator.username || "Criador VIP";
  const status = ((plan as any).availability_status || "active") as "active" | "frozen" | "deleted";
  const annualDiscount = getAnnualDiscountPercent(plan.monthly_price, plan.annual_price);
  const canManageChannel = isOwner;
  const canAuditDeleted = isMasterAdmin && status === "deleted";

  const updatePlanMeta = useCallback(async (patch: Record<string, any>) => {
    const candidate = { ...patch };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { error } = await (supabase as any)
        .from("subscription_plans")
        .update(candidate)
        .eq("id", plan.id);
      if (!error) return true;
      const msg = String(error?.message || "");
      const match = msg.match(/Could not find the '([^']+)' column/i);
      const missing = match?.[1];
      if (!missing || !(missing in candidate)) {
        throw error;
      }
      delete candidate[missing];
    }
    return false;
  }, [plan.id]);

  const handleChannelAvailability = useCallback(async (next: "active" | "frozen" | "deleted") => {
    const action = next === "deleted" ? "delete" : "freeze";
    setChannelActionLoading(action);
    try {
      await updatePlanMeta({
        availability_status: next,
        deleted_by_creator: next === "deleted",
        is_enabled: next === "active",
      });
      toast.success(next === "frozen" ? "Canal congelado" : next === "deleted" ? "Canal marcado como excluído" : "Canal reativado");
      queryClient.invalidateQueries({ queryKey: ["vitrine-plans"] });
      queryClient.invalidateQueries({ queryKey: ["my-vip-plan"] });
      if (next === "deleted") onOpenChange(false);
    } catch (e: any) {
      toast.error("Falha ao atualizar o canal", { description: e?.message });
    } finally {
      setChannelActionLoading(null);
    }
  }, [onOpenChange, queryClient, updatePlanMeta]);

  const handleApplyGlobalBlur = useCallback(async (next: BlurLevel) => {
    if (!paidPosts.length) {
      toast.info("Nenhum card encontrado para aplicar o blur geral");
      return;
    }
    setChannelActionLoading("blur");
    try {
      const ids = paidPosts.map((post) => post.id);
      const { error } = await (supabase as any)
        .from("posts")
        .update({ preview_blur: next })
        .in("id", ids);
      if (error) throw error;
      toast.success(`Blur geral atualizado para ${BLUR_LEVELS.find((b) => b.value === next)?.label.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["creator-paid-content", plan.profile_id] });
    } catch (e: any) {
      toast.error("Falha ao aplicar blur geral", { description: e?.message });
    } finally {
      setChannelActionLoading(null);
    }
  }, [paidPosts, plan.profile_id, queryClient]);

  const handleCancel = async () => {
    if (!mySub) return;
    if (!confirm(`Cancelar a assinatura de "${creatorName}"? Você manterá o acesso até o vencimento atual.`)) {
      return;
    }
    try {
      await cancelSub.mutateAsync(mySub.id);
      toast.success("Assinatura cancelada");
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["is-subscribed"] });
    } catch (e: any) {
      toast.error("Falha ao cancelar", { description: e?.message });
    }
  };

  const bannerStyle = plan.banner_url
    ? { backgroundImage: `url(${plan.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(135deg, hsl(var(--primary)/0.4), hsl(var(--secondary)/0.4))" };

  const hasGlobalAccess = !!isSubscribed;

  return (
    <>
      <Dialog open={open && !showSubscribe} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            // Mobile: tela cheia. SM+: modal centralizado.
            "p-0 gap-0 overflow-hidden bg-card border-border flex flex-col",
            "w-screen h-[100dvh] max-w-none rounded-none",
            "sm:w-[98vw] sm:max-w-5xl sm:h-[92dvh] sm:rounded-lg",
          )}
        >
          <DialogTitle className="sr-only">{plan.title}</DialogTitle>

          {/* Banner / hero — menor no mobile para economizar pixels e GPU */}
          <div className="relative h-32 sm:h-56 flex-shrink-0" style={bannerStyle}>
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-card/60 via-transparent to-transparent" />

            <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
              {onBack ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-2 bg-background/80"
                  onClick={onBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="ml-1 text-xs hidden sm:inline">Vitrine</span>
                </Button>
              ) : <div />}
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 p-0 bg-background/80"
                onClick={() => onOpenChange(false)}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="absolute bottom-2 left-3 right-3 sm:bottom-3 sm:left-4 sm:right-4 z-10 flex items-end gap-2 sm:gap-3">
              <Avatar className="h-12 w-12 sm:h-20 sm:w-20 ring-2 sm:ring-4 ring-card shadow-xl flex-shrink-0">
                <AvatarImage src={plan.creator.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/30 text-primary text-base sm:text-xl font-bold">
                  {creatorName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <Badge className="mb-0.5 sm:mb-1 bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)] gap-1 text-[9px] sm:text-[10px]">
                  <Crown className="h-3 w-3" /> Canal VIP
                </Badge>
                <h2 className="text-base sm:text-2xl font-extrabold text-foreground leading-tight drop-shadow truncate">
                  {plan.title}
                </h2>
                <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-sm text-muted-foreground">
                  <span className="truncate">por {creatorName}</span>
                  {plan.creator.is_verified && (
                    <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary fill-primary/30 flex-shrink-0" />
                  )}
                  {plan.creator.username && (
                    <Link
                      to={`/c/${plan.creator.username}`}
                      onClick={() => onOpenChange(false)}
                      className="ml-1 inline-flex items-center gap-1 text-[11px] sm:text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Perfil
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Body: sidebar empilhada no mobile, lateral no desktop */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Sidebar */}
            <aside className={cn(
              "md:w-80 md:border-r md:border-border/40",
              "p-3 sm:p-4 space-y-2.5 sm:space-y-3 bg-muted/10 flex-shrink-0",
              "border-b md:border-b-0 overflow-y-auto",
            )}>
              {/* Descrição completa do canal */}
              {plan.bio && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground leading-snug whitespace-pre-line break-words">
                    {plan.bio}
                  </p>
                </div>
              )}

              {(status !== "active" || canAuditDeleted) && (
                <div className="flex flex-wrap gap-2">
                  {status === "frozen" && (
                    <Badge variant="outline" className="text-[10px] border-secondary text-secondary-foreground">
                      Conteúdo temporariamente indisponível
                    </Badge>
                  )}
                  {status === "deleted" && (
                    <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                      Excluído pelo criador
                    </Badge>
                  )}
                  {canAuditDeleted && (
                    <Badge variant="outline" className="text-[10px] border-primary text-primary">
                      Auditoria master liberada
                    </Badge>
                  )}
                </div>
              )}

              {/* Assinantes */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Assinantes
                </span>
                <span className="text-sm font-bold text-foreground">{subscribersCount}</span>
              </div>

              <div className="rounded-lg border border-border/50 bg-background/50 p-3 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Mensal</span>
                  <span className="text-base font-extrabold text-[hsl(45,93%,55%)]">
                    {fmt(plan.monthly_price)}
                  </span>
                </div>
                {plan.annual_price && (
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      Anual
                      {annualDiscount > 0 && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-emerald-500/40 text-emerald-500">
                          {annualDiscount}% Desc.
                        </Badge>
                      )}
                    </span>
                    <span className="font-semibold text-foreground">{fmt(plan.annual_price)}</span>
                  </div>
                )}
                {plan.lifetime_price && (
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Vitalício</span>
                    <span className="font-semibold text-foreground">{fmt(plan.lifetime_price)}</span>
                  </div>
                )}
              </div>

              {canManageChannel && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                      Ações do canal
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => handleChannelAvailability(status === "frozen" ? "active" : "frozen")}
                      disabled={channelActionLoading !== null}
                    >
                      <Snowflake className="mr-2 h-4 w-4" />
                      {status === "frozen" ? "Reativar canal" : "Congelar canal"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Blur geral
                    </div>
                    <DropdownMenuRadioGroup
                      value={channelBlurValue}
                      onValueChange={(value) => handleApplyGlobalBlur(value as BlurLevel)}
                    >
                      {BLUR_LEVELS.map((opt) => (
                        <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleChannelAvailability("deleted")}
                      disabled={channelActionLoading !== null}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir canal
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {hasGlobalAccess ? (
                <>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-xs text-emerald-300 font-medium">Você é assinante</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={handleCancel}
                    disabled={cancelSub.isPending || !mySub}
                  >
                    {cancelSub.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Cancelar assinatura
                  </Button>
                </>
              ) : (
                <>
                  <BetaMonetizationBanner feature="subscriptions" compact />
                  <Button
                    className="w-full bg-gradient-to-r from-primary to-secondary text-sm font-bold gap-1.5 h-10 disabled:opacity-60"
                    onClick={() => subGuard(() => setShowSubscribe(true))}
                    disabled={!user || betaSubLocked}
                  >
                    {betaSubLocked ? <Lock className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                    {betaSubLocked ? subLockedLabel : 'Assinar canal'}
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5"
                onClick={toggleFav}
              >
                <Heart className={cn("h-3.5 w-3.5", fav && "fill-rose-500 text-rose-500")} />
                {fav ? "Favoritado" : "Favoritar canal"}
              </Button>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md bg-background/40 border border-border/40 p-2">
                  <div className="text-[10px] text-muted-foreground">Vídeos</div>
                  <div className="text-sm font-bold text-foreground">{videos.length}</div>
                </div>
                <div className="rounded-md bg-background/40 border border-border/40 p-2">
                  <div className="text-[10px] text-muted-foreground">Imagens</div>
                  <div className="text-sm font-bold text-foreground">{images.length}</div>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground leading-snug">
                Assine para liberar tudo — ou compre cada conteúdo avulso pelo valor definido pelo criador.
              </p>
            </aside>

            {/* Content sections — agrupadas por tipo (mesmas seções do "Adicionar conteúdo pago") */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-3 sm:p-4 space-y-5 sm:space-y-6">
                {SECTION_DEFS.map((sec) => {
                  const items = postsBySection[sec.key] || [];
                  if (!loadingContent && items.length === 0) return null;
                  const Icon = sec.icon === "video" ? Film : ImageIcon;
                  return (
                    <Section
                      key={sec.key}
                      title={sec.title}
                      icon={<Icon className="h-4 w-4 text-primary" />}
                      count={items.length}
                      loading={loadingContent}
                    >
                      <MediaGrid
                        items={items}
                        accessMap={accessMap}
                        hasGlobalAccess={hasGlobalAccess}
                        isOwner={isOwner}
                        kind={sec.icon}
                        onBuy={(p) => ppvGuard(() => setBuyTarget(p))}
                      />
                    </Section>
                  );
                })}
                {!loadingContent && paidPosts.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
                    Este criador ainda não publicou conteúdos pagos ou exclusivos.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <PlanSubscribeModal
        open={showSubscribe}
        onOpenChange={(v) => {
          setShowSubscribe(v);
          if (!v) {
            queryClient.invalidateQueries({ queryKey: ["is-subscribed"] });
            queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
            queryClient.invalidateQueries({ queryKey: ["creator-subscribers-count"] });
          }
        }}
        plan={plan}
      />

      {/* Compra avulsa de conteúdo */}
      {buyTarget && (
        <PaidContentCheckoutModal
          open={!!buyTarget}
          onOpenChange={(v) => {
            if (!v) {
              setBuyTarget(null);
              queryClient.invalidateQueries({ queryKey: ["media-access-batch"] });
            }
          }}
          postId={buyTarget.postId}
          price={buyTarget.price}
          sellerName={creatorName}
        />
      )}
    </>
  );
}

function Section({
  title,
  icon,
  count,
  loading,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count}</Badge>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-square rounded-md bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function MediaGrid({
  items,
  accessMap,
  hasGlobalAccess,
  isOwner,
  kind,
  onBuy,
}: {
  items: PaidPostRow[];
  accessMap: Record<string, boolean>;
  hasGlobalAccess: boolean;
  isOwner: boolean;
  kind: "video" | "image";
  onBuy: (p: { postId: string; price: number }) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
        Nenhum {kind === "video" ? "vídeo" : "imagem"} publicado neste canal ainda.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {items.map((it) => (
        <MediaThumb
          key={it.id}
          item={it}
          unlocked={hasGlobalAccess || !!accessMap[it.id]}
          unlockedReason={hasGlobalAccess ? "subscriber" : (accessMap[it.id] ? "purchased" : null)}
          isOwner={isOwner}
          kind={kind}
          onBuy={onBuy}
        />
      ))}
    </div>
  );
}

function BlurPicker({
  postId,
  current,
}: {
  postId: string;
  current: BlurLevel;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<BlurLevel>(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(current); }, [current]);

  const update = async (next: BlurLevel) => {
    if (saving || next === value) return;
    setSaving(true);
    const prev = value;
    setValue(next); // otimista
    const { error } = await (supabase as any)
      .from("posts")
      .update({ preview_blur: next })
      .eq("id", postId);
    setSaving(false);
    if (error) {
      setValue(prev);
      toast.error("Falha ao salvar blur");
      return;
    }
    toast.success("Blur atualizado");
    queryClient.invalidateQueries({ queryKey: ["creator-paid-content"] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute bottom-1 right-1 z-30 inline-flex items-center gap-1 px-1.5 py-1 rounded-full bg-black/70 hover:bg-black/85 text-white text-[9px] font-semibold border border-white/15 active:scale-95 transition-transform"
          title="Ajustar blur do preview"
          onClick={(e) => e.stopPropagation()}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sliders className="h-3 w-3" />}
          <span className="hidden sm:inline">Blur</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-44 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Blur do preview
        </div>
        {BLUR_LEVELS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => update(opt.value)}
            className={cn(
              "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-accent",
              value === opt.value && "bg-accent",
            )}
          >
            <span>{opt.label}</span>
            {value === opt.value && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function MediaThumb({
  item,
  unlocked,
  unlockedReason,
  isOwner,
  kind,
  onBuy,
}: {
  item: PaidPostRow;
  unlocked: boolean;
  unlockedReason: "subscriber" | "purchased" | null;
  isOwner: boolean;
  kind: "video" | "image";
  onBuy: (p: { postId: string; price: number }) => void;
}) {
  const price = Number(item.unlock_price ?? item.paid_price) || 0;
  const isLocked = !unlocked;
  const blurLevel = normalizeBlur(item.preview_blur);
  const blurClass = isLocked ? BLUR_CLASS[blurLevel] : "";

  return (
    <div className="relative aspect-square rounded-md overflow-hidden bg-muted/30 border border-border/40 group">
      {kind === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          {item.media_url && unlocked ? (
            <video
              src={item.media_url}
              preload="none"
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : null}
          {isLocked && (
            <div
              className={cn("absolute inset-0 bg-cover bg-center", blurClass)}
              style={item.media_url ? { backgroundImage: `url(${item.media_url}#t=0.1)` } : undefined}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <Play className="relative z-10 h-7 w-7 text-white/90 drop-shadow" />
        </div>
      ) : (
        item.media_url && (
          <img
            src={item.media_url}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 w-full h-full object-cover",
              blurClass,
            )}
          />
        )
      )}

      {/* Preço sempre visível no canto, mesmo bloqueado, para clareza */}
      {price > 0 && (
        <Badge className="absolute top-1 left-1 z-10 text-[9px] px-1.5 py-0 bg-black/70 text-white border border-white/10">
          {fmt(price)}
        </Badge>
      )}

      {isLocked && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 px-2 text-center gap-1">
          <Lock className="h-4 w-4 text-white" />
          {price > 0 ? (
            <button
              type="button"
              className="text-[10px] font-semibold text-white inline-flex items-center gap-1 bg-primary hover:bg-primary/90 px-2 py-1 rounded-full active:scale-95 transition-transform"
              onClick={() => onBuy({ postId: item.id, price })}
            >
              <ShoppingCart className="h-3 w-3" /> Comprar {fmt(price)}
            </button>
          ) : (
            <span className="text-[10px] text-white/80">Exclusivo de assinantes</span>
          )}
        </div>
      )}

      {!isLocked && (
        <Badge
          className={cn(
            "absolute top-1 right-1 z-10 text-[9px] px-1.5 py-0",
            unlockedReason === "subscriber"
              ? "bg-emerald-500/90 text-emerald-50"
              : "bg-primary/90 text-primary-foreground",
          )}
        >
          {unlockedReason === "subscriber" ? "Assinante" : "Comprado"}
        </Badge>
      )}

      {/* Controle de blur — apenas para o criador dono do canal */}
      {isOwner && <BlurPicker postId={item.id} current={blurLevel} />}
    </div>
  );
}
