import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  BookOpen, BookMarked, Library, Notebook, FileText, Sparkles, Crown, Lock, ArrowRight, Clock,
  Heart, ThumbsDown, Bookmark, Share2, Gift, Eye,
} from "lucide-react";
import { SmartImage } from "@/components/SmartImage";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { useLikePostExclusive } from "@/hooks/usePostLikes";
import { useDislikePost } from "@/hooks/usePostDislikes";
import { useSavePost } from "@/hooks/usePosts";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SharePostModal } from "@/components/SharePostModal";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { PostGiftCounter } from "@/components/posts/PostGiftCounter";
import { buildShareUrl } from "@/lib/appConfig";
import { AdultMediaBlurOverlay } from "@/components/feed/AdultMediaBlurOverlay";
import { logger } from '@/lib/logger';
import { useAdultBlurDecision } from "@/safe-blur/useAdultBlurDecision";

type SectionKey = "story" | "chapter" | "diary" | "article" | "series" | "text_post";

const META: Record<SectionKey, { label: string; cta: string; Icon: any; accent: string }> = {
  story:     { label: "História",         cta: "Continuar História", Icon: BookOpen,    accent: "from-amber-500/25 to-fuchsia-500/10" },
  chapter:   { label: "Novo capítulo",    cta: "Ver Capítulo",       Icon: BookMarked,  accent: "from-amber-500/25 to-rose-500/10" },
  series:    { label: "Série VIP",        cta: "Entrar na Série",    Icon: Library,     accent: "from-fuchsia-500/25 to-amber-500/10" },
  diary:     { label: "Diário VIP",       cta: "Ler Diário",         Icon: Notebook,    accent: "from-rose-500/25 to-amber-500/10" },
  article:   { label: "Texto exclusivo",  cta: "Ler Teaser",         Icon: FileText,    accent: "from-sky-500/20 to-amber-500/10" },
  text_post: { label: "Bastidores",       cta: "Ler nos Bastidores", Icon: Sparkles,    accent: "from-amber-500/25 to-purple-500/10" },
};

interface Props {
  post: any;
  hasAccess?: boolean;
}

