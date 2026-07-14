import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Play, ShoppingBag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BlurImage } from "@/components/ui/blur-image";
import { cn } from "@/lib/utils";
import type { MarketplaceAd } from "@/hooks/useMarketplaceAds";
import { ReputationBadge } from "./ReputationBadge";

interface MarketplaceAdModalProps {
  ad: MarketplaceAd;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MediaItem {
  type: "image" | "video";
  url: string;
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function MarketplaceAdModal({ ad, open, onOpenChange }: MarketplaceAdModalProps) {
  const media: MediaItem[] = useMemo(() => {
    const items: MediaItem[] = [];
    if (ad.main_image_url) items.push({ type: "image", url: ad.main_image_url });
    (ad.gallery_images || [])
      .filter((u) => u && u !== ad.main_image_url)
      .slice(0, 9) // 1 principal + 9 = 10 total
      .forEach((u) => items.push({ type: "image", url: u }));
    if (ad.video_url) items.push({ type: "video", url: ad.video_url });
    return items;
  }, [ad]);

  const [activeIdx, setActiveIdx] = useState(0);
  const active = media[activeIdx];

  // Skeleton enquanto a mídia ativa (imagem/vídeo) carrega
  const [mediaLoading, setMediaLoading] = useState(true);
  useEffect(() => {
    setMediaLoading(true);
  }, [active?.url]);

  // Skeleton para "informações extras" (advertiser + reputation) — esses
  // campos vêm de `enrichAds()` em uma 2ª query. Se ainda estiverem nulos,
  // mostramos placeholders por ~600ms para evitar flash de "vazio".
  const advertiserResolved = ad.advertiser !== undefined;
  const reputationResolved = ad.reputation !== undefined;
  const [showExtrasSkeleton, setShowExtrasSkeleton] = useState(
    !advertiserResolved || !reputationResolved
  );
  useEffect(() => {
    if (advertiserResolved && reputationResolved) {
      setShowExtrasSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowExtrasSkeleton(false), 600);
    return () => clearTimeout(t);
  }, [advertiserResolved, reputationResolved]);

  const advertiserName =
    ad.advertiser?.name || ad.advertiser?.username || "Anunciante";
  const advertiserLink = ad.advertiser?.id
    ? `/creator/${ad.advertiser.id}`
    : null;

  const handlePrev = () => setActiveIdx((i) => (i === 0 ? media.length - 1 : i - 1));
  const handleNext = () => setActiveIdx((i) => (i === media.length - 1 ? 0 : i + 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-left">
            <ShoppingBag className="h-5 w-5 text-primary" aria-hidden />
            <span className="line-clamp-2">{ad.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-5 px-5 pb-5">
          {/* Carrossel */}
          <div className="space-y-2">
            <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-black">
              {/* Skeleton enquanto a mídia ativa carrega */}
              {mediaLoading && (
                <Skeleton className="absolute inset-0 rounded-none bg-muted/40" />
              )}
              {active?.type === "video" ? (
                <video
                  key={active.url}
                  src={active.url}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedData={() => setMediaLoading(false)}
                  onError={() => setMediaLoading(false)}
                  className="w-full h-full object-contain relative z-[1]"
                />
              ) : active?.type === "image" ? (
                <BlurImage
                  key={active.url}
                  src={active.url}
                  alt={ad.title}
                  className="object-contain"
                  onLoadCapture={() => setMediaLoading(false)}
                />
              ) : null}

              {media.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handlePrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full shadow z-10"
                    aria-label="Mídia anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full shadow z-10"
                    aria-label="Próxima mídia"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium z-10">
                    {activeIdx + 1} / {media.length}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {media.length > 1 && (
              <div
                className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin"
                role="tablist"
                aria-label="Galeria de mídias do anúncio"
              >
                {media.map((m, i) => (
                  <button
                    key={`${m.url}-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={i === activeIdx}
                    aria-label={
                      m.type === "image" ? `Imagem ${i + 1}` : `Vídeo ${i + 1}`
                    }
                    onClick={() => setActiveIdx(i)}
                    className={cn(
                      "relative shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all",
                      i === activeIdx
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    {m.type === "image" ? (
                      <BlurImage
                        src={m.url}
                        alt={`Mídia ${i + 1}`}
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-black flex items-center justify-center">
                        <Play className="h-5 w-5 text-white" fill="currentColor" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detalhes */}
          <div className="space-y-4">
            {ad.price > 0 && (
              <div className="rounded-lg bg-gradient-to-br from-amber-400/20 to-amber-500/10 border border-amber-400/30 p-3">
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">Preço</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                  {formatBRL(ad.price)}
                </p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Descrição</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {ad.full_description || ad.short_description}
              </p>
            </div>

            {/* Anunciante + Reputação */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Anunciante
              </p>

              {showExtrasSkeleton ? (
                <ExtrasSkeleton />
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-muted shrink-0">
                      {ad.advertiser?.avatar_url ? (
                        <BlurImage
                          src={ad.advertiser.avatar_url}
                          alt={advertiserName}
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-sm font-bold text-foreground">
                          {advertiserName[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {advertiserLink ? (
                        <Link
                          to={advertiserLink}
                          onClick={() => onOpenChange(false)}
                          className="text-sm font-semibold text-foreground hover:text-primary truncate block transition-colors"
                        >
                          {advertiserName}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-foreground truncate block">
                          {advertiserName}
                        </span>
                      )}
                      {ad.advertiser?.username && (
                        <p className="text-xs text-muted-foreground truncate">
                          @{ad.advertiser.username}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                      Reputação
                    </p>
                    <ReputationBadge
                      rating={ad.reputation?.rating || 0}
                      totalReviews={ad.reputation?.total_reviews || 0}
                      size="md"
                    />
                  </div>
                </>
              )}
            </div>

            {ad.external_url && (
              <Button asChild className="w-full">
                <a href={ad.external_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Acessar oferta
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExtrasSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando informações do anunciante">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>
    </div>
  );
}
