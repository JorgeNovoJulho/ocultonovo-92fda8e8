import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Lock, Crown, Play, ShoppingCart, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import QuickSignupModal from "@/components/creator/QuickSignupModal";
import { Logo } from "@/components/Logo";
import {
  useShareLandingSettings,
  DEFAULT_SHARE_LANDING_SETTINGS,
} from "@/hooks/useShareLandingSettings";
import {
  PurchaseMethodChooserModal,
  type PurchaseMethod,
} from "@/components/PurchaseMethodChooserModal";
import { PaidContentCheckoutModal } from "@/components/PaidContentCheckoutModal";
import { InlineLinkMedia } from "@/components/InlineLinkMedia";
import { extractFirstUrl } from "@/components/chat/LinkPreview";

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function absolutize(url?: string | null): string {
  if (!url) return '';
  const v = url.trim();
  if (!v) return '';
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (v.startsWith('/')) return `https://ocultoswing.com.br${v}`;
  return v;
}

interface SharedPost {
  id: string;
  content_text: string | null;
  media_url: string | null;
  media_type: string | null;
  paid_price: number | null;
  section_type: string | null;
  author_id: string;
  share_slug: string | null;
  preview_blur: string | null;
  channel?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

const BLUR_PX_MAP: Record<string, number> = {
  light: 28,
  medium: 56,
  strong: 96,
  none: 0,
};

export default function SharedContentPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: settingsData } = useShareLandingSettings();
  const settings = settingsData || DEFAULT_SHARE_LANDING_SETTINGS;
  const [post, setPost] = useState<SharedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignup, setShowSignup] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [chosenMethod, setChosenMethod] = useState<PurchaseMethod>("pix");
  const [showCheckout, setShowCheckout] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!postId) return;
    const hasAppMarker = new URLSearchParams(window.location.search).get('app') === '1';
    if (!hasAppMarker) {
      const next = `/c/${encodeURIComponent(postId)}?app=1`;
      navigate(next, { replace: true });
      return;
    }
    (async () => {
      try {
        // Usa RPC SECURITY DEFINER que devolve snapshot seguro mesmo para anon
        // (RLS bloqueia o SELECT direto em posts para visitantes não logados).
        const { data: rpcRows } = await (supabase as any).rpc(
          "post_public_share_preview",
          { p_id_or_slug: postId },
        );
        const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;

        if (row) {
          setPost({
            id: row.id,
            content_text: row.content_text,
            media_url: row.media_url,
            media_type: row.media_type,
            paid_price: row.paid_price,
            section_type: row.section_type,
            author_id: row.author_id,
            share_slug: row.share_slug,
            preview_blur: row.preview_blur,
            channel: row.channel_title || row.author_display_name || row.author_username,
            username: row.author_username,
            display_name: row.author_display_name,
            avatar_url: row.author_avatar_url,
          });
        } else {
          // Fallback (autenticado): tenta SELECT direto (RLS do dono/seguidor).
          const cols =
            "id, content_text, media_url, media_type, paid_price, section_type, author_id, share_slug, preview_blur";
          const { data: byId } = await (supabase as any)
            .from("posts")
            .select(cols)
            .or(`id.eq.${postId},share_slug.eq.${postId}`)
            .maybeSingle();
          if (byId) {
            const { data: profile } = await (supabase as any)
              .from("profiles")
              .select("username, display_name, avatar_url")
              .or(`id.eq.${byId.author_id},user_id.eq.${byId.author_id}`)
              .maybeSingle();
            setPost({
              ...byId,
              channel: profile?.display_name || profile?.username,
              username: profile?.username,
              display_name: profile?.display_name,
              avatar_url: profile?.avatar_url,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [postId, navigate]);

  // OpenGraph / Twitter meta para gerar prévia em WhatsApp, Telegram, Facebook, X
  useEffect(() => {
    if (!post) return;
    const shareUrl = `https://ocultoswing.com.br/c/${post.share_slug || post.id}?v=2`;
    const channelLabel = post.channel || (post.username ? `@${post.username}` : 'OCULTO');
    const baseTitle = post.content_text?.trim().slice(0, 80)
      || `Conteúdo exclusivo de ${channelLabel}`;
    const title = `${baseTitle} · OCULTO`;
    const desc = post.content_text?.trim().slice(0, 180)
      || `Conteúdo publicado por ${channelLabel} no OCULTO. Toque para abrir.`;
    const img = `https://ocultoswing.com.br/c/og-image/${encodeURIComponent(post.share_slug || post.id)}?v=2`;

    document.title = title;
    setMeta('description', desc);
    setMeta('og:title', title, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('og:url', shareUrl, 'property');
    setMeta('og:type', post.media_type === 'video' ? 'video.other' : 'article', 'property');
    setMeta('og:site_name', 'OCULTO', 'property');
    setMeta('og:image', img, 'property');
    setMeta('og:image:secure_url', img, 'property');
    setMeta('og:image:width', '1200', 'property');
    setMeta('og:image:height', '630', 'property');
    setMeta('og:image:alt', title, 'property');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
    setMeta('twitter:image', img);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = shareUrl;
  }, [post]);

  // Conteúdo livre: vídeo só inicia com toque real do usuário.
  // Em mobile, autoplay costuma falhar/travar e ainda gasta rede/RAM em aparelhos fracos.
  const isFree = !post?.paid_price || Number(post?.paid_price) <= 0;
  useEffect(() => {
    if (post?.media_type !== 'video') return;
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    v.muted = true;
    setMuted(true);
    setPlaying(false);
  }, [post?.id, post?.media_type]);

  const togglePlay = () => {
    if (post?.media_type === 'video') {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        if (v.ended) v.currentTime = 0;
        const attempt = v.play();
        if (attempt && typeof attempt.catch === 'function') {
          attempt.then(() => setPlaying(true)).catch(() => {
            v.muted = true;
            setMuted(true);
            v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          });
        }
      } else { v.pause(); setPlaying(false); }
    } else if (post?.media_type === 'audio') {
      const src = post.media_url;
      if (!src) return;
      let a = audioRef.current;
      if (!a) {
        a = new Audio(src);
        a.preload = 'auto';
        a.addEventListener('play', () => setPlaying(true));
        a.addEventListener('pause', () => setPlaying(false));
        a.addEventListener('ended', () => setPlaying(false));
        audioRef.current = a;
      }
      if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => {}); }
      else { a.pause(); setPlaying(false); }
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
  };


  const handleAccess = () => {
    if (!post) return;
    const target = post.username ? `/u/${post.username}` : `/feed`;
    if (user) {
      navigate(target);
    } else {
      setShowSignup(true);
    }
  };

  const handleBuy = () => {
    if (!user) {
      setShowSignup(true);
      return;
    }
    setShowChooser(true);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-3 p-6">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Conteúdo não encontrado ou removido.</p>
        <Button onClick={() => navigate("/")} variant="outline">
          Voltar
        </Button>
      </div>
    );
  }

  const blurKey = (post.preview_blur || settings.default_blur || "medium") as keyof typeof BLUR_PX_MAP;
  const blurPx = BLUR_PX_MAP[blurKey] ?? 28;

  const pageBg = settings.background_image_url
    ? `url(${settings.background_image_url}) center/cover no-repeat`
    : `linear-gradient(135deg, ${settings.bg_gradient_from}, ${settings.bg_gradient_to})`;

  const accent = settings.accent_color;
  const accentDark = settings.accent_color_dark;

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{ background: pageBg }}
    >
      <div className="w-full max-w-md space-y-4">
        {settings.show_logo && (
          <div className="text-center">
            {settings.logo_override_url ? (
              <img loading="lazy" decoding="async"
                src={settings.logo_override_url}
                alt="Logo"
                className="mx-auto h-9 mb-1 object-contain"
              />
            ) : (
              <Logo className="mx-auto h-9 mb-1" />
            )}
          </div>
        )}

        <Card
          className="overflow-hidden backdrop-blur-sm"
          style={{ borderColor: settings.card_border_color }}
        >
          <div className="relative aspect-[4/5] bg-muted">
            {isFree ? (
              <>
                {post.media_url && post.media_type === "image" && (
                  <img
                    src={post.media_url}
                    alt={post.content_text || "Conteúdo OCULTO"}
                    className="w-full h-full object-contain bg-black"
                  />
                )}
                {post.media_url && post.media_type === "video" && (
                  <video
                    ref={videoRef}
                    src={post.media_url}
                    playsInline
                    {...({ 'webkit-playsinline': 'true', 'x5-playsinline': 'true' } as Record<string, string>)}
                    controls
                    controlsList="nodownload noremoteplayback"
                    disablePictureInPicture
                    preload="auto"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={(e) => {
                      setPlaying(false);
                      e.currentTarget.currentTime = 0;
                    }}
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                  />
                )}

                {post.media_url && post.media_type === "audio" && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-amber-900/40 to-black"
                    aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
                  >
                    <span className="rounded-full bg-white/90 p-5">
                      {playing ? <Pause className="h-7 w-7 text-black" /> : <Play className="h-7 w-7 text-black" />}
                    </span>
                    <span className="text-xs text-white/80">{playing ? "Tocando…" : "Toque para ouvir"}</span>
                  </button>
                )}
                {!post.media_url && post.content_text && extractFirstUrl(post.content_text) && (
                  <div className="absolute inset-0 overflow-auto bg-black">
                    <InlineLinkMedia text={post.content_text} className="w-full h-full" />
                  </div>
                )}
                {!post.media_url && !(post.content_text && extractFirstUrl(post.content_text)) && (
                  <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                    <p className="text-sm text-muted-foreground">{post.content_text || "Conteúdo compartilhado"}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {post.media_url && post.media_type === "image" && (
                  <img loading="lazy" decoding="async"
                    src={post.media_url}
                    alt=""
                    className="w-full h-full object-cover"
                    style={
                      blurPx > 0
                        ? { filter: `blur(${blurPx}px) saturate(0.5) brightness(0.38) contrast(1.12)`, transform: "scale(1.16)", opacity: blurPx >= 90 ? 0.28 : 0.4 }
                        : undefined
                    }
                  />
                )}
                {post.media_url && post.media_type === "video" && (
                  <video
                    src={post.media_url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    style={
                      blurPx > 0
                        ? { filter: `blur(${blurPx}px) saturate(0.5) brightness(0.38) contrast(1.12)`, transform: "scale(1.16)", opacity: blurPx >= 90 ? 0.28 : 0.4 }
                        : undefined
                    }
                  />
                )}
                <div className="absolute inset-0 bg-black/72 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                  <div
                    className="rounded-full p-4 shadow-[0_0_30px_rgba(234,179,8,0.4)]"
                    style={{ background: `${accent}E6` }}
                  >
                    <Lock className="h-7 w-7" style={{ color: "#1a0f00" }} />
                  </div>
                  {post.media_type === "video" && (
                    <Play className="h-6 w-6 text-white/80" />
                  )}
                </div>
              </>
            )}
          </div>


          <CardContent className="p-5 space-y-4">
            <div className="text-center">
              <h1
                className="text-xl font-extrabold leading-tight"
                style={{ color: accent }}
              >
                {settings.headline}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                {settings.subheadline}
              </p>
            </div>

            {settings.show_creator && (
              <button
                type="button"
                onClick={handleAccess}
                className="flex items-center justify-center gap-2 mx-auto group"
              >
                {post.avatar_url ? (
                  <img
                    src={post.avatar_url}
                    alt={post.username ? `@${post.username}` : "Autor"}
                    loading="lazy"
                    decoding="async"
                    className="h-9 w-9 rounded-full object-cover ring-2"
                    style={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}` }}
                  />
                ) : (
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center"
                    style={{ background: `${accent}33`, color: accent }}
                  >
                    <Crown className="h-4 w-4" />
                  </div>
                )}
                <div className="flex flex-col items-start leading-tight">
                  <span className="font-semibold text-sm" style={{ color: accent }}>
                    {post.username ? `@${post.username}` : (post.channel || "Canal VIP")}
                  </span>
                  {post.username && (
                    <span className="text-[11px] text-muted-foreground">
                      @{post.username}
                    </span>
                  )}
                </div>
              </button>
            )}

            {post.content_text && !extractFirstUrl(post.content_text) && (
              <p className="text-base font-semibold leading-snug text-center">
                {post.content_text}
              </p>
            )}

            {settings.show_price && post.paid_price && (
              <div
                className="rounded-lg p-3 text-center border"
                style={{
                  borderColor: settings.card_border_color,
                  background: `${accent}10`,
                }}
              >
                <p className="text-xs text-muted-foreground">Acesso individual</p>
                <p className="text-2xl font-extrabold" style={{ color: accent }}>
                  R$ {Number(post.paid_price).toFixed(2).replace(".", ",")}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {settings.show_buy_button && post.paid_price ? (
                <Button
                  onClick={handleBuy}
                  className="w-full font-semibold gap-2 transition-all hover:-translate-y-0.5"
                  style={{
                    background: `linear-gradient(135deg, ${accent}, ${accentDark})`,
                    color: "#1a0f00",
                    boxShadow: `0 6px 20px ${accent}55`,
                  }}
                >
                  <ShoppingCart className="h-4 w-4" />
                  {settings.cta_buy_text}
                </Button>
              ) : null}

              <Button
                onClick={handleAccess}
                variant="outline"
                className="w-full font-semibold"
                style={{
                  borderColor: settings.card_border_color,
                  color: accent,
                }}
              >
                {user ? settings.cta_primary_text : settings.cta_signup_text}
              </Button>
            </div>

            {settings.show_footer && (
              <p className="text-[11px] text-muted-foreground text-center">
                {settings.footer_text}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <QuickSignupModal
        open={showSignup}
        onOpenChange={setShowSignup}
        onSuccess={() => {
          setShowSignup(false);
          const target = post.username ? `/u/${post.username}` : `/feed`;
          navigate(target);
        }}
        contextLabel={`Para acessar este conteúdo de ${post.channel || "criador VIP"}, crie sua conta gratuita.`}
      />

      <PurchaseMethodChooserModal
        open={showChooser}
        onOpenChange={setShowChooser}
        price={Number(post.paid_price || 0)}
        itemName={post.channel ? `Conteúdo de ${post.channel}` : undefined}
        onChoose={(m) => {
          setChosenMethod(m);
          setShowCheckout(true);
        }}
      />

      <PaidContentCheckoutModal
        open={showCheckout}
        onOpenChange={setShowCheckout}
        postId={post.id}
        price={Number(post.paid_price || 0)}
        sellerName={post.channel || undefined}
        defaultMethod={chosenMethod}
        lockMethod
      />
    </div>
  );
}