function formatNumber(n: number) {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export const VipNarrativeFeedCard = memo(function VipNarrativeFeedCard({ post, hasAccess }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const section = (post.section_type || "article") as SectionKey;
  const meta = META[section] || META.article;
  const Icon = meta.Icon;

  const effectiveAccess = true;

  const author = post.author || {};
  const creatorRouteId = author.id || post.author_id || post.user_id;
  const channelHref = useMemo(
    () => `/canal/${creatorRouteId}?section=${encodeURIComponent(section)}&post=${encodeURIComponent(post.id)}`,
    [creatorRouteId, section, post.id],
  );

  const cover = post.thumbnail_url || post.preview_url || post.media_url || null;
  const { shouldBlur: shouldBlurAdult } = useAdultBlurDecision({
    postId: post.id,
    isAdult: post.is_adult,
  });
  const shouldBlurCover = Boolean(cover) && shouldBlurAdult && post.preview_blur !== "none";
  const teaserText = (post.teaser || post.content_text || "").toString().trim();
  const teaserShort = teaserText.length > 220 ? teaserText.slice(0, 220).trimEnd() + "…" : teaserText;
  const username = author.username || "criador";
  const readTime = post.read_time_minutes;

  const headline = (() => {
    if (section === "chapter") {
      const n = post.chapter_number ? `Capítulo ${post.chapter_number}` : "Novo capítulo";
      const serie = post.series_title ? ` — ${post.series_title}` : "";
      return `${n}${serie} no canal de @${username}`;
    }
    if (section === "series") return `Nova série VIP de @${username}`;
    if (section === "diary") return `Diário VIP de @${username}`;
    if (section === "text_post") return `Bastidores de @${username}`;
    if (section === "story") return `Nova história de @${username}`;
    return `Novo texto de @${username}`;
  })();

  // === Ações ===
  const isPostOwner = !!user?.id && (user.id === post.user_id || user.id === post.author_id || user.id === author?.id);
  const likePost = useLikePostExclusive();
  const dislikePost = useDislikePost();
  const savePost = useSavePost();
  const isDisliked = !!(post as any).is_disliked;
  const sharesCount = (post as any).shares_count || 0;

  const [showShareModal, setShowShareModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);

  // Contadores reais sincronizados com a fonte da verdade (mesmas tabelas
  // usadas pelo modal ChannelContentViewer) — assim o card do feed e o modal
  // exibem exatamente os mesmos números de curtidas, deslikes, comentários,
  // salvos e visualizações.
  const [likeCount, setLikeCount] = useState<number>(Number(post.likes_count || 0));
  const [dislikeCount, setDislikeCount] = useState<number>(Number((post as any).dislikes_count || 0));
  const [saveCount, setSaveCount] = useState<number>(Number((post as any).saves_count || 0));
  const [commentCount, setCommentCount] = useState<number>(Number((post as any).comments_count || 0));
  const [viewCount, setViewCount] = useState<number>(0);

  const fetchCounts = useCallback(async () => {
    try {
      const [lk, dk, sv, cm, vc] = await Promise.all([
        (supabase as any).from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        (supabase as any).from("post_dislikes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        (supabase as any).from("saved_posts").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        (supabase as any).from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        (supabase as any).from("v_post_view_counts").select("views_count").eq("post_id", post.id).maybeSingle(),
      ]);
      if (typeof lk?.count === "number") setLikeCount(lk.count);
      if (typeof dk?.count === "number") setDislikeCount(dk.count);
      if (typeof sv?.count === "number") setSaveCount(sv.count);
      if (typeof cm?.count === "number") setCommentCount(cm.count);
      setViewCount(Number((vc?.data as any)?.views_count || 0));
    } catch (err) {
      logger.log("[VipNarrativeFeedCard] fetchCounts falhou", err);
    }
  }, [post.id]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const requireAuth = useCallback(() => {
    if (!user?.id) {
      toast({ title: "Faça login para interagir", variant: "destructive" });
      return false;
    }
    return true;
  }, [user?.id, toast]);

  const handleLike = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!requireAuth() || isPostOwner) return;
    try { await (likePost as any).mutateAsync({ postId: post.id, isLiked: !!post.is_liked }); } catch { /* noop */ }
    fetchCounts();
  }, [requireAuth, isPostOwner, likePost, post.id, post.is_liked, fetchCounts]);

  const handleDislike = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!requireAuth()) return;
    try { await (dislikePost as any).mutateAsync({ postId: post.id, isDisliked }); } catch { /* noop */ }
    fetchCounts();
  }, [requireAuth, dislikePost, post.id, isDisliked, fetchCounts]);

  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!requireAuth()) return;
    try { await (savePost as any).mutateAsync({ postId: post.id, isSaved: !!post.is_saved }); } catch { /* noop */ }
    fetchCounts();
  }, [requireAuth, savePost, post.id, post.is_saved, fetchCounts]);

  // Garante que uma mesma @username só conta UMA visualização (constraint
  // unique no banco). O card só dispara o registro quando o usuário realmente
  // abre o leitor — e a contagem fica sincronizada com a do modal.
  const viewRegisteredRef = useRef(false);
  const handleOpenReader = useCallback(async () => {
    try {
      const username =
        (user as any)?.user_metadata?.username ||
        (user as any)?.username ||
        (user as any)?.email ||
        null;
      if (username && !viewRegisteredRef.current) {
        viewRegisteredRef.current = true;
        const { error } = await (supabase as any)
          .from("oculto_post_views")
          .insert({ post_id: post.id, username });
        // ignora unique_violation (23505) — usuário já visualizou
        if (error && (error as any).code !== "23505") {
          logger.log("oculto_post_views insert falhou", error);
        }
        fetchCounts();
      }
    } catch (err) {
      logger.log("registro de view falhou", err);
    }
    navigate(channelHref);
  }, [post.id, channelHref, navigate, user, fetchCounts]);

  return (
    <Card
      className={cn(
        "relative overflow-hidden border border-amber-500/30 bg-gradient-to-br",
        "shadow-[0_0_0_1px_rgba(245,158,11,0.18)] hover:shadow-[0_4px_24px_-8px_rgba(245,158,11,0.45)]",
        "transition-shadow duration-200",
        meta.accent,
      )}
      style={{ contain: "content" }}
    >
      {/* Faixa topo: badge + ID criador */}
      <div className="flex items-center gap-2 px-3 pt-3">
        <Badge className="bg-amber-500 hover:bg-amber-500 text-black font-semibold gap-1 px-2 py-0.5 text-[10px]">
          <Crown className="h-3 w-3" /> Universo VIP
        </Badge>
        <Badge variant="outline" className="border-amber-400/50 text-amber-300 gap-1 px-2 py-0.5 text-[10px]">
          <Icon className="h-3 w-3" /> {meta.label}
        </Badge>
        {!effectiveAccess && (
          <Badge variant="outline" className="ml-auto border-muted-foreground/30 text-muted-foreground gap-1 px-2 py-0.5 text-[10px]">
            <Lock className="h-3 w-3" /> Bloqueado
          </Badge>
        )}
      </div>

      {/* Capa narrativa */}
      {cover && (
        <AdultMediaBlurOverlay postId={post.id} active={shouldBlurCover} className="mt-3 mx-3 rounded-lg overflow-hidden">
          <Link to={channelHref} className="block rounded-lg overflow-hidden">
            <SmartImage
              src={cover}
              alt={post.title || meta.label}
              aspectRatio="16/9"
              className="hover:scale-[1.01] transition-transform duration-300"
              containerClassName="rounded-lg"
            />
          </Link>
        </AdultMediaBlurOverlay>
      )}

      {/* Corpo */}
      <div className="p-3 space-y-2">
        <Link to={channelHref} className="block group">
          <p className="text-[11px] uppercase tracking-wide text-amber-400/90">{headline}</p>
          {post.title && (
            <h3 className="font-serif text-lg leading-tight text-foreground group-hover:text-amber-300 transition-colors line-clamp-2">
              {post.title}
            </h3>
          )}
          {post.subtitle && (
            <p className="text-sm text-muted-foreground italic line-clamp-2">{post.subtitle}</p>
          )}
        </Link>

        {teaserShort && (
          <p className="text-sm text-foreground/85 leading-relaxed line-clamp-3 font-serif">
            {teaserShort}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Link to={`/creator/${creatorRouteId}`} className="flex items-center gap-2 hover:opacity-80">
            <Avatar className="h-6 w-6 ring-1 ring-amber-400/40">
              <AvatarImage src={author.avatar_url || undefined} alt={username} />
              <AvatarFallback className="text-[10px]">{username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">@{username}</span>
          </Link>
          {readTime ? (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> {readTime} min
            </span>
          ) : null}
          <Button
            size="sm"
            onClick={handleOpenReader}
            className="ml-auto h-8 bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1"
          >
            {effectiveAccess ? meta.cta : (post.is_paid ? "Assinar Canal" : meta.cta)}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Barra de ações */}
        <div className="flex items-center gap-1 pt-2 mt-1 border-t border-amber-500/15">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={isPostOwner || likePost.isPending}
            title={post.is_liked ? "Descurtir" : "Curtir"}
            className={cn(
              "flex-1 gap-1.5 h-8 px-2",
              post.is_liked
                ? "text-[hsl(0,84%,55%)]"
                : "text-[hsl(0,84%,55%)]/70 hover:text-[hsl(0,84%,55%)] hover:bg-[hsl(0,84%,55%)]/10",
            )}
          >
            <Heart className={cn("h-4 w-4", post.is_liked && "fill-current")} />
            <span className="text-xs">{formatNumber(post.likes_count || 0)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDislike}
            disabled={dislikePost.isPending}
            title={isDisliked ? "Remover descurtida" : "Descurtir"}
            className={cn(
              "flex-1 gap-1.5 h-8 px-2",
              isDisliked
                ? "text-[hsl(220,15%,55%)]"
                : "text-[hsl(220,15%,55%)]/70 hover:text-[hsl(220,15%,55%)] hover:bg-[hsl(220,15%,55%)]/10",
            )}
          >
            <ThumbsDown className={cn("h-4 w-4", isDisliked && "fill-current")} />
            <span className="text-xs">{formatNumber(dislikeCount)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={savePost.isPending}
            title={post.is_saved ? "Remover dos salvos" : "Salvar"}
            className={cn(
              "flex-1 gap-1.5 h-8 px-2",
              post.is_saved
                ? "text-[hsl(45,95%,55%)]"
                : "text-[hsl(45,95%,55%)]/70 hover:text-[hsl(45,95%,55%)] hover:bg-[hsl(45,95%,55%)]/10",
            )}
          >
            <Bookmark className={cn("h-4 w-4", post.is_saved && "fill-current")} />
            <span className="text-xs">{formatNumber(saveCount)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowShareModal(true); }}
            title="Compartilhar (copiar link)"
            className="flex-1 gap-1.5 h-8 px-2 text-[hsl(150,70%,45%)]/80 hover:text-[hsl(150,70%,45%)] hover:bg-[hsl(150,70%,45%)]/10"
          >
            <Share2 className="h-4 w-4" />
            <span className="text-xs">{formatNumber(sharesCount)}</span>
          </Button>

          {!isPostOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!requireAuth()) return; setShowGiftModal(true); }}
              title="Enviar presente XP ao criador"
              className="flex-1 gap-1.5 h-8 px-2 text-amber-400/80 hover:text-amber-400 hover:bg-amber-400/10"
            >
              <Gift className="h-4 w-4" />
              <PostGiftCounter postId={post.id} />
            </Button>
          )}

          <div
            title="Visualizações do diário"
            className="flex items-center gap-1 px-2 h-8 text-xs text-amber-200/80"
          >
            <Eye className="h-4 w-4" />
            <span>{formatNumber(viewCount)}</span>
          </div>
        </div>
      </div>

      {/* Modais */}
      <SharePostModal
        open={showShareModal}
        onOpenChange={setShowShareModal}
        postId={post.id}
        postPreview={post.title || teaserShort || undefined}
        shareUrlOverride={buildShareUrl(`/leitura/${post.id}`, post.updated_at || post.created_at || undefined)}
      />

      {!isPostOwner && (
        <AuraXpGiftModal
          open={showGiftModal}
          onOpenChange={setShowGiftModal}
          title="Enviar presente ao criador"
          contextLabel="por este diário"
          postId={post.id}
          lockedReceiver={{
            id: ((author as any)?.id ?? post.user_id) as string,
            user_id: (post.user_id ?? null) as string | null,
            username: (author?.username ?? null) as string | null,
            name: (author?.name ?? null) as string | null,
            avatar_url: (author?.avatar_url ?? null) as string | null,
          }}
        />
      )}
    </Card>
  );
});

export default VipNarrativeFeedCard;
