/**
 * SponsoredAdsCarousel — post fixo no feed exibindo anúncios patrocinados.
 * Plataforma + criadores VIP/afiliados. Marcado claramente como "Patrocinado".
 */
import { useEffect, useRef, useState } from "react";
import { Megaphone, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useActiveSponsoredAds, recordAdEvent, type SponsoredAd } from "@/hooks/useSponsoredAds";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SponsoredAdsCarousel() {
  const { data: ads = [], isLoading } = useActiveSponsoredAds("feed");
  const [index, setIndex] = useState(0);
  const trackedRef = useRef<Set<string>>(new Set());

  // Registra impressão única por sessão para o anúncio visível
  useEffect(() => {
    const ad = ads[index];
    if (!ad) return;
    if (trackedRef.current.has(ad.id)) return;
    trackedRef.current.add(ad.id);
    recordAdEvent(ad.id, "impression");
  }, [ads, index]);

  if (isLoading || ads.length === 0) return null;

  const ad = ads[index];
  const hasMany = ads.length > 1;

  const handleClick = () => {
    recordAdEvent(ad.id, "click");
    if (ad.target_url) {
      window.open(ad.target_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section
      aria-label="Anúncios patrocinados"
      className="mx-3 sm:mx-4 my-3 rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      <header className="flex items-center justify-between px-3 py-2 bg-muted/40">
        <div className="flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Patrocinado
          </span>
        </div>
        {hasMany && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIndex((i) => (i - 1 + ads.length) % ads.length)}
              aria-label="Anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {index + 1}/{ads.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIndex((i) => (i + 1) % ads.length)}
              aria-label="Próximo"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </header>

      <button
        type="button"
        onClick={handleClick}
        className="block w-full text-left group"
      >
        {ad.image_url && (
          <div className="relative w-full bg-muted">
            <img
              src={ad.image_url}
              alt={ad.title}
              loading="lazy"
              decoding="async"
              className="w-full h-auto max-h-[420px] object-cover"
            />
          </div>
        )}
        <div className="p-3 space-y-1.5">
          <h3 className="text-sm sm:text-base font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {ad.title}
          </h3>
          {ad.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {ad.description}
            </p>
          )}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold mt-1",
              "bg-primary text-primary-foreground group-hover:bg-primary/90 transition-colors",
            )}
          >
            {ad.cta_text || "Saiba mais"}
            <ExternalLink className="h-3 w-3" />
          </div>
        </div>
      </button>
    </section>
  );
}
