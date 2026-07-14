import { useEffect, useState, useRef, useCallback } from "react";
import { isVideoUrl, getVideoMimeType, resolveVideoThumbnail } from "@/lib/mediaType";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useLandingSettings } from "@/hooks/useLandingSettings";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/Logo";
import { Sparkles, Lock, Play, ExternalLink, Eye, EyeOff, AlertTriangle, X, Copy, Share2, QrCode, RefreshCw, ShieldCheck, Flame } from "lucide-react";
import { useInviteCodeStore } from "@/store/useInviteCodeStore";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useCreatorReferralCode } from "@/hooks/useCreatorReferrals";
import { useAuth } from "@/hooks/useAuth";
import { ShareBenefitsStrip } from "@/components/share/ShareBenefitsStrip";
import { ShareViralHint } from "@/components/share/ShareViralHint";
import { buildCreatorInviteUrl } from "@/lib/inviteLinks";

type ReferralCampaignContent = {
  headline: string;
  subheadline: string;
  cardText: string;
  ctaButton: string;
};

function getReferralCampaignContent(campaign: string | null, inviterName: string): ReferralCampaignContent | null {
  switch (campaign) {
    case "indique-ganhe-creditos":
      return {
        headline: `${inviterName} está convidando você para conhecer a OCULTO`,
        subheadline:
          "Descubra os segredos mais quentes dos usuários e compartilhe seus desejos mais ocultos.",
        cardText:
          `${inviterName} te convidou para explorar a plataforma, conhecer novos perfis e viver experiências mais intensas.`,
        ctaButton: "Quero conhecer a OCULTO",
      };
    case "programa-madrinhas":
      return {
        headline: `A criadora VIP ${inviterName} está te indicando`,
        subheadline:
          "Você está sendo convidado(a) para ser criador(a) de conteúdo adulto exclusivo na OCULTO. Você será divulgado(a) para os seguidores de quem te convidou, terá maior alcance e poderá começar com uma base grande de fãs instantaneamente. Em contrapartida, colaborará com 5% do seu faturamento mensal por 12 meses para quem te convidou.",
        cardText:
          `${inviterName} quer te impulsionar como criador(a) VIP com mais alcance desde o primeiro dia.`,
        ctaButton: "Quero ser criador(a)",
      };
    case "fundador-vip-50off":
      return {
        headline: "Fundador VIP: 50% OFF no plano anual",
        subheadline:
          `Convite enviado por ${inviterName} para os 100 primeiros criadores garantirem 50% OFF na assinatura do plano anual VIP.`,
        cardText:
          "Você recebeu acesso à oferta Fundador VIP com 50% OFF para os 100 primeiros criadores.",
        ctaButton: "Garantir 50% OFF",
      };
    default:
      return null;
  }
}

