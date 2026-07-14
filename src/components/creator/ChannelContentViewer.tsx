import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Play, Pause, Volume2, VolumeX, Bookmark, BookmarkCheck,
  Gauge, LoaderCircle, Maximize2, Minimize2, X, BookOpen, Clock, Share2, Check,
  Heart, ThumbsDown, MessageCircle, Eye,
} from "lucide-react";
import { useSavePost } from "@/hooks/usePosts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTrackNarrativeProgress } from "@/hooks/useReadProgress";
import DiaryMediaPlayer from "@/components/creator/blog/DiaryMediaPlayer";
import { buildShareUrl } from "@/lib/appConfig";
import { useDiaryPostAccess } from "@/hooks/useDiaryPostAccess";
import { DiaryPaywall } from "@/components/creator/DiaryPaywall";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { CommentSection } from "@/components/comments/CommentSection";

/** Auto-linkify URLs preservando tags existentes. */
const _URL_RE = /\bhttps?:\/\/[^\s<>]+/gi;
function autoLinkifyHtml(html: string): string {
  if (!html) return "";
  const parts = html.split(/(<a\b[^>]*>.*?<\/a>)/gi);
  return parts.map((p) => /^<a\b/i.test(p) ? p : p.replace(_URL_RE, (m) =>
    `<a href="${m}" target="_blank" rel="noopener noreferrer" style="color:#fbbf24;text-decoration:underline;word-break:break-all">${m}</a>`,
  )).join("");
}

/** Detecta cores muito escuras (preto/quase preto) que ficariam ilegíveis
 *  no tema escuro do leitor. Se sim, ignoramos e deixamos herdar do prose. */
function isDarkColor(c: string | undefined | null): boolean {
  if (!c) return true; // sem cor = herdar
  const s = String(c).trim().toLowerCase();
  if (s === "inherit" || s === "currentcolor" || s === "transparent") return true;
  // Hex
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // luminância relativa simples
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 80;
  }
  // rgb()/rgba()
  const rgb = s.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").map((x) => parseFloat(x));
    return (0.2126 * (r || 0) + 0.7152 * (g || 0) + 0.0722 * (b || 0)) < 80;
  }
  // nomes comuns escuros
  return ["black", "#000", "#000000"].includes(s);
}

