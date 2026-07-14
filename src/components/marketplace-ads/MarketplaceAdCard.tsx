import { useState, memo, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, ShoppingBag, Tag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlurImage } from "@/components/ui/blur-image";
import { type MarketplaceAd, incrementAdClick } from "@/hooks/useMarketplaceAds";
import { ReputationBadge } from "./ReputationBadge";
import { MarketplaceAdModal } from "./MarketplaceAdModal";

interface MarketplaceAdCardProps {
  ads: MarketplaceAd[];
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Card horizontal estilo Mercado Livre.
 *
 * Estratégia de performance (alvo: Realme C55 e inferiores — 4GB RAM, GPU fraca):
 *  - Mobile: scroll horizontal nativo com `scroll-snap` (sem JS de transform,
 *    sem reflow caro). Cards de largura fixa em `vw` para não recalcular em resize.
 *  - Desktop (≥sm): grid responsivo, sem carrossel.
 *  - `loading="lazy"`, `decoding="async"`, `fetchpriority="low"` em todas as imagens.
 *  - `content-visibility: auto` no container externo para pular render off-screen.
 *  - Sem box-shadow pesado, sem gradients animados, sem `hover:scale` no mobile.
 */
export const MarketplaceAdCard = memo(function MarketplaceAdCard({ ads }: MarketplaceAdCardProps) {
  const [openAd, setOpenAd] = useState<MarketplaceAd | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  if (!ads || ads.length === 0) return null;

  const handleAdClick = useCallback((ad: MarketplaceAd) => {
    setOpenAd(ad);
    incrementAdClick(ad.id);
  }, []);

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-ad-card]");
    const step = card ? card.offsetWidth + 8 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  // Navegação por teclado dentro do carrossel mobile (← → Home End)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-ad-card]"));
      if (cards.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const currentIdx = active ? cards.indexOf(active) : -1;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = cards[Math.min(cards.length - 1, currentIdx + 1)] || cards[0];
        next.focus();
        next.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = cards[Math.max(0, currentIdx - 1)] || cards[0];
        prev.focus();
        prev.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      } else if (e.key === "Home") {
        e.preventDefault();
        cards[0].focus();
        cards[0].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      } else if (e.key === "End") {
        e.preventDefault();
        const last = cards[cards.length - 1];
        last.focus();
        last.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    },
    []
  );

  return (
    <>
      <article
        className="rounded-xl overflow-hidden bg-card border border-border/60"
        style={{ contain: "content", contentVisibility: "auto" } as React.CSSProperties}
        aria-label="Anúncios em destaque do Marketplace"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
              <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] sm:text-sm font-semibold text-foreground flex items-center gap-1.5 truncate">
                Anúncios em Destaque
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-400 shrink-0" aria-hidden />
              </p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground flex items-center gap-1">
                <Tag className="h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden />
                Patrocinado
              </p>
            </div>
          </div>
        </div>

        {/* === Mobile: scroll horizontal nativo (snap), Desktop: grid === */}
        <div className="relative">
          {/* Mobile carousel */}
          <div
            ref={scrollRef}
            role="region"
            aria-roledescription="carrossel"
            aria-label={`Carrossel de ${ads.length} anúncio(s). Use as setas do teclado para navegar.`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="flex sm:hidden overflow-x-auto overflow-y-hidden gap-2 p-2 snap-x snap-mandatory scrollbar-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              overscrollBehaviorX: "contain",
            }}
          >
            {ads.map((ad, i) => (
              <AdItem
                key={ad.id}
                ad={ad}
                onClick={handleAdClick}
                variant="mobile"
                position={i + 1}
                total={ads.length}
              />
            ))}
          </div>

          {/* Desktop / tablet grid */}
          <div
            className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3"
            role="list"
            aria-label="Lista de anúncios"
          >
            {ads.slice(0, 8).map((ad, i) => (
              <div role="listitem" key={ad.id}>
                <AdItem
                  ad={ad}
                  onClick={handleAdClick}
                  variant="grid"
                  position={i + 1}
                  total={Math.min(ads.length, 8)}
                />
              </div>
            ))}
          </div>

          {/* Setas — só em telas onde mouse é provável (sm+ não precisa pois é grid) */}
          {ads.length > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => scrollBy(-1)}
                className="hidden xs:flex sm:hidden absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full z-10 opacity-90"
                aria-label="Anúncio anterior"
                aria-controls="marketplace-carousel"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => scrollBy(1)}
                className="hidden xs:flex sm:hidden absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full z-10 opacity-90"
                aria-label="Próximo anúncio"
                aria-controls="marketplace-carousel"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </article>

      {openAd && (
        <MarketplaceAdModal
          ad={openAd}
          open={!!openAd}
          onOpenChange={(o) => !o && setOpenAd(null)}
        />
      )}
    </>
  );
});

