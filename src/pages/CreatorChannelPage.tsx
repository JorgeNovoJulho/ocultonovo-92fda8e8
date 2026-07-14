import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft, Crown, Lock, Play, Image as ImageIcon, Package,
  Calendar, Sparkles, ShoppingCart, Users, Plus, Film, Video, Images,
  Eye, EyeOff, MoreVertical, Pencil, Trash2, Snowflake, Flag, AlertCircle,
  Tag, Ticket, BookOpen, BookMarked, Notebook, FileText, Library,
  Pin, PinOff, Share2, Infinity as InfinityIcon,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useChannelAffiliateRef } from "@/hooks/useChannelAffiliateRef";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useBatchMediaAccess } from "@/hooks/useMediaAccess";
import QuickSignupModal from "@/components/creator/QuickSignupModal";
import { PurchaseMethodChooserModal, type PurchaseMethod } from "@/components/PurchaseMethodChooserModal";
import { PaidContentCheckoutModal } from "@/components/PaidContentCheckoutModal";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeChannelToken } from "@/lib/channelRoute";
import { CachedImage } from "@/components/common/CachedImage";
import { BetaVipNoticeModal } from "@/components/beta/BetaVipNoticeModal";
import { BetaVipChannelBanner } from "@/components/beta/BetaVipChannelBanner";
import { useMockChannelSubscriptions } from "@/hooks/useMockChannelSubscriptions";
import { getMockSubStatus } from "@/lib/mockChannelSubscriptions";

const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

function isSubscriptionCurrentlyActive(row: { status?: string | null; expires_at?: string | null }) {
  const status = String(row.status || "").toLowerCase();
  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number])) {
    return false;
  }
  if (!row.expires_at) return true;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function normalizeSubscriberCountKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

const AddPaidContentModal = lazy(() => import("@/components/creator/AddPaidContentModal"));
const AddNarrativeContentModal = lazy(() => import("@/components/creator/AddNarrativeContentModal"));
const DiaryBlogEditorModal = lazy(() => import("@/components/creator/DiaryBlogEditorModal"));
const ChannelContentViewer = lazy(() => import("@/components/creator/ChannelContentViewer"));
const EditPaidContentModal = lazy(() => import("@/components/creator/EditPaidContentModal"));
const CreatorAffiliateManagerModal = lazy(() => import("@/components/creator/CreatorAffiliateManagerModal"));
const CreatorCouponsPanel = lazy(() => import("@/components/creator/CreatorCouponsPanel"));
const PublicCouponsList = lazy(() => import("@/components/creator/PublicCouponsList"));
const ContinueReadingStrip = lazy(() => import("@/components/creator/ContinueReadingStrip"));
import { CreateEventModal } from "@/components/events/CreateEventModal";
import { PlanSubscribeModal, type PlanWithCreator } from "@/components/PlanSubscribeModal";
import { SubscriptionStatusBadge } from "@/components/SubscriptionStatusBadge";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";
import ChannelSubscribersCard from "@/components/creator/ChannelSubscribersCard";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';


type CreatorBundle = {
  profile: any;
  plans: any[];
  posts: any[];
  selectedPlan: any | null;
};

type SectionKey =
  | "short_video" | "long_video" | "photo" | "photo_pack" | "video_pack" | "events" | "promo"
  | "story" | "chapter" | "diary" | "article" | "series" | "text_post";

const NARRATIVE_KEYS = new Set<SectionKey>(["story", "chapter", "diary", "article", "series", "text_post"]);

function useCreatorChannel(creatorId?: string, planId?: string | null, channelToken?: string | null) {
  return useQuery({
    queryKey: ["creator-channel", creatorId, planId, channelToken],
    enabled: !!creatorId,
    staleTime: 60_000,
    queryFn: async (): Promise<CreatorBundle> => {
      const tries = await Promise.all([
        (supabase as any).from("profiles").select("*").eq("id", creatorId!).maybeSingle(),
        (supabase as any).from("profiles").select("*").eq("user_id", creatorId!).maybeSingle(),
        (supabase as any).from("profiles").select("*").eq("username", creatorId!).maybeSingle(),
      ]);
      const profile = tries.find((r) => r.data)?.data;
      if (!profile) throw new Error("Criador não encontrado");

      const { data: plans } = await (supabase as any)
        .from("subscription_plans")
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: true });

      const requestedChannel = normalizeChannelToken(channelToken);
      const resolvedPlans = plans || [];
      const selectedPlan = resolvedPlans.find((plan: any) => planId && plan.id === planId)
        || resolvedPlans.find((plan: any) => requestedChannel && normalizeChannelToken(plan.title || "") === requestedChannel)
        || resolvedPlans[0]
        || null;

      // Inclui também posts narrativos (Diário VIP, capítulos, séries, histórias,
      // textos, bastidores) mesmo quando o autor escolheu "Público" — assim o
      // card aparece no canal e o deep-link `?post=` consegue abrir o leitor.
      const { data: posts } = await (supabase as any)
        .from("posts")
        .select("*")
        .eq("author_id", profile.id)
        .or(
          "is_paid.eq.true,privacy_level.eq.vip,section_type.in.(story,chapter,diary,article,series,text_post),content_format.eq.narrative"
        )
        .order("created_at", { ascending: false })
        .limit(120);

      return { profile, plans: resolvedPlans, posts: posts || [], selectedPlan };
    },
  });
}

