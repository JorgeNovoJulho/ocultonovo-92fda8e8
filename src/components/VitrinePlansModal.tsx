import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Crown, CheckCircle2, Loader2, Store, Users, FileImage,
  PlayCircle, Tv2, Sparkles, RefreshCw, Volume2, VolumeX, Plus, Rocket,
  CreditCard, Calendar,
} from "lucide-react";
import type { PlanWithCreator } from "./PlanSubscribeModal";
import { useProfile } from "@/hooks/useProfile";
import { CreatorChannelVipUpgradeModal } from "./CreatorChannelVipUpgradeModal";
import { cn } from "@/lib/utils";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { getAnnualDiscountPercent } from "@/lib/creatorPlanPersistence";
import { buildChannelRoute } from "@/lib/channelRoute";

const parseMissingColumn = (error: any): string | null => {
  const message = String(error?.message || "");
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

interface PlanWithStats extends PlanWithCreator {
  subscribers_count: number;
  items_count: number;
  availability_status?: "active" | "frozen" | "deleted" | string | null;
  deleted_by_creator?: boolean | null;
}

/** Buscar planos com fallback robusto para sort_order ausente. */
async function fetchVitrinePlans(): Promise<any[]> {
  const buildBase = () => (supabase as any).from("subscription_plans").select("*");

  let res = await buildBase().order("sort_order", { ascending: true });
  if (res.error) {
    const msg = String(res.error.message || "").toLowerCase();
    const sortMissing = parseMissingColumn(res.error) === "sort_order" || /sort_order/.test(msg);
    const enabledMissing = parseMissingColumn(res.error) === "is_enabled" || /is_enabled/.test(msg);

    if (enabledMissing) {
      const fallbackBase = () => (supabase as any).from("subscription_plans").select("*");
      res = await fallbackBase().order("sort_order", { ascending: true });
      if (res.error) {
        const fallbackMsg = String(res.error.message || "").toLowerCase();
        if (parseMissingColumn(res.error) === "sort_order" || /sort_order/.test(fallbackMsg)) {
          res = await fallbackBase().order("created_at", { ascending: false });
        }
      }
    } else if (sortMissing || /could not find/.test(msg)) {
      res = await buildBase().order("created_at", { ascending: false });
    }
  }
  if (res.error) {
    const msg = String(res.error.message || "").toLowerCase();
    if (/does not exist|could not find/.test(msg)) {
      res = await buildBase();
    }
  }
  if (res.error) throw res.error;

  return (res.data || []).filter((plan: any) => {
    const enabled = plan?.is_enabled;
    const active = plan?.is_active;
    if (typeof enabled === "boolean") return enabled;
    if (typeof active === "boolean") return active;
    return true;
  });
}

function usePlansVitrine() {
  return useQuery({
    queryKey: ["vitrine-plans"],
    queryFn: async (): Promise<PlanWithStats[]> => {
      const plans = await fetchVitrinePlans();
      if (plans.length === 0) return [];

      const profileIds = [...new Set(plans.map((p: any) => p.profile_id))];

      // 1) Profiles
      const { data: profilesById } = await supabase
        .from("profiles")
        .select("id, user_id, name, username, avatar_url, is_verified")
        .in("id", profileIds as string[]);

      const missingProfileIds = profileIds.filter(
        (id) => !(profilesById || []).some((profile) => profile.id === id),
      );

      let profilesByUserId: any[] = [];
      if (missingProfileIds.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, user_id, name, username, avatar_url, is_verified")
          .in("user_id", missingProfileIds as string[]);
        profilesByUserId = data || [];
      }

      const profileMap = new Map<string, any>();
      [...(profilesById || []), ...profilesByUserId].forEach((profile) => {
        if (profile.id) profileMap.set(profile.id, profile);
        if (profile.user_id) profileMap.set(profile.user_id, profile);
      });

      // 2) Subscribers count por criador (assinaturas ativas)
      const subsMap = new Map<string, number>();
      try {
        const { data: subs } = await (supabase as any)
          .from("subscriptions")
          .select("creator_id")
          .in("creator_id", profileIds as string[])
          .eq("status", "active");
        for (const s of (subs || []) as any[]) {
          subsMap.set(s.creator_id, (subsMap.get(s.creator_id) || 0) + 1);
        }
      } catch {
        // tabela pode não existir — segue com zero
      }

      // 3) Items count (posts VIP do criador)
      const itemsMap = new Map<string, number>();
      try {
        const { data: postsCounts } = await (supabase as any)
          .from("posts")
          .select("creator_id, id")
          .in("creator_id", profileIds as string[])
          .in("privacy_level", ["vip", "subscribers"]);
        for (const p of (postsCounts || []) as any[]) {
          itemsMap.set(p.creator_id, (itemsMap.get(p.creator_id) || 0) + 1);
        }
      } catch {
        // ignorar
      }

      return plans
        .map((plan: any) => {
          const creator = profileMap.get(plan.profile_id);
          if (!creator && !plan.profile_id) return null;

          const fallbackCreator = creator ?? {
            id: plan.profile_id,
            name: plan.creator_username ? `@${plan.creator_username}` : (plan.username ? `@${plan.username}` : "Criador VIP"),
            username: plan.creator_username ?? null,
            avatar_url: plan.creator_avatar_url ?? null,
            is_verified: false,
          };

          return {
            ...plan,
            creator: fallbackCreator,
            subscribers_count: subsMap.get(plan.profile_id) || 0,
            items_count: itemsMap.get(plan.profile_id) || 0,
          };
        })
        .filter(Boolean) as PlanWithStats[];
    },
    staleTime: 30_000,
  });
}

/** Card Netflix-like: capa por padrão, trailer apenas no hover, com toggle de áudio. */
function PlanCard({
  plan,
  isActive,
  onActivate,
  onDeactivate,
  onClick,
}: {
  plan: PlanWithStats;
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onClick: () => void;
}) {
  const introKind = (plan as any).intro_kind as "video" | "image" | "gif" | null | undefined;
  const introUrl = (plan as any).intro_url as string | undefined;
  const introPoster = (plan as any).intro_poster as string | undefined;
  const hasVideoTrailer = !!introUrl && introKind === "video";

  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const status = (plan.availability_status || "active") as string;
  const isFrozen = status === "frozen";
  const isDeleted = status === "deleted" || plan.deleted_by_creator;

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, isActive]);

  const showTrailer = hasVideoTrailer && isActive;
  const coverUrl = plan.banner_url || introPoster || null;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => hasVideoTrailer && onActivate()}
      onMouseLeave={() => hasVideoTrailer && onDeactivate()}
      className={cn(
        "group relative text-left rounded-xl overflow-hidden border border-border/40",
        "bg-card hover:border-primary/60 transition-all",
        "focus:outline-none focus:ring-2 focus:ring-primary",
        "flex flex-col",
        isActive && "ring-2 ring-primary/70 border-primary/60",
      )}
    >
      {/* Cover / trailer */}
      <div className="relative aspect-video w-full bg-muted overflow-hidden">
        {coverUrl && (
          <img
            src={coverUrl}
            alt={plan.title}
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
              showTrailer ? "opacity-0" : "opacity-100",
            )}
          />
        )}
        {!coverUrl && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-secondary/20 to-background" />
        )}

        {/* Trailer (renderizado só quando ativo — perf) */}
        {showTrailer && introUrl && (
          <video
            ref={videoRef}
            key={`trailer-${plan.id}`}
            src={introUrl}
            poster={introPoster || plan.banner_url || undefined}
            autoPlay
            muted={muted}
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Indicators */}
        {hasVideoTrailer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="absolute top-2 left-2 z-10 bg-black/70 text-white text-[10px] px-1.5 py-0 gap-1 backdrop-blur-sm">
                <PlayCircle className="h-3 w-3" />
                Trailer
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">Passe o mouse para ver o trailer</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="absolute top-2 right-2 z-10 bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)] text-[10px] px-1.5 py-0 gap-1">
              <Crown className="h-3 w-3" /> VIP
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">Canal exclusivo VIP</TooltipContent>
        </Tooltip>
        {isFrozen && (
          <Badge className="absolute bottom-2 left-2 z-10 bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0">
            Indisponível
          </Badge>
        )}
        {isDeleted && (
          <Badge className="absolute bottom-2 left-2 z-10 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0">
            Excluído pelo criador
          </Badge>
        )}

        {/* Mute toggle (somente quando trailer ativo) */}
        {showTrailer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); e.stopPropagation(); setMuted((m) => !m);
                  }
                }}
                className="absolute bottom-12 right-2 z-20 inline-flex items-center justify-center h-7 w-7 rounded-full bg-black/70 text-white hover:bg-black/90 backdrop-blur-sm cursor-pointer"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">{muted ? "Ativar som" : "Silenciar"}</TooltipContent>
          </Tooltip>
        )}

        {/* Bottom overlay info */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-2 bg-gradient-to-t from-black/85 via-black/30 to-transparent">
          <div className="flex items-end gap-2">
            <Avatar className="h-8 w-8 ring-2 ring-white/70 shadow flex-shrink-0">
              <AvatarImage src={plan.creator.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                {(plan.creator.username || "?")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm leading-tight drop-shadow truncate">
                {plan.title}
              </p>
              <div className="flex items-center gap-1 min-w-0">
                <p className="text-white/80 text-[11px] truncate drop-shadow">
                  {plan.creator.username ? `@${plan.creator.username}` : "@criador"}
                </p>
                {plan.creator.is_verified && (
                  <CheckCircle2 className="h-3 w-3 text-primary fill-primary/40 flex-shrink-0" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="p-2.5 flex flex-col gap-1.5 bg-card">
        {plan.bio && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
            {plan.bio}
          </p>
        )}

        {/* Renovação */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>{(plan as any).annual_price ? "Renovação anual" : "Renovação mensal"}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5">
                <Users className="h-3 w-3" />
                {plan.subscribers_count}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Assinantes ativos</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5">
                <FileImage className="h-3 w-3" />
                {plan.items_count}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Conteúdos publicados no canal</TooltipContent>
          </Tooltip>
        </div>

        {/* Linha Mensal */}
        <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <CreditCard className="h-3 w-3 text-[hsl(45,93%,47%)]" />
            <span>Mensal</span>
          </div>
          <span className="font-bold text-[hsl(45,93%,55%)]">
            {formatCurrency(plan.monthly_price)}
          </span>
        </div>

        {/* Linha Anual (se existir) */}
        {(plan as any).annual_price && (() => {
          const annual = Number((plan as any).annual_price);
          const discount = getAnnualDiscountPercent(plan.monthly_price, annual);
          return (
            <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1 text-[11px]">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3 text-green-400" />
                <span>Anual</span>
                {discount > 0 && (
                  <Badge className="ml-1 px-1.5 py-0 h-4 text-[9px] font-bold bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/40">
                    {discount}% Desc.
                  </Badge>
                )}
              </div>
              <span className="font-semibold text-foreground">{formatCurrency(annual)}</span>
            </div>
          );
        })()}
      </div>
    </button>
  );
}

/** Card fixo na primeira posição: Crie seu canal de conteúdo. */
function CreateChannelCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-xl overflow-hidden",
        "border-2 border-dashed border-primary/50 hover:border-primary",
        "bg-gradient-to-br from-primary/10 via-secondary/10 to-background",
        "transition-all hover:shadow-[0_0_24px_hsl(var(--primary)/0.25)]",
        "focus:outline-none focus:ring-2 focus:ring-primary",
        "flex flex-col",
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,hsl(var(--primary)/0.25),transparent_60%),radial-gradient(circle_at_70%_70%,hsl(var(--secondary)/0.25),transparent_60%)]" />
        <div className="relative flex flex-col items-center gap-2 text-center px-3">
          <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/40">
            <Plus className="h-6 w-6 text-primary" />
          </div>
          <Badge className="bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)] text-[10px] gap-1">
            <Crown className="h-3 w-3" /> Recurso VIP
          </Badge>
        </div>
        <Badge className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-[10px] gap-1">
          <Rocket className="h-3 w-3" /> Novo
        </Badge>
      </div>
      <div className="p-2.5 flex flex-col gap-1 bg-card">
        <p className="font-bold text-sm text-foreground leading-tight">
          Crie seu canal de conteúdo
        </p>
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
          Monte seu canal VIP em minutos: capa, trailer, planos e ganhos recorrentes.
        </p>
        <div className="flex items-center justify-end pt-1">
          <span className="text-[11px] font-semibold text-primary inline-flex items-center gap-1">
            Começar agora <Sparkles className="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function VitrinePlansModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { data: isMasterAdmin = false } = useIsMasterAdmin();
  const [search, setSearch] = useState("");
  const [unavailablePlan, setUnavailablePlan] = useState<PlanWithStats | null>(null);
  const [activeTrailerId, setActiveTrailerId] = useState<string | null>(null);
  const [showVipUpgrade, setShowVipUpgrade] = useState(false);
  const { data: plans = [], isLoading, isFetching, refetch } = usePlansVitrine();

  // Quando o modal abre, refetch imediato para refletir planos recém-criados
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const visiblePlans = plans.filter((p) => {
      const status = (p.availability_status || "active") as string;
      const isDeleted = status === "deleted" || p.deleted_by_creator;
      if (isDeleted) return isMasterAdmin;
      if (status === "frozen") return true;
      if (typeof p.is_enabled === "boolean") return p.is_enabled;
      return true;
    });

    if (!q) return visiblePlans;
    return visiblePlans.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.creator.username || "").toLowerCase().includes(q) ||
        (p.creator.username || "").toLowerCase().includes(q) ||
        (p.bio || "").toLowerCase().includes(q),
    );
  }, [plans, search, isMasterAdmin]);

  const activate = useCallback((id: string) => {
    setActiveTrailerId((prev) => (prev === id ? prev : id));
  }, []);
  const deactivate = useCallback((id: string) => {
    setActiveTrailerId((prev) => (prev === id ? null : prev));
  }, []);

  const handleCreateChannel = useCallback(() => {
    const isVip = !!(profile?.is_vip || profile?.plan_type === "vip");
    if (isVip) {
      onOpenChange(false);
      navigate("/canal-vip");
    } else {
      // Free / Premium → modal de upgrade VIP focado em "Crie seu canal"
      setShowVipUpgrade(true);
    }
  }, [profile, navigate, onOpenChange]);

  const handleOpenPlan = useCallback((plan: PlanWithStats) => {
    const status = (plan.availability_status || "active") as string;
    const creator = (plan as any).creator || {};
    const isOwner = !!(profile?.id && plan.profile_id === profile.id);
    const isDeleted = status === "deleted" || plan.deleted_by_creator;

    if (isDeleted && !isMasterAdmin && !isOwner) return;

    if (status === "frozen" && !isOwner && !isMasterAdmin) {
      setUnavailablePlan(plan);
      return;
    }

    onOpenChange(false);
    navigate(buildChannelRoute({
      ownerId: creator.id || plan.profile_id,
      ownerUserId: creator.user_id || null,
      ownerUsername: creator.username || null,
      ownerName: creator.name || null,
      channelId: plan.id,
      channelTitle: plan.title,
    }));
  }, [isMasterAdmin, navigate, onOpenChange, profile?.id]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-0.75rem)] sm:w-[calc(100vw-2rem)] max-w-6xl max-h-[95dvh] sm:max-h-[92dvh] flex flex-col p-0 gap-0 bg-card border-border overflow-hidden rounded-xl sm:rounded-2xl">
          <DialogHeader className="shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b border-border/40">
            <DialogTitle className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base flex-wrap">
              <div className="p-1 sm:p-1.5 rounded-lg bg-primary/10 shrink-0">
                <Tv2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
              </div>
              <span className="truncate">Vitrine de Canais VIP</span>
              <Badge variant="outline" className="text-[10px] ml-0.5">
                {plans.length}
              </Badge>
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </DialogTitle>
            <DialogDescription className="text-[11px] sm:text-xs leading-snug">
              Explore canais exclusivos. Toque/clique no card para abrir o canal do criador.
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="shrink-0 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/20 flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar canal, criador…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm bg-muted/30"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1 shrink-0 px-2.5"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              <span className="hidden sm:inline text-xs">Atualizar</span>
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 sm:px-4 py-3 sm:py-4" style={{ scrollbarWidth: "none" }}>
            {isLoading ? (
              <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="aspect-video rounded-xl bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  <CreateChannelCard onClick={handleCreateChannel} />
                </div>
                <EmptyState
                  hasSearch={!!search}
                  totalPlans={plans.length}
                  onClear={() => setSearch("")}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                {!search && <CreateChannelCard onClick={handleCreateChannel} />}
                {filtered.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isActive={activeTrailerId === plan.id}
                    onActivate={() => activate(plan.id)}
                    onDeactivate={() => deactivate(plan.id)}
                    onClick={() => handleOpenPlan(plan)}
                  />
                ))}
              </div>
            )}
          </div>

          {!isLoading && filtered.length > 0 && (
            <div className="shrink-0 px-4 py-2 border-t border-border/20 text-center">
              <p className="text-[11px] text-muted-foreground">
                {filtered.length} canal{filtered.length !== 1 ? "is" : ""} disponíve{filtered.length !== 1 ? "is" : "l"} · ordenados por destaque
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Drawer */}
      <Dialog open={!!unavailablePlan} onOpenChange={(v) => !v && setUnavailablePlan(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-sm bg-card border-border rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Canal temporariamente indisponível</DialogTitle>
            <DialogDescription>
              O criador marcou este conteúdo como temporariamente indisponível. Volte mais tarde.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* VIP Upgrade — fluxo "Crie seu canal" para Free/Premium */}
      <CreatorChannelVipUpgradeModal
        open={showVipUpgrade}
        onOpenChange={setShowVipUpgrade}
      />
    </>
  );
}

