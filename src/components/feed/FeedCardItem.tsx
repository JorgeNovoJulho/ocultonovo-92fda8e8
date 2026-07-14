import { memo, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MessageSquare,
  Flame,
  MoreVertical,
  Play,
  ThumbsDown,
  Bookmark,
  Share2,
  ExternalLink,
  Pencil,
  Trash2,
  Flag,
  Shield,
  Globe,
  Users,
  Crown,
  EyeOff,
  Gift,
} from "lucide-react";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CachedImage } from "@/components/common/CachedImage";
import { cn } from "@/lib/utils";
import { isVideoUrl } from "@/lib/mediaType";
import { useLikePostExclusive } from "@/hooks/usePostLikes";
import { useDislikePost, usePostDislikeStatus } from "@/hooks/usePostDislikes";
import { useSavePost, useDeletePost } from "@/hooks/usePosts";
import { useMoveMedia, type PrivacyLevel } from "@/hooks/useMediaManager";
import { useAuth } from "@/hooks/useAuth";
import { PostExpandedModal } from "@/components/PostExpandedModal";
import { lazy, Suspense } from "react";
const ChannelContentViewer = lazy(() => import("@/components/creator/ChannelContentViewer"));
import { ContentReportModal } from "@/components/reports/ContentReportModal";
const CreatePostModal = lazy(() => import("@/components/CreatePostModal").then(m => ({ default: m.CreatePostModal })));
import { AdultMediaBlurOverlay } from "@/components/feed/AdultMediaBlurOverlay";
import { useAdultBlurDecision } from "@/safe-blur/useAdultBlurDecision";


interface Props {
  post: any;
}

/**
 * FeedCardItem — card quadrado do "Modo Card".
 * Ações ativas: abrir modal expandido, abrir perfil, curtir, descurtir, comentar, salvar, menu (...).
 */