// ─────────────────────────────────────────────────────────────────────────
// AdItem — card individual. Memoizado, sem efeitos custosos no mobile.
// ─────────────────────────────────────────────────────────────────────────
interface AdItemProps {
  ad: MarketplaceAd;
  onClick: (ad: MarketplaceAd) => void;
  variant: "mobile" | "grid";
  position?: number;
  total?: number;
}

const AdItem = memo(function AdItem({ ad, onClick, variant, position, total }: AdItemProps) {
  const isMobile = variant === "mobile";
  const priceLabel = ad.price > 0 ? `Preço ${formatBRL(ad.price)}.` : "";
  const positionLabel = position && total ? `Anúncio ${position} de ${total}.` : "";
  const ariaLabel = `${positionLabel} ${ad.title}. ${priceLabel} ${ad.short_description || ""} Toque ou pressione Enter para ver detalhes.`
    .replace(/\s+/g, " ")
    .trim();

  return (
    <button
      type="button"
      data-ad-card
      onClick={() => onClick(ad)}
      aria-label={ariaLabel}
      className={[
        "group text-left rounded-lg overflow-hidden border border-border/40 bg-background transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        isMobile
          ? "shrink-0 snap-start w-[68vw] max-w-[240px] active:bg-muted/40"
          : "w-full hover:border-primary/50",
      ].join(" ")}
      style={{ contain: "content" }}
    >
      <div className="relative aspect-square w-full overflow-hidden">
        <BlurImage
          src={ad.main_image_url}
          alt={ad.title}
          sizes="(max-width: 640px) 68vw, (max-width: 1024px) 33vw, 25vw"
          className={[
            "object-cover",
            // Sem hover/scale em mobile — hover-scale é caríssimo em GPU fraca
            isMobile ? "" : "transition-transform duration-200 group-hover:scale-105",
          ].join(" ")}
        />
        {ad.price > 0 && (
          <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 bg-amber-400 text-amber-950 font-bold text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full z-10">
            {formatBRL(ad.price)}
          </div>
        )}
      </div>
      <div className="p-2 sm:p-2.5 space-y-1 sm:space-y-1.5">
        <h4 className="text-[13px] sm:text-sm font-semibold text-foreground line-clamp-2 leading-tight">
          {ad.title}
        </h4>
        <p className="text-[10px] sm:text-[11px] text-muted-foreground line-clamp-2 leading-tight">
          {ad.short_description}
        </p>
        {ad.reputation && ad.reputation.total_reviews > 0 && (
          <ReputationBadge
            rating={ad.reputation.rating}
            totalReviews={ad.reputation.total_reviews}
            size="sm"
            showLabel={false}
          />
        )}
      </div>
      <div className="px-2 pb-2 sm:px-2.5 sm:pb-2.5">
        <div className="w-full text-center bg-muted/60 group-hover:bg-primary group-hover:text-primary-foreground transition-colors text-[11px] sm:text-xs font-medium py-1.5 rounded">
          Ver detalhes
        </div>
      </div>
    </button>
  );
});