function EmptyState({
  hasSearch,
  totalPlans,
  onClear,
}: {
  hasSearch: boolean;
  totalPlans: number;
  onClear: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">Nenhum canal encontrado</p>
        <p className="text-xs text-muted-foreground mb-3">
          Tente outro termo ou limpe a busca para ver todos os {totalPlans} canais disponíveis.
        </p>
        <Button size="sm" variant="outline" onClick={onClear}>Limpar busca</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4 max-w-md mx-auto">
      <div className="p-4 rounded-full bg-primary/10 mb-3">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <p className="text-base font-bold text-foreground mb-1">
        Nenhum plano encontrado
      </p>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        Ainda não há canais VIP publicados. Se você é criador, configure seu canal em segundos e
        comece a receber assinaturas — banner, capa, trailer e preço definido por você.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <Button
          asChild
          size="sm"
          className="bg-gradient-to-r from-primary to-secondary text-xs"
        >
          <a href="/canal-vip">
            <Crown className="h-3.5 w-3.5 mr-1" /> Configurar meu canal VIP
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="text-xs">
          <a href="/subscriptions">
            <Store className="h-3.5 w-3.5 mr-1" /> Gerenciar planos
          </a>
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-4">
        Após criar seu plano, ele aparece aqui em tempo real.
      </p>
    </div>
  );
}