export default function SharePage() {
  const { shareCode } = useParams<{ shareCode: string }>();
  const { user } = useAuth();
  const { data: settings } = useLandingSettings();
  const [mediaBlurred, setMediaBlurred] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(() => sessionStorage.getItem("oculto_age_ok") === "1");
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const persistedInviteCode = useInviteCodeStore((s) => s.code);
  const setPersistedInviteCode = useInviteCodeStore((s) => s.setCode);
  const {
    code: ownReferralCode,
    isLoading: ownCodeLoading,
    generateCode: generateOwnCode,
    isGenerating: isGeneratingOwn,
    isError: ownCodeError,
    reset: resetOwnCode,
  } = useCreatorReferralCode();
  const effectiveInviteCode = ownReferralCode || persistedInviteCode;
  const userInviteUrl = buildCreatorInviteUrl(effectiveInviteCode);
  const showInviteLoading = !userInviteUrl && (ownCodeLoading || isGeneratingOwn);

  // Persiste o código do usuário no Zustand/localStorage assim que disponível
  useEffect(() => {
    if (ownReferralCode && ownReferralCode !== persistedInviteCode) {
      setPersistedInviteCode(ownReferralCode);
    }
  }, [ownReferralCode, persistedInviteCode, setPersistedInviteCode]);

  // Auto-gera o código do próprio usuário (uma vez por sessão; sem loop em erro)
  const triedGenerateRef = useRef(false);
  useEffect(() => {
    if (!user) return; // anonymous viewers must not auto-generate own code
    if (
      !effectiveInviteCode &&
      !ownCodeLoading &&
      !isGeneratingOwn &&
      !ownCodeError &&
      !triedGenerateRef.current
    ) {
      triedGenerateRef.current = true;
      generateOwnCode();
    }
  }, [user, effectiveInviteCode, ownCodeLoading, isGeneratingOwn, ownCodeError, generateOwnCode]);

  const handleRetryGenerateOwn = useCallback(() => {
    resetOwnCode();
    triedGenerateRef.current = true;
    generateOwnCode();
  }, [resetOwnCode, generateOwnCode]);

  const handleCopyInvite = async () => {
    if (!userInviteUrl) return;
    await navigator.clipboard.writeText(userInviteUrl);
    toast.success('Link copiado!');
  };
  const handleShareInvite = async () => {
    if (!userInviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Oculto — Convite', url: userInviteUrl });
        return;
      } catch { /* fallback */ }
    }
    handleCopyInvite();
  };

  const texts = settings?.texts;
  const timers = settings?.timers;
  const style = settings?.style;
  const promoCampaign = new URLSearchParams(window.location.search).get("promo");

  // Track click via edge function (fire-and-forget) — only after age confirmation
  useEffect(() => {
    if (!shareCode || !ageConfirmed) return;
    const sessionHash = sessionStorage.getItem("sh") || crypto.randomUUID().slice(0, 16);
    sessionStorage.setItem("sh", sessionHash);

    const params = new URLSearchParams(window.location.search);
    const referrerId = params.get("ref") || null;
    const promoId = params.get("promo") || null;

    supabase.functions.invoke("track-share-click", {
      body: { share_code: shareCode, referrer_id: referrerId, promotion_id: promoId, session_hash: sessionHash, confirmed_age: true },
    }).catch(() => {});
  }, [shareCode, ageConfirmed]);

  // Fetch share link data — supports both media_share_links and referral codes
  const { data, isLoading, error } = useQuery({
    queryKey: ["share-page", shareCode],
    queryFn: async () => {
      if (!shareCode) throw new Error("No share code");

      // 1) Try media_share_links first
      const { data: shareLink } = await supabase
        .from("media_share_links")
        .select("*")
        .eq("share_code", shareCode)
        .maybeSingle();

      if (shareLink) {
        if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
          throw new Error("Link expired");
        }

        await supabase.from("media_share_links")
          .update({ views_count: (shareLink.views_count || 0) + 1 })
          .eq("id", shareLink.id);

        const { data: post } = await supabase
          .from("posts").select("*").eq("id", shareLink.post_id!).single();

        const { data: author } = await supabase
          .from("profiles").select("name, username, avatar_url, is_verified").eq("id", post?.user_id!).single();

        return { shareLink, post, author, isReferral: false };
      }

      // 2) Try referral code via secure function (works for anon users)
      const { data: referrer } = await supabase
        .rpc('lookup_referral_code', { p_code: shareCode });

      if (referrer) {
        return { shareLink: null, post: null, author: referrer as any, isReferral: true };
      }

      throw new Error("Link not found");
    },
    enabled: !!shareCode,
  });

  const post = data?.post;
  const author = data?.author;
  const isReferral = data?.isReferral || false;
  const inviterName = author?.name || author?.username || "Um usuário";
  const referralCampaignContent = isReferral ? getReferralCampaignContent(promoCampaign, inviterName) : null;
  const headlineText = referralCampaignContent?.headline || texts?.headline || "Você foi convidado(a) para entrar no OCULTO";
  const subheadlineText = referralCampaignContent?.subheadline || texts?.subheadline || "A rede adulta +18 mais desejada do Brasil — onde desejos reais encontram pessoas reais, sem julgamento e sem máscaras.";
  const ctaButtonText = referralCampaignContent?.ctaButton || texts?.cta_button || "Quero fazer parte";
  const referralCardText = referralCampaignContent?.cardText || "Você é um dos poucos escolhidos para acessar o lado mais íntimo da internet brasileira.";
  const isVideo = isVideoUrl(post?.media_url);
  const imageTimeout = 8000; // 8 seconds for images
  const videoTimeout = 10000; // 10 seconds for videos

  // Image blur timer
  useEffect(() => {
    if (!post?.media_url || isVideo) return;
    timerRef.current = setTimeout(() => setMediaBlurred(true), imageTimeout);
    return () => clearTimeout(timerRef.current);
  }, [post, isVideo, imageTimeout]);

  // Video cutoff timer
  const handleVideoPlay = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.pause();
        setVideoEnded(true);
      }
    }, videoTimeout);
  }, [videoTimeout]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const signupUrl = `/signup${shareCode ? `?ref=${shareCode}` : ""}`;

  const handleConfirmAge = () => {
    sessionStorage.setItem("oculto_age_ok", "1");
    // Save share code as cookie for signup referral linking
    if (shareCode) {
      document.cookie = `share_ref_code=${shareCode}; path=/; max-age=86400`;
    }
    setAgeConfirmed(true);
  };

  // Block right-click, drag, and long-press globally on this page
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("selectstart", block);
    // Block long-press save on mobile
    const blockTouch = (e: TouchEvent) => {
      if ((e.target as HTMLElement)?.closest('img, video')) e.preventDefault();
    };
    document.addEventListener("touchstart", blockTouch, { passive: false });
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("touchstart", blockTouch);
    };
  }, []);

  // Age gate overlay
  if (!ageConfirmed) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background"
        style={{ fontFamily: style?.font_body || "Inter" }}>
        <div className="max-w-md w-full rounded-2xl p-8 text-center border border-border bg-card">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-4" style={{ fontFamily: style?.font_heading || "Inter" }}>
            Aviso de Conteúdo Adulto
          </h2>
          <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
            Este conteúdo é exclusivo para <strong className="text-foreground">maiores de 18 anos</strong>. 
            Proibido para menores de idade. Ao continuar, você confirma que tem idade legal para acessar 
            este tipo de conteúdo em sua jurisdição.
          </p>
          <div className="bg-muted rounded-lg p-4 mb-6 text-left">
            <p className="text-[11px] text-muted-foreground">
              Ao clicar em "Tenho +18 anos", você declara sob as penas da lei que possui 18 anos ou mais 
              e concorda com nossos{" "}
              <a href="/legal/termos-de-uso" className="underline text-primary">Termos de Uso</a>{" "}e{" "}
              <a href="/legal/privacidade" className="underline text-primary">Política de Privacidade</a>.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => { window.location.href = "https://www.google.com"; }}
              variant="outline" className="flex-1 h-12">
              <X className="h-4 w-4 mr-2" /> Sair
            </Button>
            <Button onClick={handleConfirmAge}
              className="flex-1 h-12 font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
              Tenho +18 anos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || (!post && !isReferral)) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <ExternalLink className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Link inválido ou expirado</h1>
          <p className="text-muted-foreground mb-6 text-sm">O conteúdo não foi encontrado ou o link expirou.</p>
          <Button asChild className="w-full bg-primary text-primary-foreground">
            <Link to="/">Explorar OCULTO</Link>
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div
      className="min-h-dvh flex flex-col bg-background relative overflow-hidden"
      style={{ fontFamily: style?.font_body || "Inter" }}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Vinheta + glow ambiente */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 0%, hsl(var(--primary) / 0.18), transparent 70%), radial-gradient(50% 35% at 50% 100%, hsl(var(--secondary) / 0.12), transparent 70%)",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 px-4 h-14 flex items-center justify-center border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="w-full max-w-lg flex items-center justify-between">
          <Link to="/">
            <Logo className="scale-75 origin-left" />
          </Link>
          <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to={signupUrl}>Entrar</Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full text-center">
        {/* Selo +18 */}
        <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/40 bg-primary/10 backdrop-blur-sm">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold tracking-wider uppercase text-primary">
            Rede Adulta · Apenas +18
          </span>
        </div>
        {/* Author pill */}
        {author && (
          <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-card border border-border">
            <img loading="lazy" decoding="async"
              src={author.avatar_url || ""}
              alt=""
              className="w-6 h-6 rounded-full object-cover pointer-events-none"
              draggable={false}
            />
            <span className="text-foreground/80 text-sm font-medium">@{author.username || "membro"}</span>
            {author.is_verified && <Sparkles className="h-3.5 w-3.5 text-primary" />}
          </div>
        )}

        {/* Media container — only for media share links */}
        {post?.media_url && (
          <div className="relative w-full rounded-2xl overflow-hidden mb-6 select-none"
            onContextMenu={(e) => e.preventDefault()}>
            {isVideo ? (
              <>
                <video preload="none"
                  ref={videoRef}
                  key={post.media_url}
                  poster={resolveVideoThumbnail((post as any).thumbnail_url, post.media_url)}
                  className="w-full aspect-[9/16] max-h-[70vh] object-cover"
                  playsInline
                  controls
                  onPlay={handleVideoPlay}
                  controlsList="nodownload nofullscreen noremoteplayback"
                  disablePictureInPicture
                  style={{ WebkitTouchCallout: "none", pointerEvents: videoEnded ? "none" : "auto" } as React.CSSProperties}
                >
                  <source src={post.media_url} type={getVideoMimeType(post.media_url)} />
                  <source src={post.media_url} type="video/mp4" />
                </video>
                {videoEnded && (
                  <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-6 p-6">
                    <p className="text-white text-center text-xl font-bold">
                      Quer ver meus segredos ?
                    </p>
                    <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8 h-12">
                      <Link to={signupUrl}>{ctaButtonText}</Link>
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <img loading="lazy" decoding="async"
                  src={post.media_url}
                  alt=""
                  className="w-full aspect-[9/16] max-h-[70vh] object-cover pointer-events-none select-none"
                  draggable={false}
                  style={{
                    WebkitTouchCallout: "none",
                    opacity: mediaBlurred ? 0 : 1,
                    transition: "opacity 0.5s ease-in-out",
                  } as React.CSSProperties}
                />
                {mediaBlurred && (
                  <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-6 p-6">
                    <p className="text-white text-center text-xl font-bold">
                      Quer ver meus segredos ?
                    </p>
                    <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8 h-12">
                      <Link to={signupUrl}>{ctaButtonText}</Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Referral-only: profile photo card */}
        {isReferral && !post?.media_url && author && (
          <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden mb-6 mx-auto flex flex-col items-center justify-center border border-border bg-card/50">
            <div className="w-24 h-24 rounded-full overflow-hidden mb-4 border-2 border-primary/40">
              {author.avatar_url ? (
                <img loading="lazy" decoding="async"
                  src={author.avatar_url}
                  alt={author.name || ""}
                  className="w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
              )}
            </div>
            <p className="text-muted-foreground text-sm px-6">{referralCardText}</p>
          </div>
        )}

        {/* Headline */}
        <h1
          className="text-3xl sm:text-4xl font-extrabold mb-3 leading-tight bg-gradient-to-r from-primary via-foreground to-secondary bg-clip-text text-transparent"
          style={{ fontFamily: style?.font_heading || "Inter" }}
        >
          {headlineText}
        </h1>
        <p className="text-foreground/70 text-sm sm:text-base mb-8 max-w-sm mx-auto leading-relaxed">
          {subheadlineText}
        </p>

        {/* CTA */}
        <Button
          asChild
          size="lg"
          className="w-full max-w-xs text-base font-bold gap-2 rounded-xl h-14 bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-95 shadow-lg shadow-primary/30"
        >
          <Link to={signupUrl}>
            <Flame className="h-5 w-5" />
            {ctaButtonText}
          </Link>
        </Button>

        {/* Trust badges */}
        <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 mt-5 text-foreground/60 text-[11px]">
          <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Comunidade verificada</span>
          <span className="opacity-40">•</span>
          <span className="flex items-center gap-1"><EyeOff className="h-3.5 w-3.5 text-primary" /> Privacidade absoluta</span>
          <span className="opacity-40">•</span>
          <span>Sem rastros</span>
        </div>

        {/* Benefits strip — conversão */}
        <ShareBenefitsStrip />

        {/* Bloco do convite do próprio usuário (persistido em store/localStorage) */}
        {(userInviteUrl || showInviteLoading || ownCodeError) && (
          <div className="mt-8 w-full max-w-sm rounded-xl border border-border bg-card/60 p-4">
            <p className="text-[11px] uppercase tracking-wider text-primary/80 font-semibold mb-3 text-center flex items-center justify-center gap-1">
              <QrCode className="h-3.5 w-3.5" /> Seu link de convite
            </p>
            <ShareViralHint />

            {userInviteUrl ? (
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-md bg-white p-2 border border-border/60">
                  <QRCodeSVG value={userInviteUrl} size={84} />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 rounded-md bg-background/60 border border-border/50 px-2 py-2">
                    <span className="flex-1 text-[11px] text-foreground/90 truncate font-mono text-left">
                      {userInviteUrl}
                    </span>
                    <button
                      onClick={handleCopyInvite}
                      aria-label="Copiar link"
                      className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
                    >
                      <Copy className="h-4 w-4 text-primary" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={handleCopyInvite} className="h-8 text-xs gap-1.5">
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </Button>
                    <Button size="sm" onClick={handleShareInvite} className="h-8 text-xs gap-1.5">
                      <Share2 className="h-3.5 w-3.5" /> Compartilhar
                    </Button>
                  </div>
                </div>
              </div>
            ) : ownCodeError ? (
              <div className="space-y-2 text-center">
                <p className="text-xs text-destructive/90">
                  Não foi possível gerar seu link agora.
                </p>
                <Button
                  size="sm"
                  onClick={handleRetryGenerateOwn}
                  disabled={isGeneratingOwn}
                  className="h-8 text-xs gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingOwn ? 'animate-spin' : ''}`} />
                  {isGeneratingOwn ? 'Tentando...' : 'Tentar novamente'}
                </Button>
              </div>
            ) : (
              /* Skeleton placeholder */
              <div className="flex items-center gap-3">
                <Skeleton className="shrink-0 w-[84px] h-[84px] rounded-md" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-8 w-full rounded-md" />
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-8 rounded-md" />
                    <Skeleton className="h-8 rounded-md" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-muted-foreground/50 text-xs max-w-xs mx-auto">
          {texts?.footer_text || "Uma comunidade exclusiva para quem busca experiências autênticas."}
        </p>
        <p className="text-muted-foreground/30 text-[10px] mt-2">© {new Date().getFullYear()} OCULTO</p>
      </footer>
    </div>
  );
}
