import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Heart, ThumbsDown, Bookmark, Eye, MessageCircle, ExternalLink, Users2, ArrowRight, Mic } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { CommentSection } from "@/components/comments/CommentSection";
import { LikersModal } from "@/components/LikersModal";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { MisterioPost } from "@/hooks/useMisteriosDestaque";
import { toast } from "@/hooks/use-toast";
import { useCentralColumnRect } from "@/hooks/useCentralColumnRect";
import { parseCommunityTopicSnapshot } from "@/components/feed/CommunityTopicFeedCard";
import { TopicRepliesInline } from "@/components/communities/TopicRepliesInline";

/**
 * Calcula aspect-ratio real da mídia (img/video) e renderiza com object-cover,
 * preenchendo 100% do contêiner sem faixas pretas em nenhum tamanho de tela.
 * No desktop o fundo preto só aparece quando a coluna ainda é maior que a mídia.
 */
function MediaFrame({ src, isVideo }: { src: string; isVideo: boolean }) {
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    setRatio(null);
    if (!src) return;
    let cancelled = false;
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = src;
      v.onloadedmetadata = () => {
        if (cancelled) return;
        if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
      };
    } else {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (cancelled) return;
        if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
      };
      img.src = src;
    }
    return () => { cancelled = true; };
  }, [src, isVideo]);

  const style = ratio ? { aspectRatio: String(ratio) } : { aspectRatio: "1 / 1" };

  return (
    <div className="w-full lg:flex-[0_0_65%] lg:h-full lg:self-stretch flex items-center justify-center bg-background overflow-hidden">
      {/* Mobile: altura limitada a ~55dvh para o modal caber inteiro na viewport
          sem o usuário precisar rolar (header+ações+comentários abaixo).
          Desktop: object-contain ocupa 100% da coluna. */}
      <div
        className="relative w-full max-w-full lg:hidden mx-auto"
        style={{ ...style, maxHeight: '55dvh' }}
      >
        {isVideo ? (
          <video src={src} controls preload="metadata" playsInline className="absolute inset-0 w-full h-full object-contain" />
        ) : (
          <img src={src} alt="" loading="eager" decoding="async" className="absolute inset-0 w-full h-full object-contain" />
        )}
      </div>
      <div className="hidden lg:flex w-full h-full items-center justify-center">
        {isVideo ? (
          <video src={src} controls preload="metadata" playsInline className="max-w-full max-h-full w-auto h-auto object-contain" />
        ) : (
          <img src={src} alt="" loading="eager" decoding="async" className="max-w-full max-h-full w-auto h-auto object-contain" />
        )}
      </div>
    </div>
  );
}




interface Props {
  post: MisterioPost | null;
  onClose: () => void;
}

