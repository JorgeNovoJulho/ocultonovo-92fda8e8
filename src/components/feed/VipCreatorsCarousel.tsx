import { useRef, memo, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import {
  Crown,
  Sparkles,
  Users,
  Clock,
  Play,
  Plus,
  Rocket,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { VitrinePlansModal } from "@/components/VitrinePlansModal";
import { ProfileHighlightPurchaseModal } from "@/components/settings/ProfileHighlightPurchaseModal";
import { useMyProfileHighlight } from "@/hooks/useProfileHighlight";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { buildChannelRoute } from "@/lib/channelRoute";
import { useHighlightGlow, highlightGlowClass } from "@/hooks/useHighlightGlow";
import { HighlightStyleMenu } from "@/components/highlight/HighlightStyleMenu";
import { useHasVipChannel } from "@/hooks/useHasVipChannel";
import { BETA_PAYMENTS_LOCKED, BETA_CTA_LABEL } from "@/config/betaFlags";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";
import { CarouselDots } from "@/components/ui/CarouselDots";


interface VipCreator {
  id: string;
  user_id: string | null;
  name: string;             // título do CANAL (ex.: "Mulata Curiosa")
  creator_name?: string | null; // nome do CRIADOR (ex.: "OCULTO MASTER")
  username: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  cover_url?: string | null;
  channel_title: string | null;
  channel_description?: string | null;
  monthly_price: number | null;
  trailer_url?: string | null;
  trailer_kind?: "video" | "image" | "gif" | null;
  is_highlighted?: boolean;
  highlight_expires_at?: string | null;
  highlight_glow_style?: "gold" | "rgb" | null;
}

function useVipCreators(limit = 8) {
  return useQuery({
    queryKey: ["vip-creators-carousel-v8", limit],
    queryFn: async (): Promise<VipCreator[]> => {
      const planFields =
        "id, profile_id, title, description, monthly_price, is_active, banner_url, intro_url, intro_kind, intro_poster, created_at";

      // 1) Disparar em PARALELO: perfis VIP/Premium/Master + planos ativos.
      //    Em mobile low-end, reduz o tempo total de espera de ~3 RTTs para 1.
      const [vipRes, plansRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select(
            "id, user_id, name, username, avatar_url, banner_url, plan_type, is_seed, is_test_account, highlight_glow_style"
          )
          .in("plan_type", ["vip", "premium", "master"])
          .limit(limit * 2),
        (supabase as any)
          .from("subscription_plans")
          .select(planFields)
          .eq("is_enabled", true)
          .order("created_at", { ascending: false })
          .limit(limit * 4),
      ]);

      if (vipRes.error) console.warn("[VipCarousel] vipProfiles error:", vipRes.error.message);
      if (plansRes.error) console.warn("[VipCarousel] plans error:", plansRes.error.message);

      const baseProfiles: any[] = (vipRes.data || []).filter(
        (p: any) =>
          (p.is_seed === false || p.is_seed == null) &&
          (p.is_test_account === false || p.is_test_account == null)
      );
      const profileIds = baseProfiles.map((p) => p.id);

      const planByProfile = new Map<string, any>();
      for (const pl of plansRes.data || []) {
        if (!planByProfile.has(pl.profile_id)) planByProfile.set(pl.profile_id, pl);
      }

      // 2) Perfis com plano ativo que ainda não estão na base — uma única query.
      const extraIds = (plansRes.data || [])
        .map((p: any) => p.profile_id)
        .filter((id: string) => !profileIds.includes(id));
      if (extraIds.length) {
        const { data: extraProfiles } = await (supabase as any)
          .from("profiles")
          .select(
            "id, user_id, name, username, avatar_url, banner_url, plan_type, is_seed, is_test_account, highlight_glow_style"
          )
          .in("id", extraIds.slice(0, limit * 2));
        for (const p of extraProfiles || []) {
          if (
            (p.is_seed === false || p.is_seed == null) &&
            (p.is_test_account === false || p.is_test_account == null)
          ) {
            baseProfiles.push(p);
          }
        }
      }

      // 3) Destaques ativos — pulado se não houver perfis (evita query desnecessária).
      const highlightSet = new Set<string>();
      const highlightExpiry = new Map<string, string>();
      const allIds = baseProfiles.map((p) => p.id);
      if (allIds.length) {
        const { data: highlights } = await (supabase as any)
          .from("oculto_profile_highlights")
          .select("profile_id, expires_at, active")
          .in("profile_id", allIds)
          .eq("active", true)
          .gt("expires_at", new Date().toISOString());
        for (const h of highlights || []) {
          highlightSet.add(h.profile_id);
          highlightExpiry.set(h.profile_id, h.expires_at);
        }
      }

      // 4) Map + dedup — APENAS perfis que JÁ criaram canal VIP (plano ativo com título).
      //    Nunca exibimos o nome real do usuário. Sem canal => não entra no carrossel.
      const seen = new Set<string>();
      const result: VipCreator[] = [];
      for (const p of baseProfiles) {
        if (!p?.id || seen.has(p.id)) continue;
        const pl = planByProfile.get(p.id);
        if (!pl) continue; // sem plano ativo → não exibir
        const channelTitle = (pl?.title || "").toString().trim();
        if (!channelTitle) continue; // canal sem título → não exibir
        seen.add(p.id);
        const cover = pl?.banner_url || pl?.intro_poster || p.avatar_url || null;
        const trailerUrl: string | null = pl?.intro_url || null;
        const trailerKind = (pl?.intro_kind as VipCreator["trailer_kind"]) || null;
        result.push({
          id: p.id,
          user_id: p.user_id,
          name: channelTitle, // título do CANAL VIP (nunca o nome real)
          creator_name: p.username ? `@${p.username}` : null, // apenas @username
          username: p.username,
          avatar_url: p.avatar_url,
          banner_url: p.banner_url ?? null,
          cover_url: cover,
          channel_title: channelTitle,
          channel_description: (pl?.description as string) || null,
          monthly_price: pl?.monthly_price ?? null,
          trailer_url: trailerUrl,
          trailer_kind: trailerKind,
          is_highlighted: highlightSet.has(p.id),
          highlight_expires_at: highlightExpiry.get(p.id) ?? null,
          highlight_glow_style: (p.highlight_glow_style as "gold" | "rgb" | null) ?? "gold",
        });
      }

      result.sort((a, b) => Number(!!b.is_highlighted) - Number(!!a.is_highlighted));
      return result.slice(0, limit);
    },

    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    placeholderData: [],
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}


function formatRemaining(ms: number): string {
  if (ms <= 0) return "expirado";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function HighlightCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
      <Clock className="h-2.5 w-2.5" />
      {formatRemaining(remaining)}
    </span>
  );
}

/**
 * Renderiza imagens estáticas; se a URL for um GIF animado, congela
 * no primeiro frame desenhando em <canvas> (sem autoplay no card).
 */
function StaticCover({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const isGif = /\.gif(\?|$)/i.test(src);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasOk, setCanvasOk] = useState(false);

  useEffect(() => {
    if (!isGif) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = img.naturalWidth || 512;
      canvas.height = img.naturalHeight || 512;
      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // teste de CORS — se falhar lança SecurityError
        try { ctx.getImageData(0, 0, 1, 1); } catch { /* tainted, mas frame já desenhado */ }
        setCanvasOk(true);
      } catch {
        setCanvasOk(false);
      }
    };
    img.onerror = () => setCanvasOk(false);
    img.src = src;
    return () => { cancelled = true; };
  }, [src, isGif]);

  if (isGif) {
    return (
      <div className={className} style={{ position: "relative" }}>
        {/* GIF como fallback visual sempre presente */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={className}
          style={{
            position: "absolute",
            inset: 0,
            opacity: canvasOk ? 0 : 1,
          }}
        />
        {/* Canvas sobreposto com primeiro frame congelado quando CORS permitir */}
        <canvas
          ref={canvasRef}
          aria-label={alt}
          className={className}
          style={{
            position: "absolute",
            inset: 0,
            opacity: canvasOk ? 1 : 0,
          }}
        />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={512}
      height={512}
      className={className}
    />
  );
}

const VipCreatorCard = memo(function VipCreatorCard({
  creator,
  onSubscribe,
  isMyCard,
  myExpiresAt,
}: {
  creator: VipCreator;
  onSubscribe: (c: VipCreator) => void;
  isMyCard: boolean;
  myExpiresAt: string | null;
}) {
  const isHighlighted = !!creator.is_highlighted;
  const expiresAt = isMyCard ? myExpiresAt : creator.highlight_expires_at || null;
  const { style: myGlowStyle } = useHighlightGlow();
  // Estilo do glow vem da preferência server-side de cada criador; meu card usa minha preferência local em tempo real.
  const effectiveStyle = isMyCard
    ? myGlowStyle
    : (creator.highlight_glow_style || "gold");
  const glowClass = isHighlighted ? highlightGlowClass(effectiveStyle) : "";
  const [trailerOpen, setTrailerOpen] = useState(false);
  const hasTrailer =
    !!creator.trailer_url && (creator.trailer_kind === "video" || creator.trailer_kind == null);

  const handleSubscribe = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSubscribe(creator);
  };

  const handlePlayTrailer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTrailerOpen(true);
  };

  const cardInner = (
    <Card
      className={`relative overflow-hidden bg-card transition-colors ${
        isHighlighted
          ? `border-2 border-amber-400/80 ${glowClass}`
          : "border border-border/50 hover:border-primary/40"
      }`}
    >
      {/* Top-left badges */}
      {isHighlighted && (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 px-1.5 py-0.5 text-[9px] font-bold text-black shadow-md">
            <Crown className="h-2.5 w-2.5" />
            Destaque 24h
          </span>
          {expiresAt && <HighlightCountdown expiresAt={expiresAt} />}
        </div>
      )}
      {isHighlighted && isMyCard && <HighlightStyleMenu />}
      <div className="relative w-full aspect-square bg-muted">
        {(() => {
          // Capa do CANAL VIP (não usar banner_url do perfil)
          const heroSrc = creator.cover_url || creator.avatar_url;
          return heroSrc ? (
            <StaticCover
              src={heroSrc}
              alt={creator.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted text-2xl font-bold text-muted-foreground">
              {(creator.name || "?")[0]}
            </div>
          );
        })()}

        {/* Botão de trailer */}
        {hasTrailer && (
          <button
            type="button"
            onClick={handlePlayTrailer}
            aria-label={`Assistir trailer de ${creator.name}`}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group/play"
          >
            <span className="flex items-center justify-center h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 text-white opacity-90 group-hover/play:scale-110 transition-transform">
              <Play className="h-5 w-5 fill-white" />
            </span>
          </button>
        )}
      </div>

      <div className="p-2 flex flex-col gap-1">
        <p className="text-sm font-bold text-foreground truncate text-center leading-tight">
          {creator.name}
        </p>
        {creator.username && (
          <p className="text-[10px] text-muted-foreground truncate text-center">
            @{creator.username}
          </p>
        )}
        {creator.monthly_price != null && (
          <p className="text-[11px] font-semibold text-amber-400 flex items-center justify-center gap-1">
            <Sparkles className="h-3 w-3 shrink-0" />
            R$ {Number(creator.monthly_price).toFixed(2).replace(".", ",")}/mês
          </p>
        )}
        <Button
          size="sm"
          onClick={handleSubscribe}
          disabled={BETA_PAYMENTS_LOCKED}
          className="w-full h-8 text-xs gap-1 font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black disabled:opacity-80 disabled:cursor-not-allowed"
        >
          <>
            <Crown className="h-3.5 w-3.5" />
            {BETA_PAYMENTS_LOCKED ? BETA_CTA_LABEL : "Assinar"}
          </>
        </Button>
      </div>
    </Card>
  );

  return (
    <>
      <Link
        to={buildChannelRoute({
          ownerId: creator.id,
          ownerUserId: creator.user_id,
          ownerUsername: creator.username,
          ownerName: creator.name,
          channelTitle: creator.channel_title,
        })}
        className="block flex-shrink-0 w-[44vw] max-w-[180px] sm:w-[170px] relative snap-start rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Ver canal de ${creator.name}`}
      >
        {cardInner}
      </Link>

      {hasTrailer && (
        <Dialog open={trailerOpen} onOpenChange={setTrailerOpen}>
          <DialogContent
            className="
              p-0 overflow-hidden bg-card border-amber-500/40 flex flex-col
              w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-2xl
              max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)]
              sm:max-h-[92dvh]
            "
          >
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
            {/* Conteúdo rolável único — garante que tudo (vídeo, descrição, botões) seja visível */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
              {/* Vídeo */}
              <div className="bg-black">
                <video
                  src={creator.trailer_url!}
                  poster={creator.cover_url || undefined}
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="metadata"
                  controlsList="nodownload"
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full h-auto max-h-[45vh] sm:max-h-[55vh] bg-black"
                />
              </div>

              {/* Cabeçalho do canal: avatar + título lado a lado */}
              <div className="px-3 sm:px-4 pt-3 pb-2 border-b border-border/40">
                <div className="flex items-start gap-3">
                  {/* Avatar do criador (foto social do perfil) */}
                  <div className="relative flex-shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden ring-2 ring-amber-400/50 bg-muted">
                    {creator.avatar_url ? (
                      <img
                        src={creator.avatar_url}
                        alt={creator.creator_name || creator.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-base font-bold text-muted-foreground">
                        {(creator.creator_name || creator.name || "?")[0]}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-amber-400">
                      <Sparkles className="h-3 w-3" />
                      Trailer do Canal
                    </div>
                    <h2 className="mt-0.5 text-base sm:text-lg font-bold text-foreground leading-tight break-words">
                      {creator.name}
                    </h2>
                    {creator.creator_name && (
                      <p className="text-[11px] sm:text-xs text-muted-foreground break-words">
                        por <span className="font-medium text-foreground/80">{creator.creator_name}</span>
                        {creator.username ? ` · @${creator.username}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Descrição completa */}
              {creator.channel_description && (
                <div className="px-3 sm:px-4 py-3 text-[13px] sm:text-sm text-muted-foreground whitespace-pre-line leading-relaxed break-words">
                  {creator.channel_description}
                </div>
              )}

              {/* Ações dentro do scroll para nunca cortarem */}
              <div className="px-3 sm:px-4 py-3 border-t border-border/40 flex flex-col sm:flex-row gap-2 bg-card sticky bottom-0">
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (BETA_PAYMENTS_LOCKED) return;
                    setTrailerOpen(false);
                    onSubscribe(creator);
                  }}
                  disabled={BETA_PAYMENTS_LOCKED}
                  className="flex-1 h-10 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  <Crown className="h-4 w-4 mr-1.5" />
                  {BETA_PAYMENTS_LOCKED
                    ? BETA_CTA_LABEL
                    : creator.monthly_price != null
                      ? `Assinar · R$ ${Number(creator.monthly_price).toFixed(2).replace(".", ",")}/mês`
                      : "Assinar canal"}
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="flex-1 h-10 border-amber-400/60 text-amber-400 hover:bg-amber-400/10 text-sm"
                >
                  <Link
                    to={buildChannelRoute({
                      ownerId: creator.id,
                      ownerUserId: creator.user_id,
                      ownerUsername: creator.username,
                      ownerName: creator.name,
                      channelTitle: creator.channel_title,
                    })}
                    onClick={() => setTrailerOpen(false)}
                  >
                    Entrar no canal
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
});

// ---- Canais fake (placeholder) — sumem quando houver 15+ canais reais ----
const FAKE_VIP_CREATORS: VipCreator[] = [
  // Loira Misteriosa — mulher loira
  { id: "fake-1", user_id: null, name: "Loira Misteriosa", username: "loira_misteriosa", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1554151228-14d9def656e4?w=512&q=70", channel_title: "Loira Misteriosa", monthly_price: 29.9 },
  // Diva Discreta — mulher elegante
  { id: "fake-2", user_id: null, name: "Diva Discreta", username: "diva_discreta", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=512&q=70", channel_title: "Diva Discreta", monthly_price: 39.9 },
  // Casal Aventura — casal
  { id: "fake-3", user_id: null, name: "Casal Aventura", username: "casal_aventura", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=512&q=70", channel_title: "Casal Aventura", monthly_price: 49.9 },
  // Morena Sensual — mulher morena
  { id: "fake-4", user_id: null, name: "Morena Sensual", username: "morena_sensual", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=512&q=70", channel_title: "Morena Sensual", monthly_price: 34.9 },
  // Ruiva Indecente — mulher ruiva
  { id: "fake-5", user_id: null, name: "Ruiva Indecente", username: "ruiva_indecente", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=512&q=70", channel_title: "Ruiva Indecente", monthly_price: 44.9 },
  // Doce Veneno — mulher sensual
  { id: "fake-6", user_id: null, name: "Doce Veneno", username: "doce_veneno", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=512&q=70", channel_title: "Doce Veneno", monthly_price: 27.9 },
  // Boneca Safada — mulher jovem playful
  { id: "fake-7", user_id: null, name: "Boneca Safada", username: "boneca_safada", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=512&q=70", channel_title: "Boneca Safada", monthly_price: 32.9 },
  // Casal do Lado — casal jovem
  { id: "fake-8", user_id: null, name: "Casal do Lado", username: "casal_do_lado", avatar_url: null, cover_url: "https://images.unsplash.com/photo-1521985691606-9c2d8a3a5fdd?w=512&q=70", channel_title: "Casal do Lado", monthly_price: 54.9 },
];

function FakeVipCreatorCard({ creator, onClick }: { creator: VipCreator; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Canal ${creator.name} (em breve)`}
      className="block flex-shrink-0 w-[44vw] max-w-[180px] sm:w-[170px] relative snap-start text-left"
    >
      <Card className="relative overflow-hidden bg-card border border-border/50 opacity-90">
        <div className="absolute top-2 left-2 z-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 backdrop-blur px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
            Em breve
          </span>
        </div>
        <div className="relative w-full aspect-square bg-muted">
          {creator.cover_url ? (
            <img
              src={creator.cover_url}
              alt={creator.name}
              loading="lazy"
              className="w-full h-full object-cover"
              style={{ filter: "blur(4px) saturate(0.85)" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
              {(creator.name || "?")[0]}
            </div>
          )}
        </div>
        <div className="p-2 flex flex-col gap-1">
          <p className="text-sm font-bold text-foreground truncate text-center leading-tight">{creator.name}</p>
          {creator.username && (
            <p className="text-[10px] text-muted-foreground truncate text-center">@{creator.username}</p>
          )}
          {creator.monthly_price != null && (
            <p className="text-[11px] font-semibold text-amber-400 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3 shrink-0" />
              R$ {Number(creator.monthly_price).toFixed(2).replace(".", ",")}/mês
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs gap-1 font-semibold border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
          >
            <Crown className="h-3.5 w-3.5" />
            Em breve
          </Button>
        </div>
      </Card>
    </button>
  );
}

/** CTA fixo na primeira posição: "Crie seu canal VIP". */
function CreateVipChannelCTACard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Crie seu canal VIP"
      className="block flex-shrink-0 w-[44vw] max-w-[180px] sm:w-[170px] relative snap-start text-left"
    >
      <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-background border-2 border-dashed border-amber-400/70 hover:border-amber-400 transition-colors shadow-[0_0_20px_hsl(45_93%_47%/0.15)] hover:shadow-[0_0_28px_hsl(45_93%_47%/0.35)]">
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 px-1.5 py-0.5 text-[9px] font-bold text-black shadow-md">
          <Rocket className="h-2.5 w-2.5" />
          Novo
        </span>
        <div className="relative w-full aspect-square flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,hsl(45_93%_47%/0.25),transparent_60%),radial-gradient(circle_at_70%_70%,hsl(280_70%_60%/0.18),transparent_60%)]" />
          <div className="relative flex flex-col items-center gap-2 px-3 text-center">
            <div className="h-14 w-14 rounded-full bg-amber-400/20 flex items-center justify-center ring-2 ring-amber-400/60">
              <Plus className="h-7 w-7 text-amber-300" />
            </div>
            <Crown className="h-5 w-5 text-amber-300" />
          </div>
        </div>
        <div className="p-2 flex flex-col gap-1 bg-card/60">
          <p className="text-sm font-bold text-foreground text-center leading-tight">
            Crie seu canal VIP
          </p>
          <p className="text-[10px] text-muted-foreground text-center leading-snug line-clamp-2">
            Ganhe destaque e monetize seu conteúdo.
          </p>
          <Button
            size="sm"
            className="w-full h-8 text-xs gap-1 font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black mt-1"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Começar agora
          </Button>
        </div>
      </Card>
    </button>
  );
}


export const VipCreatorsCarousel = memo(function VipCreatorsCarousel() {
  const { data: realCreators = [], isLoading } = useVipCreators(30);
  const navigate = useNavigate();
  const [showVitrine, setShowVitrine] = useState(false);
  const [highlightModalOpen, setHighlightModalOpen] = useState(false);
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: myHighlight } = useMyProfileHighlight();
  const { data: ownsVipChannel = false } = useHasVipChannel();
  // Destaque dourado só vale para quem possui canal VIP ativo. Durante o beta,
  // qualquer ação de monetização fica bloqueada.
  const isHighlightActive = !!myHighlight && ownsVipChannel;
  const canManageHighlight = ownsVipChannel && !BETA_PAYMENTS_LOCKED;

  // Reais sempre vêm primeiro; fakes preenchem até atingir 15 reais.
  // Quando houver ≥ 15 reais, fakes são eliminados automaticamente.
  const realCount = realCreators.length;
  const fakes = realCount >= 15 ? [] : FAKE_VIP_CREATORS.slice(0, Math.max(0, 12 - realCount));
  const creators: VipCreator[] = [...realCreators, ...fakes];

  // Mostra o CTA "Crie seu canal" para quem ainda não possui canal VIP.
  const showCreateCta = !ownsVipChannel;

  const handleCreateChannelCta = useCallback(() => {
    const isVip = !!(profile?.is_vip || profile?.plan_type === "vip" || profile?.plan_type === "master");
    if (isVip) {
      navigate("/canal-vip");
    } else {
      // Free/Premium → abre vitrine que já contém o fluxo de upgrade para criar canal
      setShowVitrine(true);
    }
  }, [profile, navigate]);

  // Autoplay + dots + pausa em hover/touch/scroll manual + respeita prefers-reduced-motion.
  const {
    ref: scrollRef,
    activeIndex,
    interactionHandlers,
    markProgrammaticScroll,
  } = useCarouselAutoplay<HTMLDivElement>({ itemCount: creators.length + (showCreateCta ? 1 : 0) });

  // Barra de rolagem custom (igual Salas Ocultas) — somente desktop.
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0, visible: false });

  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const trackWidth = track?.clientWidth ?? el.clientWidth;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4 || el.scrollWidth <= 0) {
        setThumb({ width: 0, left: 0, visible: false });
        return;
      }
      const ratio = el.clientWidth / el.scrollWidth;
      const w = Math.max(48, Math.floor(trackWidth * ratio));
      const left = Math.max(0, Math.min(trackWidth - w, (el.scrollLeft / max) * (trackWidth - w)));
      setThumb({ width: w, left, visible: true });
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    if (track) ro.observe(track);
    const timers = [60, 250, 700, 1500].map((ms) => window.setTimeout(update, ms));
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [creators.length, showCreateCta]);

  const beginThumbDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    e.preventDefault();
    const trackRect = track.getBoundingClientRect();
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const thumbW = thumb.width || 48;
    const usable = trackRect.width - thumbW;
    if (usable <= 0) return;
    const startX = e.clientX;
    const startLeft = thumb.left;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const nextLeft = Math.max(0, Math.min(usable, startLeft + delta));
      el.scrollLeft = (nextLeft / usable) * max;
    };
    const onUp = (ev: PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.thumb === "true") return;
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackRect = track.getBoundingClientRect();
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const thumbW = thumb.width || 48;
    const usable = trackRect.width - thumbW;
    const x = e.clientX - trackRect.left - thumbW / 2;
    const nextLeft = Math.max(0, Math.min(usable, x));
    try {
      el.scrollTo({ left: (nextLeft / usable) * max, behavior: "smooth" });
    } catch {
      el.scrollLeft = (nextLeft / usable) * max;
    }
  };

  const handleSubscribe = (_creator: VipCreator) => {

    setShowVitrine(true);
  };

  if (isLoading && realCreators.length === 0) {
    return (
      <Card className="my-4 mx-2 sm:mx-0 w-auto sm:w-full min-w-0 max-w-full border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3">
          <Crown className="h-4 w-4 text-amber-400 shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">
            Explorar Criadores VIP
          </h3>
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">Carregando criadores VIP…</p>
      </Card>
    );
  }

  return (
    <>
      <Card
        className="my-4 mx-2 sm:mx-0 w-auto sm:w-full min-w-0 max-w-full border border-border/60 bg-card overflow-hidden"
        {...interactionHandlers}
      >
        <div className="flex items-center gap-2 px-3 sm:px-4 pt-3 pb-2">
          <Crown className="h-4 w-4 text-amber-400 shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">
            Explorar Criadores VIP
          </h3>
          <div className="ml-auto flex items-center gap-1">
            {user && ownsVipChannel && (
              <Button
                size="sm"
                variant={isHighlightActive ? "outline" : "default"}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!canManageHighlight) return;
                  setHighlightModalOpen(true);
                }}
                disabled={!canManageHighlight}
                className={
                  isHighlightActive
                    ? "h-8 text-[11px] gap-1 border-amber-400/60 text-amber-400 hover:bg-amber-400/10 disabled:opacity-80 disabled:cursor-not-allowed"
                    : "h-8 text-[11px] gap-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold disabled:opacity-80 disabled:cursor-not-allowed"
                }
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {BETA_PAYMENTS_LOCKED
                    ? BETA_CTA_LABEL
                    : isHighlightActive ? "Destaque ativo" : "Destacar canal"}
                </span>
                <span className="sm:hidden">
                  {BETA_PAYMENTS_LOCKED
                    ? BETA_CTA_LABEL
                    : isHighlightActive ? "Ativo" : "Destacar"}
                </span>
              </Button>
            )}
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 text-[11px] gap-1"
            >
              <Link to="/vitrine-vip">
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Ver vitrine</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* My active highlight benefit banner */}
        {isHighlightActive && myHighlight?.expires_at && (
          <div className="mx-3 sm:mx-4 mb-2 flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2">
            <Crown className="h-4 w-4 text-amber-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-amber-200">
                Seu canal está em destaque por 24h
              </p>
              <p className="text-[10px] text-amber-200/70 truncate">
                Aparece no topo da vitrine, com selo dourado e mais visibilidade.
              </p>
            </div>
            <HighlightCountdown expiresAt={myHighlight.expires_at} />
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide px-3 sm:px-4 pb-3 snap-x snap-proximity overscroll-x-contain"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
        >
          {showCreateCta && (
            <CreateVipChannelCTACard key="create-channel-cta" onClick={handleCreateChannelCta} />
          )}
          {creators.length > 0 ? (
            creators.map((c) =>
              c.id.startsWith("fake-") ? (
                <FakeVipCreatorCard
                  key={c.id}
                  creator={c}
                  onClick={() =>
                    toast.info("Conteúdo indisponível, volte mais tarde.", {
                      description: "Este canal ainda está em preparação.",
                    })
                  }
                />
              ) : (
                <VipCreatorCard
                  key={c.id}
                  creator={c}
                  onSubscribe={handleSubscribe}
                  isMyCard={!!profile?.id && c.id === profile.id}
                  myExpiresAt={myHighlight?.expires_at ?? null}
                />
              )
            )
          ) : !showCreateCta ? (
            <div className="py-6 text-sm text-muted-foreground">
              Nenhum canal real disponível no momento.
            </div>
          ) : null}
        </div>

        {/* Barra de rolagem custom — somente desktop (mesmo padrão de Salas Ocultas) */}
        <div className="hidden md:block px-3 sm:px-4 pb-3">
          <div
            ref={trackRef}
            onMouseDown={handleTrackClick as any}
            className={`relative h-2.5 w-full rounded-full bg-white/10 ring-1 ring-white/10 transition-opacity ${thumb.visible ? "opacity-100" : "opacity-40"}`}
            role="scrollbar"
            aria-orientation="horizontal"
          >
            <div
              data-thumb="true"
              onPointerDown={beginThumbDrag}
              className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 shadow cursor-grab active:cursor-grabbing hover:brightness-110"
              style={{ width: `${thumb.width}px`, left: `${thumb.left}px`, touchAction: "none" }}
              aria-label="Arraste para navegar"
            />
          </div>
        </div>

        <CarouselDots
          count={creators.length}
          activeIndex={activeIndex}
          ariaLabel="Explorar Criadores VIP"
        />
      </Card>

      <VitrinePlansModal open={showVitrine} onOpenChange={setShowVitrine} />
      <ProfileHighlightPurchaseModal
        open={highlightModalOpen}
        onOpenChange={setHighlightModalOpen}
      />
    </>
  );
});
