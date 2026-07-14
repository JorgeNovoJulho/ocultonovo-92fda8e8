import { memo } from "react";
import { ShoppingBag, Tag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MarketplaceAdSkeletonProps {
  /** Quantos cards-placeholder mostrar. Default: 2 (combina com visibleCount do card). */
  count?: number;
}

/**
 * Placeholder leve para o card do Marketplace.
 * Sem sombras, sem gradients pesados, layout grid responsivo
 * (1 col em telas <360px, 2 col em ≥360px) — otimizado para
 * dispositivos de baixa RAM/GPU (ref. Realme C55 e inferiores).
 */
export const MarketplaceAdSkeleton = memo(function MarketplaceAdSkeleton({
  count = 2,
}: MarketplaceAdSkeletonProps) {
  return (
    <article
      className="rounded-xl overflow-hidden bg-card border border-border/60"
      style={{ contain: "content" }}
      aria-busy="true"
      aria-label="Carregando anúncios"
    >
      {/* Header placeholder */}
      <div className="flex items-center justify-between p-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center">
            <ShoppingBag className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3 text-muted-foreground/50" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid responsivo de placeholders */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 p-2 sm:p-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg overflow-hidden border border-border/40 bg-background"
          >
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="p-2 sm:p-2.5 space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
            <div className="px-2 pb-2 sm:px-2.5 sm:pb-2.5">
              <Skeleton className="h-7 w-full rounded" />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
});

/**
 * Placeholder vazio: exibido quando o admin habilitou a sessão
 * mas ainda não há anúncios cadastrados. Mensagem amigável,
 * minimalista e sem custo de render.
 */
export const MarketplaceAdEmpty = memo(function MarketplaceAdEmpty() {
  return (
    <article
      className="rounded-xl overflow-hidden bg-card border border-dashed border-border/60"
      style={{ contain: "content" }}
    >
      <div className="px-4 py-6 sm:py-8 text-center space-y-2">
        <div className="mx-auto h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center">
          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Sem anúncios no momento
        </p>
        <p className="text-xs text-muted-foreground max-w-[260px] mx-auto">
          Volte em breve para conferir novos destaques do Marketplace.
        </p>
      </div>
    </article>
  );
});