export const FeedCardItem = memo(function FeedCardItem({ post }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const author = post?.author ?? {};
  const username = author?.username || (post as any)?.username || "anonimo";
  const avatar = author?.avatar_url || (post as any)?.avatar_url || undefined;
  const isOnline = !!(author?.is_online ?? (post as any)?.is_online);

  const city = author?.city || (post as any)?.city || null;
  const state = author?.state || author?.uf || (post as any)?.state || (post as any)?.uf || null;
  const location = [city, state].filter(Boolean).join("/");

  const createdAt = post?.created_at ? new Date(post.created_at) : null;
  const timeAgo = useMemo(() => {
    if (!createdAt) return "";
    return formatDistanceToNow(createdAt, { locale: ptBR })
      .replace("aproximadamente ", "")
      .replace("menos de ", "")
      .replace("cerca de ", "");
  }, [post?.created_at]);

  const mediaUrl =
    post?.media_url || (Array.isArray(post?.media_urls) ? post.media_urls[0] : null);
  const isVideo = mediaUrl && isVideoUrl(mediaUrl);
  const thumb = (post as any)?.thumbnail_url || (post as any)?.poster_url || mediaUrl;

  // VIP / Pago — REGRA OFICIAL DO PRODUTO:
  // Um post só é "VIP" (moldura dourada + selo dourado) quando o PRÓPRIO
  // CONTEÚDO foi marcado como VIP/pago pelo autor — independente do plano
  // dele. Autor VIP que posta com privacidade 'public' aparece igual a
  // qualquer postagem normal (mesma moldura, sem selo dourado destacado).
  //
  // Critérios (qualquer um já marca como VIP):
  //   - privacy_level = 'vip' | 'subscribers' | 'paid'
  //   - is_paid = true
  //   - is_locked = true (com preço/assinatura)
  //   - paid_price > 0  (qualquer preço definido = conteúdo pago)
  //   - is_vip = true (flag explícita do post, não do autor)
  //
  // NÃO usar plan_type/plan do autor aqui. Plano do autor afeta apenas
  // perks sociais (selo de status no header), nunca a moldura do card.
  const privacy = String((post as any)?.privacy_level ?? '').toLowerCase();
  const isPaidPost =
    (post as any)?.is_paid === true ||
    (post as any)?.is_locked === true ||
    (post as any)?.is_vip === true ||
    Number((post as any)?.paid_price || 0) > 0 ||
    Number((post as any)?.price || 0) > 0;

  // Narrativos (Diário VIP, Capítulo, Série, História, Texto, Bastidores) sempre
  // recebem o destaque VIP (moldura dourada + selo) — é conteúdo de canal.
  const isNarrativePost =
    (post as any)?.content_format === 'narrative' ||
    ['diary', 'chapter', 'series', 'story', 'article', 'text_post', 'backstage', 'narrative']
      .includes(String((post as any)?.section_type ?? '').toLowerCase());

  const isVipPost =
    privacy === 'vip' ||
    privacy === 'subscribers' ||
    privacy === 'paid' ||
    isPaidPost ||
    isNarrativePost;

  // Áudio — renderiza player no card
  const isAudioPost =
    (post as any)?.post_type === 'voice_bio' ||
    (post as any)?.media_type === 'audio' ||
    (typeof mediaUrl === 'string' && /\.(mp3|wav|ogg|m4a|webm)(\?|$)/i.test(mediaUrl));
  const isPoll = (post as any)?.post_type === 'poll';
  const { shouldBlur: shouldBlurAdult } = useAdultBlurDecision({
    postId: post.id,
    isAdult: (post as any)?.is_adult,
  });
  const shouldBlurMedia = Boolean(mediaUrl) && !isAudioPost && !isPoll && shouldBlurAdult;

  const contentText = (post as any)?.content_text || '';
  const teaser = contentText
    ? String(contentText).slice(0, 140) + (contentText.length > 140 ? '…' : '')
    : '';

  const likes = post?.likes_count ?? 0;
  const comments = post?.comments_count ?? 0;
  const isLiked = !!post?.is_liked;
  const isSaved = !!post?.is_saved;

  // dislike status
  const { data: dislikeSet } = usePostDislikeStatus(post?.id ? [post.id] : []);
  const isDisliked = !!(dislikeSet && post?.id && dislikeSet.has(post.id));

  const likePost = useLikePostExclusive();
  const dislikePost = useDislikePost();
  const savePost = useSavePost();
  const deletePost = useDeletePost();
  const moveMedia = useMoveMedia();

  const isOwner =
    !!user?.id &&
    (user.id === post?.user_id ||
      user.id === post?.author?.user_id ||
      user.id === (post as any)?.author_id);

  // Privacidade atual derivada do post
  const currentPrivacy: PrivacyLevel = (() => {
    const p = (post as any)?.privacy_level;
    if (p === 'friends' || p === 'vip' || p === 'hidden' || p === 'public') return p;
    return 'public';
  })();
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);

  const profileHref = username ? `/${username}` : `/profile/${post?.user_id ?? ""}`;

  // Stop helper
  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const openExpanded = useCallback((e?: React.SyntheticEvent) => {
    if (e) stop(e);
    setExpandedOpen(true);
  }, []);

  const goToProfile = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      navigate(profileHref);
    },
    [navigate, profileHref],
  );

  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      if (!user?.id) {
        toast.error("Entre para curtir");
        return;
      }
      if (isOwner) {
        toast.error("Você não pode curtir o próprio post");
        return;
      }
      likePost.mutate({ postId: post.id, isLiked });
    },
    [user?.id, isOwner, likePost, post?.id, isLiked],
  );

  const handleDislike = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      if (!user?.id) {
        toast.error("Entre para reagir");
        return;
      }
      dislikePost.mutate({ postId: post.id, isDisliked });
    },
    [user?.id, dislikePost, post?.id, isDisliked],
  );

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      if (!user?.id) {
        toast.error("Entre para salvar");
        return;
      }
      savePost.mutate({ postId: post.id, isSaved });
    },
    [user?.id, savePost, post?.id, isSaved],
  );

  const handleShare = useCallback(async () => {
    try {
      const url = `${window.location.origin}/?post=${post.id}`;
      if ((navigator as any).share) {
        await (navigator as any).share({ url, title: `Post de @${username}` });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado");
      }
    } catch {
      /* user cancelled */
    }
  }, [post?.id, username]);

  const handleChangePrivacy = useCallback(
    async (level: PrivacyLevel) => {
      if (level === currentPrivacy && level !== 'vip') return;
      let price: number | null | undefined = undefined;
      if (level === 'vip') {
        const existing = Number((post as any)?.paid_price || 0);
        const input = window.prompt(
          'Defina o preço em R$ para desbloquear este conteúdo VIP:',
          existing > 0 ? String(existing) : '9.90',
        );
        if (input == null) return;
        const parsed = Number(String(input).replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed <= 0) {
          toast.error('Preço inválido. Informe um valor maior que zero.');
          return;
        }
        price = Number(parsed.toFixed(2));
      }
      try {
        await moveMedia.mutateAsync({
          mediaId: post.id,
          newPrivacyLevel: level,
          price,
        });
      } catch {
        /* toast já tratado no hook */
      }
    },
    [currentPrivacy, moveMedia, post?.id, post],
  );

  const handleConfirmDelete = useCallback(async () => {
    try {
      await deletePost.mutateAsync({
        id: post.id,
        media_url: post.media_url,
        video_master_url: (post as any).video_master_url,
      });
      toast.success('Postagem excluída');
    } catch {
      toast.error('Erro ao excluir. Tente novamente.');
    }
    setDeleteOpen(false);
  }, [deletePost, post]);


  return (
    <>
      <article
        onClick={openExpanded}
        className={cn(
          "group bg-card border rounded-2xl overflow-hidden flex flex-col shadow-sm active:scale-[0.995] transition-all cursor-pointer",
          isVipPost
            ? "border-[hsl(45,93%,47%)]/50 hover:border-[hsl(45,93%,47%)] shadow-[0_0_0_1px_hsl(45_93%_47%_/_0.15)] bg-gradient-to-br from-[hsl(45,93%,47%)]/5 via-card to-card"
            : "border-border/40 hover:border-border/70",
        )}
      >
        {/* Header */}
        <header className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={goToProfile}
            className="relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label={`Abrir perfil de @${username}`}
          >
            <Avatar className="h-9 w-9 ring-1 ring-border/40">
              <AvatarImage src={avatar} alt={username} />
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isOnline && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            )}
          </button>

          <button
            type="button"
            onClick={goToProfile}
            className="min-w-0 flex-1 text-left group/u"
          >
            <p className="text-sm font-bold text-primary truncate group-hover/u:underline">
              @{username}
            </p>
            {location && (
              <p className="text-[11px] text-muted-foreground truncate leading-tight">
                {location}
              </p>
            )}
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            {timeAgo && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {timeAgo}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 -mr-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50"
                  aria-label="Mais opções"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
                className="w-56"
              >
                <DropdownMenuItem onClick={(e) => { stop(e); openExpanded(); }}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir publicação
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { stop(e); void handleShare(); }}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Compartilhar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSave}>
                  <Bookmark className={cn("h-4 w-4 mr-2", isSaved && "fill-current text-primary")} />
                  {isSaved ? "Remover dos salvos" : "Salvar"}
                </DropdownMenuItem>

                {/* === Apenas dono === */}
                {isOwner && !isPoll && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => { stop(e); setEditOpen(true); }}
                      className="gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar postagem
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <Shield className="h-4 w-4" />
                        Privacidade
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-[200px]">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Mover para
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={(e) => { stop(e); void handleChangePrivacy('public'); }}
                          className={cn("gap-2", currentPrivacy === 'public' && "bg-primary/10 text-primary")}
                        >
                          <Globe className="h-4 w-4 text-primary" />
                          Público {currentPrivacy === 'public' && '•'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { stop(e); void handleChangePrivacy('friends'); }}
                          className={cn("gap-2", currentPrivacy === 'friends' && "bg-primary/10 text-primary")}
                        >
                          <Users className="h-4 w-4 text-blue-400" />
                          Amigos (Seguindo) {currentPrivacy === 'friends' && '•'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { stop(e); void handleChangePrivacy('vip'); }}
                          className={cn("gap-2", currentPrivacy === 'vip' && "bg-primary/10 text-primary")}
                        >
                          <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                          Conteúdo VIP {currentPrivacy === 'vip' && '•'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { stop(e); void handleChangePrivacy('hidden'); }}
                          className={cn("gap-2", currentPrivacy === 'hidden' && "bg-destructive/10 text-destructive")}
                        >
                          <EyeOff className="h-4 w-4" />
                          Invisível a todos {currentPrivacy === 'hidden' && '•'}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuItem
                      onClick={(e) => { stop(e); setDeleteOpen(true); }}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir postagem
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    stop(e);
                    navigate(profileHref);
                  }}
                >
                  Ver perfil de @{username}
                </DropdownMenuItem>

                {/* === Enviar presente — não-dono === */}
                {!isOwner && (
                  <DropdownMenuItem
                    onClick={(e) => { stop(e); setGiftOpen(true); }}
                    className="gap-2 text-amber-600 dark:text-amber-400 focus:text-amber-700 dark:focus:text-amber-300"
                  >
                    <Gift className="h-4 w-4" />
                    Enviar presente
                  </DropdownMenuItem>
                )}

                {/* === Denunciar — visível para todos (exceto dono) === */}
                {!isOwner && (
                  <DropdownMenuItem
                    onClick={(e) => { stop(e); setReportOpen(true); }}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <Flag className="h-4 w-4" />
                    Denunciar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Media / Áudio / Texto */}
        {isAudioPost ? (
          <div
            className="relative block bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent border-y border-border/30 px-3 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary mb-2">
              <Play className="h-3 w-3" /> Áudio
              {(post as any)?.media_duration_seconds ? (
                <span className="text-muted-foreground font-normal normal-case tracking-normal">
                  · {(post as any).media_duration_seconds}s
                </span>
              ) : null}
            </div>
            <audio
              src={mediaUrl || undefined}
              controls
              controlsList="nodownload noplaybackrate"
              preload="metadata"
              className="w-full h-9"
              onContextMenu={(e) => e.preventDefault()}
            />
            {teaser && (
              <p className="mt-2 text-xs text-foreground/80 line-clamp-3">{teaser}</p>
            )}
          </div>
        ) : (
          <div className="relative block aspect-square bg-muted/30 overflow-hidden">
            <AdultMediaBlurOverlay postId={post.id} active={shouldBlurMedia} className="absolute inset-0">
            {mediaUrl ? (
              <>
                <CachedImage
                  src={thumb || mediaUrl}
                  alt={`Publicação de @${username}`}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover",
                    isVipPost && "transition-transform duration-500 group-hover:scale-[1.02]",
                  )}
                  loading="lazy"
                  decoding="async"
                />
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <div className="h-12 w-12 rounded-full bg-black/60 flex items-center justify-center">
                      <Play className="h-6 w-6 text-white fill-white" />
                    </div>
                  </div>
                )}
                {/* Selo VIP no canto */}
                {isVipPost && (
                  <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[hsl(45,93%,47%)]/95 text-black text-[10px] font-bold shadow">
                    <Crown className="h-3 w-3" /> VIP
                  </div>
                )}
                {/* Teaser de texto sobre a mídia (gradiente inferior) */}
                {teaser && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-2">
                    <p className="text-[11px] text-white/95 line-clamp-2 leading-tight">
                      {teaser}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <p
                  className={cn(
                    "text-xs text-center line-clamp-6",
                    isVipPost ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  {contentText || "Publicação"}
                </p>
                {isVipPost && (
                  <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[hsl(45,93%,47%)]/95 text-black text-[10px] font-bold shadow">
                    <Crown className="h-3 w-3" /> VIP
                  </div>
                )}
              </div>
            )}
            </AdultMediaBlurOverlay>
          </div>
        )}


        {/* Footer — ações */}
        <footer className="flex items-center gap-1 px-2 py-2">
          <button
            type="button"
            onClick={openExpanded}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            aria-label="Comentar"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs font-medium">{comments}</span>
          </button>

          <button
            type="button"
            onClick={handleLike}
            disabled={likePost.isPending}
            className={cn(
              "flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-muted/40 transition-colors",
              isLiked ? "text-orange-400" : "text-muted-foreground hover:text-orange-300",
            )}
            aria-label={isLiked ? "Remover curtida" : "Curtir"}
          >
            <Flame className={cn("h-4 w-4", isLiked && "fill-current", likePost.isPending && "animate-pulse")} />
            <span className="text-xs font-medium">{likes}</span>
          </button>

          <button
            type="button"
            onClick={handleDislike}
            disabled={dislikePost.isPending}
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md hover:bg-muted/40 transition-colors",
              isDisliked ? "text-blue-400" : "text-muted-foreground hover:text-blue-300",
            )}
            aria-label={isDisliked ? "Remover descurtida" : "Descurtir"}
          >
            <ThumbsDown className={cn("h-4 w-4", isDisliked && "fill-current", dislikePost.isPending && "animate-pulse")} />
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleSave}
            disabled={savePost.isPending}
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md hover:bg-muted/40 transition-colors",
              isSaved ? "text-primary" : "text-muted-foreground hover:text-primary",
            )}
            aria-label={isSaved ? "Remover dos salvos" : "Salvar"}
          >
            <Bookmark className={cn("h-4 w-4", isSaved && "fill-current", savePost.isPending && "animate-pulse")} />
          </button>
        </footer>
      </article>

      {/* Modal expandido — abre ao clicar em qualquer área "neutra" do card */}
      {/* Modal expandido — narrativos abrem o leitor do canal (ChannelContentViewer);
          demais posts abrem o modal padrão. */}
      {isNarrativePost ? (
        <Suspense fallback={null}>
          <ChannelContentViewer
            open={expandedOpen}
            onOpenChange={setExpandedOpen}
            post={post}
          />
        </Suspense>
      ) : (
        <PostExpandedModal
          open={expandedOpen}
          onOpenChange={setExpandedOpen}
          post={post}
          isLiked={isLiked}
          isDisliked={isDisliked}
          isSaved={isSaved}
        />
      )}


      {/* Link semântico oculto para SEO — opcional */}
      <Link to={`/?post=${post?.id ?? ""}`} className="sr-only">
        Abrir publicação
      </Link>

      {/* Denunciar — visível para todos (exceto dono) */}
      {!isOwner && (
        <ContentReportModal
          open={reportOpen}
          onOpenChange={setReportOpen}
          postId={post.id}
          reportedUserId={post.user_id}
          contentPreview={post.content_text || undefined}
        />
      )}

      {/* Enviar presente — não-dono */}
      {!isOwner && giftOpen && (
        <AuraXpGiftModal
          open={giftOpen}
          onOpenChange={setGiftOpen}
          title="Enviar presente ao criador"
          contextLabel="por esta publicação"
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

      {/* Editar postagem — apenas dono */}
      {isOwner && !isPoll && editOpen && (
        <Suspense fallback={null}>
          <CreatePostModal
            open={editOpen}
            onOpenChange={setEditOpen}
            editPost={post}
          />
        </Suspense>
      )}

      {/* Excluir postagem — apenas dono */}
      {isOwner && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent
            className="w-[calc(100vw-1rem)] sm:w-auto max-w-sm rounded-2xl p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir postagem?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta postagem permanentemente?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={deletePost.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletePost.isPending ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>

  );
});