function categorize(posts: any[]): Record<SectionKey, any[]> {
  const isVideo = (p: any) => p.media_type === "video" || /\.(mp4|webm|mov)$/i.test(p.media_url || "");
  const isImage = (p: any) => p.media_type === "image" || (!!p.media_url && !isVideo(p));
  const dur = (p: any) => Number(p.media_duration_seconds || p.video_duration_seconds || 0);

  // 1) section_type explícito tem prioridade absoluta — cada post entra em UMA única seção.
  const result: Record<SectionKey, any[]> = {
    short_video: [], long_video: [], photo: [], photo_pack: [], video_pack: [], events: [], promo: [],
    story: [], chapter: [], diary: [], article: [], series: [], text_post: [],
  };
  const SECTION_KEYS: SectionKey[] = [
    "short_video", "long_video", "photo", "photo_pack", "video_pack", "events", "promo",
    "story", "chapter", "diary", "article", "series", "text_post",
  ];
  const consumed = new Set<string>();

  posts.forEach((p) => {
    if (p.is_event === true || p.event_at) {
      result.events.push(p);
      consumed.add(p.id);
      return;
    }
    if (p.is_promo === true || p.section_type === "promo") {
      result.promo.push(p);
      consumed.add(p.id);
      return;
    }
    if (p.section_type && SECTION_KEYS.includes(p.section_type as SectionKey)) {
      result[p.section_type as SectionKey].push(p);
      consumed.add(p.id);
    }
  });

  // 2) Heurística somente para posts SEM section_type definido.
  const remaining = posts.filter((p) => !consumed.has(p.id));
  remaining.forEach((p) => {
    if (p.is_pack && p.pack_type === "photos") return result.photo_pack.push(p);
    if (p.is_pack && p.pack_type === "videos") return result.video_pack.push(p);
    if (isVideo(p)) {
      const d = dur(p);
      if (d > 0 && d <= 90) return result.short_video.push(p);          // ≤ 1min30
      if (d > 90 && d <= 1800) return result.long_video.push(p);         // > 1min30 e ≤ 30min
      // Sem metadata de duração: assume curto para evitar duplicação.
      if (d === 0) return result.short_video.push(p);
      return; // > 30min é descartado das duas seções.
    }
    if (isImage(p)) return result.photo.push(p);
  });

  return result;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Mapeia preview_blur -> intensidade real do blur no card (px)
// Forte = quase invisível; diminui em médio, fraco e none.
const CARD_BLUR_PX: Record<string, number> = {
  strong: 96,
  medium: 56,
  light: 28,
  none: 0,
};
function blurStyleFor(level: string | null | undefined): React.CSSProperties | undefined {
  const px = CARD_BLUR_PX[(level || "medium").toLowerCase()] ?? 28;
  if (px <= 0) return undefined;
  const opacity = px >= 90 ? 0.3 : px >= 50 ? 0.42 : 0.56;
  return {
    filter: `blur(${px}px) saturate(0.55) brightness(0.42) contrast(1.15)`,
    transform: "scale(1.12)",
    opacity,
  };
}

function ContentCard({
  post, blur, hasAccess, onOpen, isOwner, isSubscribed,
  onEdit, onDelete, onToggleFreeze, onCancelSubscription, onReport,
  onTogglePin, onShare, pinEnabled, shareEnabled,
}: {
  post: any; blur: boolean; hasAccess: boolean; onOpen: (p: any) => void;
  isOwner: boolean; isSubscribed: boolean;
  onEdit: (p: any) => void; onDelete: (p: any) => void; onToggleFreeze: (p: any) => void;
  onCancelSubscription: () => void; onReport: (p: any) => void;
  onTogglePin: (p: any) => void; onShare: (p: any) => void;
  pinEnabled: boolean; shareEnabled: boolean;
}) {
  const isVideo = post.media_type === "video" || /\.(mp4|webm|mov)$/i.test(post.media_url || "");
  const price = Number(post.paid_price || 0);
  const clickable = hasAccess && !blur;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  // Capa: prioriza thumbnail (capa enviada pelo autor — narrativas/Diário VIP
  // não têm media_url, só thumbnail_url). Cai para preview_url e media_url.
  const coverSrc: string | null =
    post.thumbnail_url || post.cover_url || post.preview_url || post.media_url || null;
  return (
    <Card
      onClick={() => clickable && onOpen(post)}
      className={`overflow-hidden border border-border/50 hover:border-primary/40 transition-colors ${clickable ? "cursor-pointer" : ""} ${post.is_frozen ? "opacity-60" : ""} ${post.is_pinned ? "ring-1 ring-amber-400/50" : ""}`}
    >
      <div className="relative aspect-square bg-muted">
        <CachedImage
          src={coverSrc}
          alt={post.title || "Conteúdo VIP"}
          className="w-full h-full object-cover"
          wrapperClassName="absolute inset-0 flex items-center justify-center text-muted-foreground bg-muted"
          imgStyle={blur ? blurStyleFor(post.preview_blur) : undefined}
        />
        {blur && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-300 gap-1 bg-black/68 backdrop-blur-sm">
            <Lock className="h-6 w-6" />
            <span className="text-[11px] font-semibold">Conteúdo bloqueado</span>
          </div>
        )}
        {isVideo && !blur && (
          <div className="absolute top-2 left-2 bg-black/60 rounded-full p-1.5">
            <Play className="h-3 w-3 text-white fill-white" />
          </div>
        )}
        {post.is_pinned && (
          <Badge className="absolute top-2 left-2 bg-amber-500/95 text-black text-[10px] gap-1 border-0 shadow">
            <Pin className="h-3 w-3" /> Fixado
          </Badge>
        )}
        {isVideo && (
          <Badge className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 border-0 tabular-nums">
            {formatDuration(Number(post.media_duration_seconds || post.video_duration_seconds || 0))}
          </Badge>
        )}
        {post.is_frozen && (
          <Badge className="absolute bottom-2 left-2 bg-blue-500/90 text-white text-[10px] gap-1">
            <Snowflake className="h-3 w-3" /> Congelado
          </Badge>
        )}

        {/* 3-dot menu */}
        <div className="absolute top-2 right-2" onClick={stop}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 rounded-full bg-black/60 hover:bg-black/80 text-white"
               aria-label="Mais opções">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isOwner ? (
                <>
                  <DropdownMenuItem onClick={() => onEdit(post)}>
                    <Pencil className="h-4 w-4 mr-2" /> Editar
                  </DropdownMenuItem>
                  {pinEnabled && (
                    <DropdownMenuItem onClick={() => onTogglePin(post)}>
                      {post.is_pinned ? (
                        <><PinOff className="h-4 w-4 mr-2" /> Desafixar</>
                      ) : (
                        <><Pin className="h-4 w-4 mr-2" /> Fixar no topo</>
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onToggleFreeze(post)}>
                    <Snowflake className="h-4 w-4 mr-2" />
                    {post.is_frozen ? "Descongelar" : "Congelar"}
                  </DropdownMenuItem>
                  {shareEnabled && (
                    <DropdownMenuItem onClick={() => onShare(post)}>
                      <Share2 className="h-4 w-4 mr-2" /> Compartilhar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(post)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  {shareEnabled && (
                    <DropdownMenuItem onClick={() => onShare(post)}>
                      <Share2 className="h-4 w-4 mr-2" /> Compartilhar
                    </DropdownMenuItem>
                  )}
                  {isSubscribed && (
                    <DropdownMenuItem onClick={onCancelSubscription}>
                      <AlertCircle className="h-4 w-4 mr-2" /> Cancelar assinatura
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onReport(post)} className="text-destructive focus:text-destructive">
                    <Flag className="h-4 w-4 mr-2" /> Denunciar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-2 space-y-1">
        <p className="text-xs font-semibold truncate">{post.title || post.content_text?.slice(0, 40) || "Conteúdo VIP"}</p>
        {post.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{post.description}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-bold text-amber-400">
              {price > 0 ? `R$ ${price.toFixed(2).replace(".", ",")}` : "Incluso"}
            </span>
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums"
              title="Visualizações"
            >
              <Eye className="h-3 w-3" />
              {Number(post.narrative_views_count || post.views_count || 0).toLocaleString("pt-BR")}
            </span>
          </div>
          {!hasAccess ? (
            <Button size="sm" className="h-7 px-2 text-[10px] bg-amber-500 hover:bg-amber-600 text-black" onClick={(e) => { e.stopPropagation(); onOpen(post); }}>
              <ShoppingCart className="h-3 w-3 mr-1" /> Comprar
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); onOpen(post); }}>
              <Eye className="h-3 w-3 mr-1" /> Ver
            </Button>
          )}
        </div>
      </div>

    </Card>
  );
}

function AddTile({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-lg border-2 border-dashed border-amber-400/50 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-400 transition-colors flex flex-col items-center justify-center gap-2 text-amber-400 group"
    >
      <Plus className="h-8 w-8 group-hover:scale-110 transition-transform" />
      <span className="text-[11px] font-semibold px-2 text-center leading-tight">{label}</span>
    </button>
  );
}

const SECTION_DEFS: { key: SectionKey; title: string; icon: React.ReactNode; addLabel: string }[] = [
  // ── Diário VIP em primeiro (destaque do canal) ──
  { key: "diary",       title: "Diário VIP", icon: <Notebook className="h-5 w-5 text-amber-300" />, addLabel: "Nova página do diário" },
  { key: "promo",       title: "Promoções", icon: <Tag className="h-5 w-5 text-pink-400" />, addLabel: "Adicionar promoção" },
  { key: "short_video", title: "Vídeos Curtos", icon: <Film className="h-5 w-5 text-amber-400" />, addLabel: "Adicionar vídeo curto" },
  { key: "long_video",  title: "Vídeos Longos", icon: <Video className="h-5 w-5 text-amber-400" />, addLabel: "Adicionar vídeo longo" },
  { key: "photo",       title: "Imagens e Fotos Únicas", icon: <ImageIcon className="h-5 w-5 text-amber-400" />, addLabel: "Adicionar foto" },
  { key: "photo_pack",  title: "Pack de Fotos", icon: <Images className="h-5 w-5 text-amber-400" />, addLabel: "Adicionar pack de fotos" },
  { key: "video_pack",  title: "Pack de Vídeos", icon: <Package className="h-5 w-5 text-amber-400" />, addLabel: "Adicionar pack de vídeos" },
  { key: "events",      title: "Eventos do Canal", icon: <Calendar className="h-5 w-5 text-amber-400" />, addLabel: "Criar evento" },
  // ── Demais seções narrativas (Canal VIP — leitura) ──
  { key: "story",       title: "Histórias", icon: <BookOpen className="h-5 w-5 text-amber-300" />, addLabel: "Nova história" },
  { key: "chapter",     title: "Capítulos", icon: <BookMarked className="h-5 w-5 text-amber-300" />, addLabel: "Novo capítulo" },
  { key: "series",      title: "Séries", icon: <Library className="h-5 w-5 text-amber-300" />, addLabel: "Nova série" },
  { key: "article",     title: "Textos", icon: <FileText className="h-5 w-5 text-amber-300" />, addLabel: "Novo texto" },
  { key: "text_post",   title: "Bastidores", icon: <Sparkles className="h-5 w-5 text-amber-300" />, addLabel: "Novo bastidor" },
];

export default function CreatorChannelPage() {
  const { creatorId } = useParams<{ creatorId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();
  const requestedPlanId = searchParams.get("plan");
  const requestedChannel = searchParams.get("channel");
  const { data, isLoading, error } = useCreatorChannel(creatorId, requestedPlanId, requestedChannel);
  const { runtime, isBeta } = usePlatformPhase();
  const pinEnabled = (runtime as any).vip_pin_enabled !== false;
  const shareEnabled = (runtime as any).vip_share_enabled !== false;
  const isOwner = !!data?.profile && (data.profile.id === user?.id || data.profile.user_id === user?.id);

  const [showAffiliate, setShowAffiliate] = useState(false);
  const [showAffiliateManager, setShowAffiliateManager] = useState(false);
  const [addSection, setAddSection] = useState<SectionKey | null>(null);
  const [filters, setFilters] = useState<Partial<Record<SectionKey, string>>>({});
  const [previewBlur, setPreviewBlur] = useState(false);
  const [viewerPost, setViewerPost] = useState<any | null>(null);
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [editingNarrative, setEditingNarrative] = useState<any | null>(null);
  const [showAffiliateSignup, setShowAffiliateSignup] = useState(false);
  const [affiliateRequestState, setAffiliateRequestState] = useState<"idle" | "pending" | "approved" | "rejected">("idle");
  const [checkoutPost, setCheckoutPost] = useState<any | null>(null);
  const [showPurchaseChooser, setShowPurchaseChooser] = useState(false);
  const [showPurchaseCheckout, setShowPurchaseCheckout] = useState(false);
  const [purchaseMethod, setPurchaseMethod] = useState<PurchaseMethod>("pix");
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  // Atribuição de afiliado capturada via ?ref=<código> ao entrar no canal.
  // Persiste por sessão e é repassada para todo checkout dentro do canal,
  // garantindo a comissão de 5% para o indicador em qualquer compra feita aqui.
  const channelAffiliateRef = useChannelAffiliateRef(data?.profile?.id || null);
  const queryClient = useQueryClient();

  const refreshChannel = () => {
    queryClient.invalidateQueries({ queryKey: ["creator-channel"] });
  };

  const handleEdit = (p: any) => {
    // Narrativas usam o modal dedicado (texto longo, capa, série, capítulo, teaser)
    if (p?.content_format === "narrative" && NARRATIVE_KEYS.has(p.section_type)) {
      setEditingNarrative(p);
      return;
    }
    setEditingPost(p);
  };


  const handleDelete = async (p: any) => {
    if (!confirm("Excluir este conteúdo definitivamente? Esta ação não pode ser desfeita.")) return;
    const { error } = await (supabase as any).from("posts").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Conteúdo excluído");
    refreshChannel();
  };

  const handleToggleFreeze = async (p: any) => {
    const next = !p.is_frozen;
    const { error } = await (supabase as any)
      .from("posts")
      .update({ is_frozen: next })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Conteúdo congelado" : "Conteúdo descongelado");
    refreshChannel();
  };

  const handleTogglePin = async (p: any) => {
    const next = !p.is_pinned;
    const { error } = await (supabase as any)
      .from("posts")
      .update({ is_pinned: next, pinned_at: next ? new Date().toISOString() : null })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Conteúdo fixado no topo" : "Fixação removida");
    refreshChannel();
  };

  const handleShare = async (p: any) => {
    const creatorRouteId = data?.profile?.user_id || data?.profile?.id;
    const url = `${window.location.origin}/canal/${creatorRouteId}?section=${encodeURIComponent(p.section_type || "")}&post=${encodeURIComponent(p.id)}`;
    const title = p.title || "Conteúdo do Canal VIP";
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title, url, text: p.teaser || undefined });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado para a área de transferência");
      }
    } catch {
      try { await navigator.clipboard.writeText(url); toast.success("Link copiado"); } catch { /* noop */ }
    }
  };


  const handleCancelSubscription = async () => {
    if (!myProfile?.id || !data?.profile?.id) return;
    if (!confirm("Cancelar sua assinatura deste canal?")) return;
    const { error } = await (supabase as any)
      .from("subscriptions")
      .update({ status: "cancelled", canceled_at: new Date().toISOString() })
      .eq("subscriber_id", myProfile.id)
      .eq("creator_id", data.profile.id)
      .in("status", ["active", "trialing"]);
    if (error) { toast.error(error.message); return; }
    toast.success("Assinatura cancelada");
    queryClient.invalidateQueries({ queryKey: ["channel-is-subscribed"] });
    queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["is-subscribed"] });
  };

  const handleReport = (p: any) => {
    navigate(`/denunciar?post=${p.id}`);
  };

  const monthlyPlan = useMemo(
    () => data?.selectedPlan || (data?.plans || [])[0],
    [data]
  );
  const annualPlan = monthlyPlan; // same row in this schema (annual_price column)

  const { data: subData } = useQuery({
    queryKey: ["channel-is-subscribed", data?.profile?.id, user?.id],
    enabled: !!data?.profile?.id && !!user?.id && !!myProfile?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ active: boolean; expiresAt: string | null; source: 'subscription' | 'beta' } | null> => {
      const nowIso = new Date().toISOString();
      const { data: rows } = await (supabase as any)
        .from("subscriptions")
        .select("id, status, expires_at")
        .eq("subscriber_id", myProfile!.id)
        .eq("creator_id", data!.profile.id)
        .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .maybeSingle();
      if (rows) return { active: true, expiresAt: (rows as any).expires_at ?? null, source: 'subscription' };
      try {
        const { data: beta } = await (supabase as any).rpc("has_beta_creator_access", {
          p_user: user!.id,
          p_creator: data!.profile.id,
        });
        if (beta === true) return { active: true, expiresAt: null, source: 'beta' };
      } catch {}
      return null;
    },
  });
  // Layer mock de assinatura (libera VIP imediatamente após checkout do canal)
  const { findByCreator: findMockSubByCreator } = useMockChannelSubscriptions();
  const mockSubForChannel = findMockSubByCreator(data?.profile?.id);
  const mockStatus = mockSubForChannel ? getMockSubStatus(mockSubForChannel) : null;

  const isSubscribed = !!subData?.active || !!(mockStatus && mockStatus.active);
  const subscriptionExpiresAt =
    subData?.expiresAt ?? (mockSubForChannel?.endISO ?? null);
  const subscriptionStartedAt = mockSubForChannel?.startISO ?? null;
  const subscriptionSource: 'subscription' | 'beta' | 'mock' | null =
    subData?.source ?? (mockSubForChannel ? 'mock' : null);
  const subscriptionDaysRemaining = mockStatus?.daysRemaining ?? null;
  const subscriptionPlanTitle = mockSubForChannel?.planTitle ?? null;
  const subscriptionCycle = mockSubForChannel?.cycle ?? null;

  // Realtime: reage a INSERT/UPDATE/DELETE de subscriptions sem reload de página
  useEffect(() => {
    if (!myProfile?.id) return;
    const unsub = subscribeTable("subscriptions", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.subscriber_id !== myProfile.id) return;
      queryClient.invalidateQueries({ queryKey: ["channel-is-subscribed"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
      queryClient.invalidateQueries({ queryKey: ["is-subscribed"] });
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["channel-subscribers-count"] });
    });
    return () => { unsub(); };
  }, [myProfile?.id, queryClient]);

  const { data: subscribersCount = 0 } = useQuery({
    queryKey: ["channel-subscribers-count", data?.profile?.id, isBeta],
    enabled: !!data?.profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const creatorProfileId = data!.profile.id;
      const nowIso = new Date().toISOString();

      // 1) Conta assinantes "reais" (tabela subscriptions).
      //    Preferir RPC SECURITY DEFINER (visitantes não enxergam linhas
      //    de outros assinantes via RLS). Se falhar, cai para query direta
      //    (dono/admin).
      let realCount = 0;
      let realCountedByRpc = false;
      try {
        const { data: rpcCount, error: rpcError } = await (supabase as any).rpc(
          "get_channel_active_subscribers_count",
          { p_creator: creatorProfileId }
        );
        if (!rpcError && rpcCount !== null && rpcCount !== undefined) {
          realCount = Number(rpcCount) || 0;
          realCountedByRpc = true;
        }
      } catch { /* fallback abaixo */ }

      const uniqueRealSubscribers = new Set<string>();
      if (!realCountedByRpc) {
        const { data: realRows } = await (supabase as any)
          .from("subscriptions")
          .select("subscriber_id, status, expires_at")
          .eq("creator_id", creatorProfileId)
          .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

        ((realRows as Array<{ subscriber_id?: string | null; status?: string | null; expires_at?: string | null }> | null) || [])
          .filter((row) => !!row?.subscriber_id && isSubscriptionCurrentlyActive(row))
          .map((row) => normalizeSubscriberCountKey(row.subscriber_id))
          .filter(Boolean)
          .forEach((id) => uniqueRealSubscribers.add(id as string));
        realCount = uniqueRealSubscribers.size;
      }

      // 2) Em fase beta, soma também os grants vitalícios (beta_access_grants)
      //    SEM depender do branch de fallback acima — antes, quando o RPC
      //    retornava 0, o código abortava e nunca somava os assinantes beta,
      //    causando "1 assinante" incorretos no card lateral.
      if (!isBeta) return realCount;

      const { data: betaRows } = await (supabase as any)
        .from("beta_access_grants")
        .select("user_id, status, expires_at")
        .eq("grant_type", "creator_subscription")
        .eq("creator_id", creatorProfileId)
        .eq("status", "active")
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

      const uniqueBetaSubscribers = new Set<string>(
        ((betaRows as Array<{ user_id?: string | null; status?: string | null; expires_at?: string | null }> | null) || [])
          .filter((row) => !!row?.user_id && isSubscriptionCurrentlyActive(row))
          .map((row) => normalizeSubscriberCountKey(row.user_id))
          .filter((x): x is string => !!x)
      );

      // Quando o RPC já contou os "reais", não temos como deduplicar
      // (user_id de beta_access_grants pode coincidir com subscriber_id
      // mapeado a profile no RPC). Tratamos como conjuntos disjuntos:
      // grants beta NUNCA têm linha em subscriptions ativa simultaneamente
      // (são caminhos mutuamente exclusivos no fluxo de checkout beta).
      if (realCountedByRpc) {
        return realCount + uniqueBetaSubscribers.size;
      }

      uniqueBetaSubscribers.forEach((sid) => uniqueRealSubscribers.add(sid));
      return uniqueRealSubscribers.size;
    },
  });

  // Realtime: recalcula contagem de assinantes do canal em tempo real
  // para qualquer mudança em subscriptions deste criador (próprio ou de outros).
  useEffect(() => {
    const creatorProfileId = data?.profile?.id;
    if (!creatorProfileId) return;
    const unsub = subscribeTable("subscriptions", () => {
      queryClient.invalidateQueries({ queryKey: ["channel-subscribers-count", creatorProfileId] });
      queryClient.invalidateQueries({ queryKey: ["channel-is-subscribed"] });
    });
    return () => { unsub(); };
  }, [data?.profile?.id, queryClient]);

  useEffect(() => {
    const creatorProfileId = data?.profile?.id;
    if (!creatorProfileId || !isBeta) return;
    const unsub = subscribeTable("beta_access_grants", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.creator_id !== creatorProfileId) return;
      queryClient.invalidateQueries({ queryKey: ["channel-subscribers-count", creatorProfileId] });
      queryClient.invalidateQueries({ queryKey: ["channel-is-subscribed"] });
    });
    return () => { unsub(); };
  }, [data?.profile?.id, isBeta, queryClient]);


  useEffect(() => { if (error) toast.error((error as any)?.message || "Erro ao carregar canal"); }, [error]);

  // Realtime: atualiza seções automaticamente quando posts do criador mudam
  useEffect(() => {
    const authorId = data?.profile?.id;
    if (!authorId) return;
    const unsub = subscribeTable('posts', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.author_id !== authorId) return;
      queryClient.invalidateQueries({ queryKey: ['creator-channel'] });
    });
    return () => { unsub(); };
  }, [data?.profile?.id, queryClient]);

  const allPostIds = useMemo(
    () => (data?.posts || []).map((p: any) => p.id).filter(Boolean),
    [data]
  );
  const { data: accessMap = {} } = useBatchMediaAccess(allPostIds);

  // Deep-link: ?section=<key>&post=<id> abre o conteúdo correto direto do feed.
  // Usa o mesmo guardrail do clique manual (apenas dono/assinante/comprador veem o viewer).
  // CRÍTICO: roda APENAS UMA VEZ por combinação (post,section) no querystring.
  // Sem guard, qualquer refresh de `data?.posts` ou `accessMap` (ex.: após
  // register_narrative_view invalidar a query) re-disparava o efeito e
  // sobrescrevia o post que o usuário acabou de abrir, mostrando sempre o
  // mesmo conteúdo do deep-link inicial.
  const appliedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const sec = searchParams.get("section");
    const pid = searchParams.get("post");
    if (!pid || !data?.posts?.length) return;
    const key = `${pid}::${sec || ""}`;
    if (appliedDeepLinkRef.current === key) return;
    const target = data.posts.find((p: any) => p.id === pid);
    if (!target) return;
    const isNarrativeTarget =
      target?.content_format === "narrative" ||
      (target?.section_type && NARRATIVE_KEYS.has(target.section_type as SectionKey));
    if (isNarrativeTarget || isOwner || isSubscribed || accessMap[pid]) {
      appliedDeepLinkRef.current = key;
      setViewerPost(target);
    }
    if (sec) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`channel-section-${sec}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.posts, isOwner, isSubscribed, accessMap, searchParams]);



  const { data: myAffiliateRequest } = useQuery({
    queryKey: ["creator-affiliate-my-request", data?.profile?.id, user?.id],
    enabled: !!data?.profile?.id && !!user?.id && !isOwner,
    queryFn: async () => {
      const { data: row, error } = await (supabase as any)
        .from("oculto_affiliate_requests")
        .select("status")
        .eq("creator_profile_id", data!.profile.id)
        .eq("affiliate_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return row?.status || "idle";
    },
  });

  useEffect(() => {
    if (!myAffiliateRequest) {
      setAffiliateRequestState("idle");
      return;
    }
    setAffiliateRequestState(myAffiliateRequest as any);
  }, [myAffiliateRequest]);

  useEffect(() => {
    if (!data?.profile?.id || !user?.id || isOwner) return;
    const unsub = subscribeTable("oculto_affiliate_requests", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.creator_profile_id !== data.profile.id) return;
      if (row?.affiliate_user_id === user.id) {
        setAffiliateRequestState((row?.status || "pending") as any);
        queryClient.invalidateQueries({ queryKey: ["creator-affiliate-my-request", data.profile.id, user.id] });
      }
    });
    return () => { unsub(); };
  }, [data?.profile?.id, user?.id, isOwner, queryClient]);

  const openPurchaseFlow = (post: any) => {
    if (!user) {
      setCheckoutPost(post);
      setShowAffiliateSignup(false);
      setShowPurchaseChooser(false);
      setShowPurchaseCheckout(false);
      return;
    }
    setCheckoutPost(post);
    setShowPurchaseChooser(true);
  };

  const requestAffiliate = async () => {
    if (!user?.id) {
      setShowAffiliateSignup(true);
      return;
    }
    const { error } = await (supabase as any)
      .from("oculto_affiliate_requests")
      .upsert({
        affiliate_user_id: user.id,
        creator_profile_id: data.profile.id,
        status: "pending",
      }, { onConflict: "affiliate_user_id,creator_profile_id" });
    if (error) {
      toast.error(error.message);
      return;
    }
    setAffiliateRequestState("pending");
    queryClient.invalidateQueries({ queryKey: ["creator-affiliate-my-request", data.profile.id, user.id] });
    toast.success("Candidatura enviada!");
    setShowAffiliate(false);
  };

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto p-4 space-y-4">
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-80 md:col-span-1" />
          <Skeleton className="h-80 md:col-span-2" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { profile, posts } = data;
  const cats = categorize(posts);

  // Identidade do canal: SEMPRE o nome configurado no plano OU @username.
  // NUNCA usar profile.name/full_name (privacidade — nome real é privado).
  // Se o plano.title coincidir com o nome real (config antiga/default), descarta.
  const realNameTokens = [ (profile as any)?.name, (profile as any)?.display_name, (profile as any)?.full_name ]
    .filter(Boolean)
    .map((s: string) => s.trim().toLowerCase());
  const planTitle = monthlyPlan?.title?.trim();
  const safePlanTitle = planTitle && !realNameTokens.includes(planTitle.toLowerCase()) ? planTitle : null;
  const channelName =
    safePlanTitle ||
    (profile.username ? `@${profile.username}` : "Canal VIP");
  const channelBio = (monthlyPlan?.description || monthlyPlan?.bio || "")?.trim();
  const cover = monthlyPlan?.banner_url || profile.cover_url || profile.avatar_url;

  const monthlyPrice = Number(monthlyPlan?.monthly_price || 0);
  const annualPrice = Number(annualPlan?.annual_price || 0);
  const annualDiscount =
    monthlyPrice > 0 && annualPrice > 0
      ? Math.max(0, Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100))
      : 0;

  return (
    <div className="min-h-dvh bg-background pb-24">
      <BetaVipNoticeModal />
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border/30">
        <div className="container max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold">Canal VIP</span>
          </div>
        </div>
        <BetaVipChannelBanner />
      </div>

      {/* Hero — banner do plano + nome do canal */}
      <div className="relative w-full aspect-[3/1] sm:aspect-[4/1] bg-muted overflow-hidden">
        {cover ? (
          <img loading="lazy" decoding="async" src={cover} alt={channelName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-900/40 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3">
          <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-amber-400">
            <AvatarImage src={profile.avatar_url} />
            <AvatarFallback>{(channelName || "?")[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{channelName}</h1>
            {profile.username && channelName !== `@${profile.username}` && (
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-amber-400" />
                <strong className="text-foreground">{subscribersCount.toLocaleString("pt-BR")}</strong>
                {subscribersCount === 1 ? "assinante" : "assinantes"}
              </span>
              {(monthlyPlan?.created_at || profile.created_at) && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-amber-400" />
                  Canal criado em{" "}
                  {new Date(monthlyPlan?.created_at || profile.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-screen-2xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="space-y-4 lg:col-span-1 lg:order-2">
          <Card className="p-4 border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-transparent space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-400" />
              <h2 className="font-bold">Assinar canal</h2>
            </div>
            {channelBio && <p className="text-xs text-muted-foreground">{channelBio}</p>}
            {monthlyPrice > 0 ? (
              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                disabled={isSubscribed}
                onClick={() => {
                  if (!user) { setShowAffiliateSignup(true); return; }
                  setShowSubscribe(true);
                }}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Mensal · R$ {monthlyPrice.toFixed(2).replace(".", ",")}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Preço mensal não configurado.</p>
            )}
            {annualPrice > 0 && (
              <Button
                variant="outline"
                className="w-full border-amber-400/60 text-amber-400"
                disabled={isSubscribed}
                onClick={() => {
                  if (!user) { setShowAffiliateSignup(true); return; }
                  setShowSubscribe(true);
                }}
              >
                Anual · R$ {annualPrice.toFixed(2).replace(".", ",")}
                {annualDiscount > 0 && <Badge className="ml-2 bg-green-500/80 text-white">{annualDiscount}% Desc</Badge>}
              </Button>
            )}
            {isSubscribed && (
              <div className="rounded-lg border-2 border-green-500/50 bg-gradient-to-br from-green-500/15 via-emerald-500/10 to-transparent p-3 space-y-2 shadow-[0_0_20px_-8px_rgba(34,197,94,0.5)]">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-green-500/25 flex items-center justify-center">
                    <Crown className="h-4 w-4 text-green-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-green-300/80 font-semibold leading-tight">Você é assinante</p>
                    <p className="text-xs font-bold text-white truncate">{channelName}</p>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground border-t border-green-500/20 pt-2 space-y-1.5">
                  {subscriptionSource === 'beta' ? (
                    <span className="inline-flex items-center gap-1 text-yellow-300"><InfinityIcon className="h-3 w-3" /> Acesso vitalício (beta)</span>
                  ) : subscriptionExpiresAt ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Início</span>
                        <span className="font-semibold text-white">
                          {subscriptionStartedAt
                            ? new Date(subscriptionStartedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Validade</span>
                        <span className="font-semibold text-green-300">
                          {new Date(subscriptionExpiresAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      {subscriptionDaysRemaining !== null && Number.isFinite(subscriptionDaysRemaining) && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Tempo restante</span>
                          <span className={`font-bold ${subscriptionDaysRemaining <= 7 ? 'text-orange-300' : 'text-green-300'}`}>
                            {subscriptionDaysRemaining} {subscriptionDaysRemaining === 1 ? 'dia' : 'dias'}
                          </span>
                        </div>
                      )}
                      {subscriptionPlanTitle && (
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-green-500/10">
                          <span className="text-muted-foreground">Plano</span>
                          <span className="font-semibold text-white truncate max-w-[60%] text-right">
                            {subscriptionPlanTitle}{subscriptionCycle ? ` · ${subscriptionCycle === 'monthly' ? 'Mensal' : subscriptionCycle === 'annual' ? 'Anual' : 'Vitalício'}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-yellow-300"><InfinityIcon className="h-3 w-3" /> Acesso vitalício</span>
                  )}
                </div>
                <div className="flex justify-center">
                  <SubscriptionStatusBadge creatorId={data?.profile?.id} variant="full" />
                </div>
                <p className="text-[10px] text-center text-green-200/70 leading-snug">
                  ✓ Todo o conteúdo do canal está liberado para você.
                </p>
              </div>
            )}
          </Card>

          {isOwner && (
            <Card className="p-3 border-amber-400/30 bg-amber-500/5">
              <div className="flex items-center gap-2">
                {previewBlur ? <EyeOff className="h-4 w-4 text-amber-400" /> : <Eye className="h-4 w-4 text-amber-400" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">Pré-visualizar como visitante</p>
                  <p className="text-[10px] text-muted-foreground">Aplica blur em todo o conteúdo para você ver o resultado.</p>
                </div>
                <Button
                  size="sm"
                  variant={previewBlur ? "default" : "outline"}
                  className={previewBlur ? "bg-amber-500 hover:bg-amber-600 text-black h-7 text-[11px]" : "border-amber-400/50 text-amber-400 h-7 text-[11px]"}
                  onClick={() => setPreviewBlur((v) => !v)}
                >
                  {previewBlur ? "Desativar" : "Ativar"}
                </Button>
              </div>
            </Card>
          )}

          {isOwner && data?.profile?.id && (
            <ChannelSubscribersCard creatorProfileId={data.profile.id} />
          )}

          <Card className="p-4 space-y-2">
            <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Programa de afiliados</h3>
            <p className="text-xs text-muted-foreground">
              Promova este canal e ganhe 5% sobre as assinaturas que você indicar.
            </p>
            {isOwner ? (
              <Button
                size="sm"
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                onClick={() => setShowAffiliateManager(true)}
              >
                Gerenciar afiliados
              </Button>
             ) : affiliateRequestState === "approved" ? (
               <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold" disabled>
                 Afiliado aprovado
               </Button>
             ) : affiliateRequestState === "pending" ? (
               <Button size="sm" className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-semibold" disabled>
                 Candidatura enviada
               </Button>
             ) : affiliateRequestState === "rejected" ? (
               <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold" onClick={() => setShowAffiliate(true)}>
                 Enviar nova candidatura
               </Button>
             ) : (
               <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold" onClick={() => setShowAffiliate(true)}>
                 Quero ser afiliado
               </Button>
             )}
          </Card>

          {isOwner ? (
            <Suspense fallback={null}>
              <CreatorCouponsPanel creatorId={user!.id} />
            </Suspense>
          ) : (
            <Suspense fallback={null}>
              <PublicCouponsList creatorId={profile.user_id || profile.id} />
            </Suspense>
          )}

          <Card className="p-4 space-y-1 text-sm">
            <Link to={`/creator/${profile.id}`} className="text-primary hover:underline text-xs">
              Ver perfil social do criador →
            </Link>
          </Card>
        </aside>

        {/* Sempre renderiza todas as seções; primeira tile é "Adicionar" para o dono */}
        <div className="lg:col-span-3 lg:order-1 space-y-6">
          {!isOwner && (
            <Suspense fallback={null}>
              <ContinueReadingStrip
                creatorId={profile.id}
                onOpen={(postId) => {
                  const target = posts.find((x: any) => x.id === postId);
                  if (target) setViewerPost(target);
                }}
              />
            </Suspense>
          )}
          {SECTION_DEFS.map((sec) => {
            const allItems = [...(cats[sec.key] || [])].sort((a: any, b: any) => {
              // pinned primeiro, depois por created_at desc
              if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
              return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            });
            const q = (filters[sec.key] || "").trim().toLowerCase();
            const items = q
              ? allItems.filter((p: any) =>
                  `${p.title || ""} ${p.content_text || ""}`.toLowerCase().includes(q)
                )
              : allItems;
            const showAdd = isOwner;
            if (!isOwner && allItems.length === 0) return null;
            return (
              <section key={sec.key} id={`channel-section-${sec.key}`} className="space-y-3 scroll-mt-24">
                <div className="flex items-center gap-2">
                  {sec.icon}
                  <h2 className="text-base font-bold">{sec.title}</h2>
                  <Badge variant="secondary" className="ml-auto">{allItems.length}</Badge>
                </div>
                {allItems.length > 3 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={filters[sec.key] || ""}
                      onChange={(e) => setFilters((f) => ({ ...f, [sec.key]: e.target.value }))}
                      placeholder={`Buscar em ${sec.title.toLowerCase()}…`}
                      className="h-8 pl-8 text-xs bg-muted/40"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {showAdd && !q && (
                    <AddTile
                      onClick={() => {
                        if (sec.key === "events") setShowCreateEvent(true);
                        else setAddSection(sec.key);
                      }}
                      label={sec.addLabel}
                    />
                  )}
                  {items.slice(0, 24).map((p: any) => {
                    const purchased = !!accessMap[p.id];
                    const hasAccess = isOwner || isSubscribed || purchased;
                    // Master Admin pode marcar a postagem com preview_blur='none' para
                    // forçar exibição sem blur para todos, ignorando o botão de preview.
                    const masterNoBlur = p?.preview_blur === 'none';
                    const cardBlur = masterNoBlur ? false : (previewBlur ? true : !hasAccess);
                    return (
                      <ContentCard
                        key={p.id}
                        post={p}
                        blur={cardBlur}
                        hasAccess={masterNoBlur ? true : (hasAccess && !previewBlur)}
                        onOpen={(post) => {
                          if (isOwner || isSubscribed || accessMap[post.id]) {
                            // Computa visualização do item ao abrir o modal
                            (supabase as any)
                              .rpc("register_narrative_view", { p_post_id: post.id })
                              .then(() => {
                                queryClient.invalidateQueries({ queryKey: ["creator-channel"] });
                              })
                              .catch(() => {});
                            setViewerPost(post);
                            return;
                          }
                          openPurchaseFlow(post);
                        }}

                        isOwner={isOwner}
                        isSubscribed={isSubscribed}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleFreeze={handleToggleFreeze}
                        onCancelSubscription={handleCancelSubscription}
                        onReport={handleReport}
                        onTogglePin={handleTogglePin}
                        onShare={handleShare}
                        pinEnabled={pinEnabled}
                        shareEnabled={shareEnabled}
                      />
                    );
                  })}

                  {items.length === 0 && q && (
                    <p className="col-span-full text-xs text-muted-foreground py-2">
                      Nenhum conteúdo encontrado para "{filters[sec.key]}".
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {addSection && addSection !== "events" && !NARRATIVE_KEYS.has(addSection) && (
        <Suspense fallback={null}>
          <AddPaidContentModal
            open={true}
            onOpenChange={(o) => { if (!o) { setAddSection(null); refreshChannel(); } }}
            channelName={channelName}
            initialSectionKey={addSection === "promo" ? undefined : (addSection as any)}
            promoMode={addSection === "promo"}
          />
        </Suspense>
      )}

      {addSection === "diary" && (
        <Suspense fallback={null}>
          <DiaryBlogEditorModal
            open={true}
            onOpenChange={(o) => { if (!o) { setAddSection(null); refreshChannel(); } }}
            channelName={channelName}
          />
        </Suspense>
      )}

      {addSection && addSection !== "diary" && NARRATIVE_KEYS.has(addSection) && (
        <Suspense fallback={null}>
          <AddNarrativeContentModal
            open={true}
            onOpenChange={(o) => { if (!o) { setAddSection(null); refreshChannel(); } }}
            channelName={channelName}
            sectionKey={addSection as any}
          />
        </Suspense>
      )}

      <CreateEventModal
        open={showCreateEvent}
        onOpenChange={(o) => { setShowCreateEvent(o); if (!o) refreshChannel(); }}
      />

      {viewerPost && (
        <Suspense fallback={null}>
          <ChannelContentViewer
            open={!!viewerPost}
            onOpenChange={(o) => !o && setViewerPost(null)}
            post={viewerPost}
          />
        </Suspense>
      )}

      {editingPost && (
        <Suspense fallback={null}>
          <EditPaidContentModal
            open={!!editingPost}
            onOpenChange={(o) => !o && setEditingPost(null)}
            post={editingPost}
            onSaved={() => {
              setEditingPost(null);
              refreshChannel();
            }}
          />
        </Suspense>
      )}

      {editingNarrative && editingNarrative.section_type === "diary" && (
        <Suspense fallback={null}>
          <DiaryBlogEditorModal
            open={!!editingNarrative}
            onOpenChange={(o) => { if (!o) { setEditingNarrative(null); refreshChannel(); } }}
            channelName={channelName}
            editingPost={editingNarrative}
          />
        </Suspense>
      )}

      {editingNarrative && editingNarrative.section_type !== "diary" && (
        <Suspense fallback={null}>
          <AddNarrativeContentModal
            open={!!editingNarrative}
            onOpenChange={(o) => {
              if (!o) { setEditingNarrative(null); refreshChannel(); }
            }}
            channelName={channelName}
            sectionKey={editingNarrative.section_type as any}
            editingPost={editingNarrative}
          />
        </Suspense>
      )}


      {showAffiliate && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowAffiliate(false)}>
          <Card className="max-w-md w-full p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Candidatura a afiliado</h3>
            <p className="text-sm text-muted-foreground">
              Sua candidatura será analisada pelo criador. Você receberá 5% por cada nova assinatura confirmada via seu link.
            </p>
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              onClick={requestAffiliate}
            >
              Enviar candidatura
            </Button>
          </Card>
        </div>
      )}

      <QuickSignupModal
        open={showAffiliateSignup}
        onOpenChange={setShowAffiliateSignup}
        onSuccess={() => {
          setShowAffiliateSignup(false);
          if (showAffiliate) void requestAffiliate();
          else if (checkoutPost) setShowPurchaseChooser(true);
        }}
        contextLabel={showAffiliate ? `Entre para solicitar afiliação neste canal.` : `Entre para comprar este conteúdo VIP.`}
      />

      <PurchaseMethodChooserModal
        open={showPurchaseChooser}
        onOpenChange={setShowPurchaseChooser}
        price={Number(checkoutPost?.paid_price || 0)}
        itemName={checkoutPost?.title || checkoutPost?.content_text || channelName}
        onChoose={(method) => {
          setPurchaseMethod(method);
          setShowPurchaseCheckout(true);
        }}
      />

      <PaidContentCheckoutModal
        open={showPurchaseCheckout}
        onOpenChange={setShowPurchaseCheckout}
        postId={checkoutPost?.id || ""}
        price={Number(checkoutPost?.paid_price || 0)}
        sellerName={channelName}
        sellerId={profile?.user_id || profile?.id || null}
        couponTarget={
          checkoutPost?.media_type === "video"
            ? "long_video"
            : checkoutPost?.media_type === "photo"
              ? "photo"
              : "long_video"
        }
        initialCouponCode={searchParams.get("coupon") || undefined}
        defaultMethod={purchaseMethod}
        lockMethod
        affiliateIdFromLink={channelAffiliateRef?.affiliateId ?? null}
        affiliateUsernameFromLink={channelAffiliateRef?.username ?? null}
      />

      {showAffiliateManager && (
        <Suspense fallback={null}>
          <CreatorAffiliateManagerModal
            open={showAffiliateManager}
            onOpenChange={setShowAffiliateManager}
            creatorProfileId={profile.id}
            channelUrl={`${EXTERNAL_SUPABASE_URL}/functions/v1/og-canal?id=${encodeURIComponent(profile.user_id || profile.id)}`}
            channelName={channelName}
            channelBanner={cover || null}
            ownerUsername={profile.username || null}
          />
        </Suspense>
      )}

      {monthlyPlan && profile && (
        <PlanSubscribeModal
          open={showSubscribe}
          onOpenChange={setShowSubscribe}
          affiliateIdFromLink={channelAffiliateRef?.affiliateId ?? null}
          affiliateUsernameFromLink={channelAffiliateRef?.username ?? null}
          plan={{
            id: monthlyPlan.id,
            profile_id: profile.id,
            title: channelName,
            bio: channelBio || null,
            banner_url: monthlyPlan.banner_url || null,
            monthly_price: Number(monthlyPlan.monthly_price || 0),
            annual_price: monthlyPlan.annual_price ? Number(monthlyPlan.annual_price) : null,
            lifetime_price: monthlyPlan.lifetime_price ? Number(monthlyPlan.lifetime_price) : null,
            is_enabled: monthlyPlan.is_enabled !== false,
            sort_order: monthlyPlan.sort_order ?? 0,
            creator: {
              id: profile.id,
              // Privacidade: nunca expor o nome real — usamos o nome do canal
              // (título do plano) ou o @username como display name público.
              name: channelName,
              username: profile.username || null,
              avatar_url: profile.avatar_url || null,
              is_verified: !!profile.is_verified,
            },
          } as PlanWithCreator}
        />
      )}

    </div>
  );
}