export function PostMysteryViewer({ post, onClose }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(post?.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(post?.comments_count || 0);
  const [viewCount, setViewCount] = useState(0);
  const [likersOpen, setLikersOpen] = useState(false);
  const [fetchedAuthor, setFetchedAuthor] = useState<{ username?: string | null; avatar_url?: string | null; name?: string | null } | null>(null);

  // Fallback: se o post não trouxe autor, busca em profiles por author_id/user_id
  useEffect(() => {
    setFetchedAuthor(null);
    if (!post) return;
    const hasUsername = !!post.author?.username;
    const hasAvatar = !!post.author?.avatar_url;
    if (hasUsername && hasAvatar) return;
    const authorId = (post as any).author_id || (post as any).user_id;
    if (!authorId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("username, avatar_url, name, id, user_id")
          .or(`id.eq.${authorId},user_id.eq.${authorId}`)
          .limit(1)
          .maybeSingle();
        if (!cancelled && data) {
          setFetchedAuthor({ username: data.username, avatar_url: data.avatar_url, name: data.name });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [post?.id, (post as any)?.author_id, (post as any)?.user_id, post?.author?.username, post?.author?.avatar_url]);

  useEffect(() => {
    setLikeCount(post?.likes_count || 0);
    setCommentsCount(post?.comments_count || 0);
  }, [post?.id, post?.likes_count, post?.comments_count]);

  // Realtime: likes + comments counters atualizam sozinhos
  useEffect(() => {
    if (!post?.id) return;
    const postId = post.id;
    const unsubLikes = subscribeTable('post_likes', async (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.post_id !== postId) return;
      const { count } = await (supabase as any)
        .from("post_likes")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (typeof count === "number") setLikeCount(count);
    });
    const unsubComments = subscribeTable('comments', async (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.post_id !== postId) return;
      const { count } = await (supabase as any)
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (typeof count === "number") setCommentsCount(count);
    });
    return () => { unsubLikes(); unsubComments(); };
  }, [post?.id]);



  // Registra visualização única por username + carrega contador, estado like/save
  useEffect(() => {
    if (!post?.id) return;
    let cancelled = false;

    (async () => {
      const username = profile?.username || user?.email || null;
      if (username) {
        try {
          await (supabase as any)
            .from("oculto_post_views")
            .insert({ post_id: post.id, username })
            .select("id")
            .maybeSingle();
        } catch { /* unique violation ignored */ }
      }

      const [{ data: vc }, likeRes, saveRes, dislikeRes] = await Promise.all([
        (supabase as any).from("v_post_view_counts").select("views_count").eq("post_id", post.id).maybeSingle(),
        user
          ? (supabase as any).from("post_likes").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user
          ? (supabase as any).from("saved_posts").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user
          ? (supabase as any).from("post_dislikes").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;
      setViewCount((vc as any)?.views_count || 0);
      setLiked(!!(likeRes as any)?.data);
      setSaved(!!(saveRes as any)?.data);
      setDisliked(!!(dislikeRes as any)?.data);
    })();

    return () => { cancelled = true; };
  }, [post?.id, user?.id, profile?.username]);

  const columnRect = useCentralColumnRect(!!post);

  if (!post) return null;

  const topicSnap = parseCommunityTopicSnapshot((post as any).content_text);
  const isVoiceBio = (post as any).post_type === "voice_bio" || (post.media_type || "").toLowerCase() === "audio";
  const voiceBioUrl = isVoiceBio ? (post.media_url || null) : null;

  const authorUsername = post.author?.username || fetchedAuthor?.username || null;
  const authorAvatar = post.author?.avatar_url || fetchedAuthor?.avatar_url || "";
  const profilePath = authorUsername ? `/u/${authorUsername}` : null;
  const isVideo = (post.media_type || "").startsWith("video");

  const toggleLike = async () => {
    if (!user) return toast({ title: "Faça login para curtir" });
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
    try {
      if (next) {
        await (supabase as any).from("post_likes").insert({ post_id: post.id, user_id: user.id });
        if (disliked) {
          await (supabase as any).from("post_dislikes").delete().eq("post_id", post.id).eq("user_id", user.id);
          setDisliked(false);
        }
      } else {
        await (supabase as any).from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      }
    } catch (e: any) {
      setLiked(!next);
      setLikeCount((c) => (next ? Math.max(0, c - 1) : c + 1));
    }
  };

  const toggleDislike = async () => {
    if (!user) return toast({ title: "Faça login para reagir" });
    const next = !disliked;
    setDisliked(next);
    try {
      if (next) {
        await (supabase as any).from("post_dislikes").insert({ post_id: post.id, user_id: user.id });
        if (liked) {
          await (supabase as any).from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
          setLiked(false);
          setLikeCount((c) => Math.max(0, c - 1));
        }
      } else {
        await (supabase as any).from("post_dislikes").delete().eq("post_id", post.id).eq("user_id", user.id);
      }
    } catch {
      setDisliked(!next);
    }
  };

  const toggleSave = async () => {
    if (!user) return toast({ title: "Faça login para salvar" });
    const next = !saved;
    setSaved(next);
    try {
      if (next) {
        await (supabase as any).from("saved_posts").insert({ post_id: post.id, user_id: user.id });
      } else {
        await (supabase as any).from("saved_posts").delete().eq("post_id", post.id).eq("user_id", user.id);
      }
    } catch {
      setSaved(!next);
    }
  };

  

  const modal = (
    <div
      className="fixed top-0 z-[2147483000] bg-background/95 backdrop-blur-sm flex items-stretch justify-center overflow-hidden"
      style={{
        height: '100dvh',
        left: columnRect ? `${columnRect.left}px` : 0,
        width: columnRect ? `${columnRect.width}px` : '100vw',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full h-full flex flex-col lg:flex-row lg:items-stretch overflow-hidden bg-background">
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 left-3 z-10 h-9 w-9 rounded-full bg-background/70 border border-border hover:bg-muted flex items-center justify-center text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Media — variantes especiais (tópico de comunidade / voice bio) ou mídia normal */}
        {topicSnap ? (
          <div className="w-full lg:flex-[0_0_65%] lg:h-full lg:self-stretch flex items-center justify-center overflow-hidden p-4 sm:p-6"
               style={{ background: `linear-gradient(135deg, ${topicSnap.accent_color || '#7c3aed'}22, transparent)` }}>
            <div className="w-full max-w-md rounded-2xl border bg-card overflow-hidden shadow-lg"
                 style={{ borderColor: `${topicSnap.accent_color || '#7c3aed'}55` }}>
              {(topicSnap.community_cover_url || topicSnap.community_avatar_url) && (
                <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                  <img
                    src={(topicSnap.community_cover_url || topicSnap.community_avatar_url)!}
                    alt={topicSnap.community_title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold mb-2"
                     style={{ color: topicSnap.accent_color || '#7c3aed' }}>
                  <Users2 className="h-3 w-3" /> {topicSnap.community_title}
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug">
                  {topicSnap.topic_title}
                </h2>
                <Button asChild size="sm" className="mt-3 gap-1.5 font-semibold text-white hover:opacity-90"
                        style={{ background: topicSnap.accent_color || '#7c3aed' }}>
                  <Link to={`/comunidades/${topicSnap.community_slug}/topico/${topicSnap.topic_id}`}
                        onClick={onClose}>
                    Abrir tópico completo
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : isVoiceBio && voiceBioUrl ? (
          <div className="w-full lg:flex-[0_0_65%] lg:h-full lg:self-stretch flex items-center justify-center p-6 bg-gradient-to-br from-fuchsia-600/20 via-purple-700/20 to-indigo-800/20">
            <div className="w-full max-w-md rounded-2xl bg-card/90 border border-border p-5 shadow-lg">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 mb-3">
                <Mic className="h-4 w-4" /> Bio em áudio
              </div>
              <audio src={voiceBioUrl} controls preload="metadata" className="w-full" />
            </div>
          </div>
        ) : (
          <MediaFrame src={post.media_url || ""} isVideo={isVideo} />
        )}

        {/* Right column — auto-height; comments crescem em tempo real e a coluna se ajusta */}
        <aside className="flex-1 lg:flex-[0_0_35%] flex flex-col border-t lg:border-t-0 lg:border-l border-border bg-background min-h-0 lg:h-full overflow-hidden">


        {/* Header */}
        <header className="p-3 sm:p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-1 ring-border">
              <AvatarImage src={authorAvatar} />
              <AvatarFallback>{(authorUsername || "u").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              {profilePath ? (
                <Link
                  to={profilePath}
                  className="text-sm font-semibold text-foreground hover:underline truncate block"
                >
                  @{authorUsername || "usuario"}
                </Link>
              ) : (
                <span className="text-sm font-semibold text-foreground">@{authorUsername || "usuario"}</span>
              )}

              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
            {profilePath && (
              <Link
                to={profilePath}
                onClick={onClose}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Ver perfil <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
          {topicSnap ? (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: topicSnap.accent_color || '#7c3aed' }}>
                {topicSnap.topic_title}
              </p>
              {topicSnap.topic_body && (
                <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {topicSnap.topic_body}
                </p>
              )}
            </div>
          ) : post.content_text && (
            <p className="mt-2 text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {post.content_text}
            </p>
          )}
        </header>

        {/* Actions + Ver curtidas */}
        <div className="px-3 sm:px-4 py-2 border-b border-border flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={toggleLike} className={cn("gap-1.5", liked && "text-rose-500")}>
            <Heart className={cn("h-4 w-4", liked && "fill-rose-500")} />
            <span className="text-xs font-semibold">{likeCount}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleDislike} className={cn("gap-1.5", disliked && "text-amber-500")}>
            <ThumbsDown className={cn("h-4 w-4", disliked && "fill-amber-500")} />
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleSave} className={cn("gap-1.5", saved && "text-primary")}>
            <Bookmark className={cn("h-4 w-4", saved && "fill-primary")} />
          </Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
            <MessageCircle className="h-3.5 w-3.5" /> <span>{commentsCount}</span>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setLikersOpen(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Ver curtidas
          </button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-3">
            <Eye className="h-3.5 w-3.5" /> <span>{viewCount}</span>
          </div>
        </div>


        {/* Comments / Replies */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 sm:p-4">
            {topicSnap ? (
              <TopicRepliesInline
                topicId={topicSnap.topic_id}
                repliesCount={(post as any).comments_count ?? commentsCount ?? 0}
                communitySlug={topicSnap.community_slug}
                accentColor={topicSnap.accent_color || undefined}
                isOpen={true}
                onToggle={() => { /* sempre aberto dentro do viewer */ }}
              />
            ) : (
              <CommentSection postId={post.id} />
            )}
          </div>
        </ScrollArea>
      </aside>
      </div>
      <LikersModal
        open={likersOpen}
        onOpenChange={setLikersOpen}
        postId={post.id}
        likesCount={likeCount}
      />
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}