/** Renderiza blocos do Diário VIP (texto rico, imagem, vídeo, áudio, link) fielmente. */
function DiaryBlocksReader({ blocks }: { blocks: any[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b: any) => {
        if (b?.type === "text") {
          const html = autoLinkifyHtml(b.html || (b.text ? String(b.text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)).replace(/\n/g, "<br>") : ""));
          // Ignora cores escuras gravadas no editor — o leitor é dark e
          // textos pretos ficavam invisíveis. Mantém a cor só quando for
          // suficientemente clara (acento intencional do autor).
          const safeColor = isDarkColor(b.color) ? undefined : b.color;
          return (
            <div
              key={b.id}
              className="text-foreground"
              style={{
                fontFamily: b.fontFamily, fontSize: `${b.fontSize || 17}px`,
                ...(safeColor ? { color: safeColor } : {}),
                textAlign: b.align || "left",
                lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        if (b?.type === "image") {
          return (
            <figure key={b.id} className="space-y-1">
              <img decoding="async" src={b.url} alt={b.caption || ""} loading="lazy" className="w-full rounded-md object-contain max-h-[70vh] bg-black/30" />
              {b.caption && <figcaption className="text-xs text-muted-foreground text-center">{b.caption}</figcaption>}
            </figure>
          );
        }
        if (b?.type === "video") return <DiaryMediaPlayer key={b.id} src={b.url} kind="video" />;
        if (b?.type === "audio") return <DiaryMediaPlayer key={b.id} src={b.url} kind="audio" />;
        if (b?.type === "link") {
          let host = b.url; try { host = new URL(b.url).hostname.replace(/^www\./, ""); } catch {}
          return (
            <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer"
              className="block rounded-md border border-border bg-background/60 p-3 hover:bg-background/80 transition-colors">
              <div className="flex items-start gap-3">
                <img decoding="async" src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`} alt="" width={32} height={32} loading="lazy" className="rounded shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  {b.title && <p className="text-sm font-medium truncate">{b.title}</p>}
                  <p className="text-[11px] text-muted-foreground truncate">{host}</p>
                </div>
              </div>
            </a>
          );
        }
        return null;
      })}
    </div>
  );
}


/**
 * Watermark anti-pirataria: UMA ÚNICA marca que se move aleatoriamente
 * pelo player (estilo DVD screensaver). Padrão para conteúdo VIP/pago.
 */
function AntiPiracyWatermark({ handle }: { handle: string }) {
  const [now, setNow] = useState(() => new Date());
  const [pos, setPos] = useState({ top: 15, left: 15 });

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const move = () => {
      setPos({
        top: Math.floor(Math.random() * 75) + 8,
        left: Math.floor(Math.random() * 65) + 8,
      });
    };
    move();
    const id = window.setInterval(move, 4000);
    return () => window.clearInterval(id);
  }, []);

  const stamp = useMemo(
    () =>
      now.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
    [now]
  );
  const text = `OCULTO · @${handle} · ${stamp}`;

  return (
    <div
      aria-hidden="true"
      data-drm-watermark="true"
      className="pointer-events-none absolute z-20 select-none transition-all ease-in-out [transition-duration:2000ms]"
      style={{
        top: `${pos.top}%`,
        left: `${pos.left}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        className="text-[11px] sm:text-xs font-semibold tracking-wider uppercase whitespace-nowrap"
        style={{
          color: "rgba(255,255,255,0.55)",
          textShadow: "0 0 4px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,1)",
          letterSpacing: "1px",
        }}
      >
        {text}
      </span>
    </div>
  );
}


interface ChannelContentViewerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post: any | null;
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

export default function ChannelContentViewer({ open, onOpenChange, post: propPost }: ChannelContentViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const { profile } = useProfile();

  // Permite "trocar" o post visualizado dentro do mesmo modal (navegação entre capítulos da série)
  const [stackedPost, setStackedPost] = useState<any>(null);
  useEffect(() => { setStackedPost(null); }, [propPost?.id]);
  const post = stackedPost ?? propPost;


  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [saved, setSaved] = useState<boolean>(!!post?.is_saved);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState<number>(post?.likes_count || 0);
  const [commentCount, setCommentCount] = useState<number>(post?.comments_count || 0);
  const [viewCount, setViewCount] = useState<number>(0);
  const [showComments, setShowComments] = useState(false);
  const saveMut = useSavePost();
  // Watermark handle = CRIADOR do conteúdo (não o viewer)
  const creatorAuthorId = post?.author_id || post?.creator_id || null;
  const { data: creatorHandle } = useQuery({
    queryKey: ["creator-handle", creatorAuthorId],
    enabled: !!creatorAuthorId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("username, display_name, name")
        .or(`id.eq.${creatorAuthorId},user_id.eq.${creatorAuthorId}`)
        .maybeSingle();
      return (data?.username || data?.display_name || data?.name || null) as string | null;
    },
  });
  const watermarkHandle = (
    creatorHandle ||
    post?.watermark_meta?.username ||
    post?.watermark_meta?.channelName ||
    "criador"
  ).toString();

  // ── Navegação entre capítulos da mesma série ──────────────────────────────
  const seriesAuthor = post?.author_id || post?.creator_id || null;
  const seriesKey = post?.series_id
    ? `id:${post.series_id}`
    : (post?.series_title && seriesAuthor ? `t:${seriesAuthor}::${post.series_title}` : null);

  const { data: seriesSiblings } = useQuery({
    queryKey: ["series-siblings", seriesKey],
    enabled: !!seriesKey && !!open,
    staleTime: 60_000,
    queryFn: async (): Promise<any[]> => {
      let q = (supabase as any)
        .from("posts")
        .select("id, title, chapter_number, thumbnail_url, content_format, section_type, media_type, narrative_status, created_at");
      if (post?.series_id) {
        q = q.eq("series_id", post.series_id);
      } else {
        q = q.eq("series_title", post.series_title);
        if (seriesAuthor) q = q.or(`author_id.eq.${seriesAuthor},creator_id.eq.${seriesAuthor}`);
      }
      const { data } = await q;
      const rows = ((data as any[]) || []).filter(
        (r) => !r.narrative_status || r.narrative_status === "published",
      );
      // Ordena numericamente por chapter_number (string ou number); nulos vão por created_at
      rows.sort((a: any, b: any) => {
        const an = Number(a.chapter_number);
        const bn = Number(b.chapter_number);
        const aValid = Number.isFinite(an);
        const bValid = Number.isFinite(bn);
        if (aValid && bValid && an !== bn) return an - bn;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return at - bt;
      });
      return rows;

    },
  });

  const currentIdx = (seriesSiblings ?? []).findIndex((s: any) => s.id === post?.id);
  const prevChapter = currentIdx > 0 ? seriesSiblings![currentIdx - 1] : null;
  const nextChapter =
    currentIdx >= 0 && currentIdx < ((seriesSiblings?.length ?? 0) - 1)
      ? seriesSiblings![currentIdx + 1]
      : null;

  const navigateToChapter = async (siblingId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from("posts")
        .select("*")
        .eq("id", siblingId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setStackedPost(data);
        // scroll modais (artigo e player) para o topo
        articleRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
        playerRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
      }
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível abrir o capítulo");
    }
  };

  const isNarrative = post?.content_format === "narrative";
  const isVideo = !isNarrative && post && (post.media_type === "video" || /\.(mp4|webm|mov)$/i.test(post.media_url || ""));
  const access = useDiaryPostAccess(post);
  const blocked = !!post && !access.effectiveAccess;


  useEffect(() => {
    setSaved(!!post?.is_saved);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setSpeedIdx(1);
    setIsBuffering(false);
    setShowComments(false);
    // Só atualiza contadores se o post trouxer valores (>0). Evita piscar "0"
    // ao reabrir o modal antes do fetch async terminar.
    if (typeof post?.likes_count === "number" && post.likes_count > 0) setLikeCount(post.likes_count);
    if (typeof post?.comments_count === "number" && post.comments_count > 0) setCommentCount(post.comments_count);
  }, [post?.id]);

  // Tracking de visualização única por username + estados sociais (only narrative + open)
  useEffect(() => {
    if (!open || !post?.id) return;
    if (post?.content_format !== "narrative") return;
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
        } catch { /* unique violation: já visualizou */ }
      }

      const [{ data: vc }, likeRes, saveRes, dislikeRes] = await Promise.all([
        (supabase as any).from("v_post_view_counts").select("views_count").eq("post_id", post.id).maybeSingle(),
        user ? (supabase as any).from("post_likes").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        user ? (supabase as any).from("saved_posts").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        user ? (supabase as any).from("post_dislikes").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;
      setViewCount(Number((vc as any)?.views_count || 0));
      setLiked(!!(likeRes as any)?.data);
      setSaved(!!(saveRes as any)?.data);
      setDisliked(!!(dislikeRes as any)?.data);

      // contadores reais (likes + comentários)
      try {
        const [{ count: lc }, { count: cc }] = await Promise.all([
          (supabase as any).from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
          (supabase as any).from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        ]);
        if (!cancelled) {
          if (typeof lc === "number") setLikeCount(lc);
          if (typeof cc === "number") setCommentCount(cc);
        }
      } catch { /* noop */ }
    })();

    return () => { cancelled = true; };
  }, [open, post?.id, post?.content_format, user?.id, profile?.username]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    if (open) return;
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
  }, [open]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setIsBuffering(true);
      void v.play().then(() => setPlaying(true)).catch(() => setIsBuffering(false));
    }
    else { v.pause(); setPlaying(false); }
  };

  const onTime = () => {
    const v = videoRef.current; if (!v) return;
    setProgress(v.currentTime);
    if (!duration && v.duration) setDuration(v.duration);
  };

  const seek = (val: number[]) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = val[0];
    setProgress(val[0]);
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60); const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const handleSave = async () => {
    if (!post?.id) return;
    try {
      const r = await saveMut.mutateAsync({ postId: post.id, isSaved: saved });
      const isSaved = r.action === "saved";
      setSaved(isSaved);
      toast.success(isSaved ? "Salvo em Salvos" : "Removido dos Salvos");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    }
  };

  const toggleFullscreen = async () => {
    const el = playerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    if (!el) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    if (el.requestFullscreen) {
      await el.requestFullscreen().catch(() => undefined);
      return;
    }

    await el.webkitRequestFullscreen?.();
  };

  if (!post) return null;

  // ── Modo Narrativo: leitura confortável (texto longo, capítulo, diário, etc.) ──
  // Tracking de leitura — só ativa em modo narrativo + dialog aberto + post válido
  useTrackNarrativeProgress(
    isNarrative && open ? (articleRef.current as HTMLElement | null) : null,
    { postId: post?.id, creatorId: post?.author_id || post?.creator_id || null, sectionType: post?.section_type || null },
    !!(isNarrative && open && post?.id),
  );

  if (isNarrative) {
    // Compartilhamento aponta direto para a página pública do app.
    // (A edge function og-leitura continua disponível para crawlers que
    // resolverem o domínio supabase, mas não é mais o destino do link
    // que o usuário cola em redes/navegador.)
    const shareUrl = buildShareUrl(`/leitura/${post.id}`, post.updated_at || post.created_at || undefined);

    // Notifica o autor do post (best-effort) — converte profile.id -> auth user_id
    const notifyAuthor = async (
      type: "post_like" | "post_dislike" | "post_save" | "post_share",
      title: string,
      body?: string,
    ) => {
      try {
        if (!user || !post?.author_id) return;
        const { data: authorProfile } = await (supabase as any)
          .from("profiles")
          .select("user_id, id")
          .or(`id.eq.${post.author_id},user_id.eq.${post.author_id}`)
          .maybeSingle();
        const targetUserId = (authorProfile as any)?.user_id;
        if (!targetUserId || targetUserId === user.id) return; // não notifica a si mesmo
        const actorHandle = profile?.username ? `@${profile.username}` : "Alguém";
        await (supabase as any).from("notifications").insert({
          user_id: targetUserId,
          type,
          title: title.replace("{actor}", actorHandle),
          body: body ?? null,
          data: { post_id: post.id, actor_user_id: user.id, url: shareUrl },
        });
      } catch { /* best-effort */ }
    };

    const handleShare = async () => {
      const payload = {
        title: post.title || "Conteúdo do Canal VIP",
        text: post.teaser || post.subtitle || "Leitura exclusiva no OCULTO",
        url: shareUrl,
      };
      try {
        if (typeof navigator !== "undefined" && (navigator as any).share) {
          await (navigator as any).share(payload);
          void notifyAuthor("post_share", "{actor} compartilhou seu conteúdo", post.title || undefined);
          return;
        }
      } catch {
        /* usuário cancelou — segue para fallback */
      }
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copiado", { description: "Cole onde quiser compartilhar." });
        void notifyAuthor("post_share", "{actor} compartilhou seu conteúdo", post.title || undefined);
      } catch {
        toast.error("Não foi possível copiar o link");
      }
    };

    const toggleLike = async () => {
      if (!user) { toast.error("Faça login para curtir"); return; }
      if (!post?.id) return;
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
          void notifyAuthor("post_like", "{actor} curtiu seu conteúdo", post.title || undefined);
        } else {
          await (supabase as any).from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
        }
      } catch (e: any) {
        setLiked(!next);
        setLikeCount((c) => (next ? Math.max(0, c - 1) : c + 1));
        toast.error(e?.message || "Erro ao curtir");
      }
    };

    const toggleDislike = async () => {
      if (!user) { toast.error("Faça login para reagir"); return; }
      if (!post?.id) return;
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
          void notifyAuthor("post_dislike", "{actor} reagiu ao seu conteúdo", post.title || undefined);
        } else {
          await (supabase as any).from("post_dislikes").delete().eq("post_id", post.id).eq("user_id", user.id);
        }
      } catch (e: any) {
        setDisliked(!next);
        toast.error(e?.message || "Erro ao reagir");
      }
    };

    return (
      <TooltipProvider delayDuration={250}>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            className="[&>button]:hidden w-[calc(100vw-0.5rem)] sm:w-[calc(100vw-2rem)] max-w-3xl h-[calc(100dvh-0.5rem)] sm:h-[min(94dvh,58rem)] p-0 gap-0 overflow-hidden bg-background border-amber-500/30 select-none rounded-lg"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="relative flex h-full min-h-0 flex-col">
              {/* Botões flutuantes superiores: Compartilhar / Salvar / Fechar */}
              <div className="absolute right-2 top-2 sm:right-3 sm:top-3 z-30 flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleShare}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-amber-500 hover:text-black shadow-md transition-colors"
                      aria-label="Compartilhar"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Compartilhar link público</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleSave}
                      disabled={saveMut.isPending}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-colors",
                        saved
                          ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                          : "bg-background/90 text-foreground hover:bg-amber-500 hover:text-black",
                      )}
                      aria-label={saved ? "Remover dos salvos" : "Salvar para ler depois"}
                    >
                      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {saved ? "Salvo — clique para remover" : "Salvar para ler depois"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onOpenChange(false)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-muted shadow-md"
                      aria-label="Fechar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Fechar leitura</TooltipContent>
                </Tooltip>
              </div>

              <article
                ref={articleRef as any}
                className="flex-1 overflow-y-auto px-4 pt-16 pb-10 sm:px-10 sm:pt-16 sm:pb-12 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onContextMenu={(e) => e.preventDefault()}
              >
                {post.thumbnail_url && (
                  <div className="relative -mx-4 sm:-mx-10 mb-6 aspect-[16/8] sm:aspect-[16/7] overflow-hidden bg-muted">
                    <img decoding="async"
                      src={post.thumbnail_url}
                      alt={post.title || "Capa"}
                      className="h-full w-full object-cover pointer-events-none"
                      draggable={false}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                  </div>
                )}

                <div className="mx-auto max-w-2xl space-y-3">
                  {(post.series_title || post.chapter_number) && (
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500">
                      <BookOpen className="h-3.5 w-3.5" />
                      {post.series_title && <span className="font-semibold">{post.series_title}</span>}
                      {post.chapter_number && <span>· Capítulo {post.chapter_number}</span>}
                    </div>
                  )}

                  <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-foreground">
                    {post.title || "Sem título"}
                  </h1>

                  {post.subtitle && (
                    <p className="text-base text-muted-foreground italic">{post.subtitle}</p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-b border-border/60 pb-3">
                    <span className="truncate">@{watermarkHandle} · OCULTO Canal VIP</span>
                    {post.read_time_minutes ? (
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" /> {post.read_time_minutes} min
                      </span>
                    ) : null}
                    {post.created_at && (
                      <span className="shrink-0 ml-auto">{new Date(post.created_at).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>

                  {post.teaser && (
                    <p className="text-[15px] text-muted-foreground leading-relaxed border-l-2 border-amber-500/50 pl-3 my-4">
                      {post.teaser}
                    </p>
                  )}

                  <div className="prose prose-invert max-w-none font-serif text-[16px] leading-[1.8] text-foreground/95 break-words pt-2">
                    {Array.isArray((post as any)?.style_meta?.diary_blocks) && (post as any).style_meta.diary_blocks.length > 0
                      ? <DiaryBlocksReader blocks={(post as any).style_meta.diary_blocks} />
                      : <div className="whitespace-pre-wrap">{post.content_text}</div>}
                  </div>

                  {Array.isArray((post as any)?.style_meta?.tags) && (post as any).style_meta.tags.length > 0 && (
                    <div className="pt-5 flex flex-wrap gap-1.5 border-t border-border/40 mt-4">
                      {(post as any).style_meta.tags.map((t: string) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-300 text-[11px] px-2 py-0.5 font-sans"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {post.id && (
                    <div className="pt-6 space-y-3">
                      {/* Barra de ações padrão do sistema */}
                      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2 py-1.5">
                        <Button variant="ghost" size="sm" onClick={toggleLike} className={cn("gap-1.5", liked && "text-rose-500")}
                          aria-label={liked ? "Descurtir" : "Curtir"}>
                          <Heart className={cn("h-4 w-4", liked && "fill-rose-500")} />
                          <span className="text-xs font-semibold">{likeCount}</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={toggleDislike} className={cn("gap-1.5", disliked && "text-amber-500")}
                          aria-label={disliked ? "Remover dislike" : "Não curtir"}>
                          <ThumbsDown className={cn("h-4 w-4", disliked && "fill-amber-500")} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowComments(v => !v)} className={cn("gap-1.5", showComments && "text-primary")}
                          aria-label="Comentários">
                          <MessageCircle className="h-4 w-4" />
                          <span className="text-xs font-semibold">{commentCount}</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={async () => { const wasSaved = saved; await handleSave(); if (!wasSaved) void notifyAuthor("post_save", "{actor} salvou seu conteúdo", post.title || undefined); }} className={cn("gap-1.5", saved && "text-amber-400")}
                          aria-label={saved ? "Remover dos salvos" : "Salvar"}>
                          {saved ? <BookmarkCheck className="h-4 w-4 fill-amber-400" /> : <Bookmark className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5" aria-label="Compartilhar">
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <div className="flex-1" />
                        <div className="flex items-center gap-1 text-xs text-muted-foreground pr-2" title="Visualizações únicas">
                          <Eye className="h-3.5 w-3.5" /> <span>{viewCount}</span>
                        </div>
                      </div>

                      {showComments && (
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                          <CommentSection postId={post.id} />
                        </div>
                      )}
                    </div>
                  )}

                  {(prevChapter || nextChapter) && (
                    <div className="mt-8 pt-5 border-t border-amber-500/25">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500 mb-3">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span className="font-semibold truncate">{post.series_title || "Série"}</span>
                        {typeof currentIdx === "number" && currentIdx >= 0 && seriesSiblings && (
                          <span className="ml-auto text-muted-foreground normal-case tracking-normal">
                            {currentIdx + 1} de {seriesSiblings.length}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {prevChapter ? (
                          <button
                            type="button"
                            onClick={() => navigateToChapter(prevChapter.id)}
                            className="group flex items-center gap-3 rounded-lg border border-border/60 bg-background/60 p-3 text-left hover:border-amber-500/60 hover:bg-amber-500/5 transition-colors"
                          >
                            {prevChapter.thumbnail_url ? (
                              <img decoding="async" src={prevChapter.thumbnail_url} alt="" loading="lazy" className="h-14 w-14 rounded object-cover shrink-0" />
                            ) : (
                              <div className="h-14 w-14 rounded bg-muted shrink-0 flex items-center justify-center">
                                <BookOpen className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">← Capítulo anterior</div>
                              <div className="text-sm font-semibold text-foreground truncate">
                                {prevChapter.chapter_number ? `Cap. ${prevChapter.chapter_number} · ` : ""}{prevChapter.title || "Sem título"}
                              </div>
                            </div>
                          </button>
                        ) : <div className="hidden sm:block" />}
                        {nextChapter ? (
                          <button
                            type="button"
                            onClick={() => navigateToChapter(nextChapter.id)}
                            className="group flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-left hover:border-amber-500 hover:bg-amber-500/10 transition-colors sm:flex-row-reverse sm:text-right"
                          >
                            {nextChapter.thumbnail_url ? (
                              <img decoding="async" src={nextChapter.thumbnail_url} alt="" loading="lazy" className="h-14 w-14 rounded object-cover shrink-0" />
                            ) : (
                              <div className="h-14 w-14 rounded bg-muted shrink-0 flex items-center justify-center">
                                <BookOpen className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] uppercase tracking-wider text-amber-500">Próximo capítulo →</div>
                              <div className="text-sm font-semibold text-foreground truncate">
                                {nextChapter.chapter_number ? `Cap. ${nextChapter.chapter_number} · ` : ""}{nextChapter.title || "Sem título"}
                              </div>
                            </div>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <AntiPiracyWatermark handle={watermarkHandle} />
                </div>

              </article>
              {blocked && <DiaryPaywall post={post} />}
            </div>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="[&>button]:hidden w-[calc(100vw-0.75rem)] max-w-6xl h-[calc(100dvh-0.75rem)] sm:h-[min(92dvh,56rem)] p-0 gap-0 overflow-hidden bg-black border-amber-500/30 select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={playerRef}
          className="relative flex h-full min-h-0 flex-col bg-black select-none"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
        >
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 sm:right-3 sm:top-3"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>


          <div className="relative flex-1 min-h-0 bg-black px-2 pb-2 pt-12 sm:px-4 sm:pb-4 sm:pt-14">
            {isVideo ? (
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-black">
                <video
                  ref={videoRef}
                  src={post.media_url}
                  poster={post.thumbnail_url || undefined}
                  preload="metadata"
                  playsInline
                  muted={muted}
                  disablePictureInPicture
                  disableRemotePlayback
                  controlsList="nodownload noremoteplayback nofullscreen noplaybackrate"
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  onPlay={() => {
                    setPlaying(true);
                    setIsBuffering(false);
                  }}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={onTime}
                  onLoadedMetadata={(e) => {
                    // NÃO chamar v.load() aqui — isso reseta o vídeo e causa
                    // o "reinício automático" relatado em alguns mobiles.
                    setDuration(e.currentTarget.duration || 0);
                    onTime();
                  }}
                  onCanPlay={() => setIsBuffering(false)}
                  onWaiting={() => setIsBuffering(true)}
                  onSeeking={() => setIsBuffering(true)}
                  onSeeked={() => setIsBuffering(false)}
                  onPlaying={() => setIsBuffering(false)}
                  onStalled={() => setIsBuffering(true)}
                  onEnded={() => setPlaying(false)}
                  onClick={togglePlay}
                  className="h-full w-full max-h-full object-contain bg-black cursor-pointer"
                />
                {isBuffering && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                    <div className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs text-white">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Carregando vídeo
                    </div>
                  </div>
                )}
                <AntiPiracyWatermark handle={watermarkHandle} />
              </div>
            ) : (
              <div
                className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-black"
                onContextMenu={(e) => e.preventDefault()}
              >
                <img decoding="async"
                  src={post.media_url}
                  alt={post.title || "Conteúdo"}
                  className="h-full w-full max-h-full object-contain bg-black pointer-events-none"
                  loading="lazy"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                />
                {/* Camada anti-extração: bloqueia "salvar imagem como" / "copiar endereço" */}
                <div
                  className="absolute inset-0 z-10"
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
                />
                <AntiPiracyWatermark handle={watermarkHandle} />
              </div>
            )}
          </div>

          {isVideo && (
            <div className="shrink-0 border-t border-amber-500/20 bg-black px-3 py-3 sm:px-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="w-10 text-[11px] tabular-nums text-white/70">{fmt(progress)}</span>
                <Slider
                  value={[progress]}
                  max={Math.max(duration, 0.1)}
                  step={0.1}
                  onValueChange={seek}
                  className="flex-1"
                />
                <span className="w-10 text-right text-[11px] tabular-nums text-white/70">{fmt(duration)}</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="icon" variant="ghost" onClick={togglePlay} className="h-10 w-10 text-white hover:bg-white/10">
                    {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setMuted((m) => !m)}
                    className="h-10 w-10 text-white hover:bg-white/10"
                  >
                    {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <div className="min-w-[110px] flex-1 sm:w-32 sm:flex-none">
                    <Slider
                      value={[muted ? 0 : volume * 100]}
                      max={100}
                      step={1}
                      onValueChange={(v) => {
                        setVolume(v[0] / 100);
                        setMuted(v[0] === 0);
                      }}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
                    className="h-10 gap-1 text-xs font-mono text-white hover:bg-white/10"
                  >
                    <Gauge className="h-3.5 w-3.5" />
                    {SPEEDS[speedIdx]}x
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleFullscreen}
                    className="h-10 w-10 text-white hover:bg-white/10"
                    aria-label={isFullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMut.isPending}
                  className={cn(
                    "h-10 gap-1.5 self-stretch sm:self-auto",
                    saved
                      ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                      : "bg-amber-500 hover:bg-amber-600 text-black"
                  )}
                >
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {saved ? "Salvo" : "Salvar"}
                </Button>
              </div>
            </div>
          )}

          {!isVideo && (
            <div className="shrink-0 border-t border-amber-500/20 bg-black px-3 py-3 sm:px-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 flex-1 truncate text-sm text-white/90">
                {post.title || post.content_text?.slice(0, 80) || "Conteúdo"}
              </p>
              <Button
                size="sm" onClick={handleSave}
                disabled={saveMut.isPending}
                className={cn(
                  "h-10 gap-1.5 self-stretch sm:self-auto",
                  saved
                    ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                    : "bg-amber-500 hover:bg-amber-600 text-black"
                )}
              >
                {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {saved ? "Salvo" : "Salvar"}
              </Button>
            </div>
          )}
          {(prevChapter || nextChapter) && (
            <div className="shrink-0 border-t border-amber-500/20 bg-black px-3 py-3 sm:px-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-400 mb-2">
                <BookOpen className="h-3.5 w-3.5" />
                <span className="font-semibold truncate">{post.series_title || "Série"}</span>
                {seriesSiblings && currentIdx >= 0 && (
                  <span className="ml-auto text-white/60 normal-case tracking-normal">
                    {currentIdx + 1} de {seriesSiblings.length}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {prevChapter ? (
                  <button
                    type="button"
                    onClick={() => navigateToChapter(prevChapter.id)}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-2 text-left text-white hover:bg-white/10 transition-colors"
                  >
                    <span className="text-[10px] uppercase tracking-wider text-white/60 shrink-0">← Ant.</span>
                    <span className="text-xs font-semibold truncate">
                      {prevChapter.chapter_number ? `Cap. ${prevChapter.chapter_number} · ` : ""}{prevChapter.title || "Sem título"}
                    </span>
                  </button>
                ) : <div className="hidden sm:block" />}
                {nextChapter ? (
                  <button
                    type="button"
                    onClick={() => navigateToChapter(nextChapter.id)}
                    className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-left text-amber-100 hover:bg-amber-500/20 transition-colors sm:flex-row-reverse sm:text-right"
                  >
                    <span className="text-[10px] uppercase tracking-wider text-amber-300 shrink-0">Próx. →</span>
                    <span className="text-xs font-semibold truncate flex-1">
                      {nextChapter.chapter_number ? `Cap. ${nextChapter.chapter_number} · ` : ""}{nextChapter.title || "Sem título"}
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {blocked && <DiaryPaywall post={post} />}

        </div>
      </DialogContent>
    </Dialog>
  );
}
