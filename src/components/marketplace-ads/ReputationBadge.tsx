import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReputationBadgeProps {
  rating: number;
  totalReviews?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

/**
 * Reputação 0–5 estrelas com barra colorida:
 * - 0–2  → vermelho (péssimo)
 * - 2–4  → gradiente laranja → amarelo (médio)
 * - 4–5  → verde (excelente; nota 5 = verde puro)
 */
export function ReputationBadge({
  rating,
  totalReviews = 0,
  size = "md",
  showLabel = true,
}: ReputationBadgeProps) {
  const safe = Math.max(0, Math.min(5, Number(rating) || 0));
  const pct = (safe / 5) * 100;

  // Cor da barra de acordo com a faixa
  let barClass = "";
  if (safe < 2) {
    barClass = "bg-gradient-to-r from-red-700 to-red-500";
  } else if (safe < 4) {
    barClass = "bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-400";
  } else if (safe < 5) {
    barClass = "bg-gradient-to-r from-yellow-400 to-green-500";
  } else {
    barClass = "bg-gradient-to-r from-green-500 to-emerald-400";
  }

  const starSize = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const textSize = size === "lg" ? "text-base" : size === "sm" ? "text-[11px]" : "text-xs";

  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = safe >= i;
          const half = !filled && safe >= i - 0.5;
          return (
            <Star
              key={i}
              className={cn(
                starSize,
                "transition-colors",
                filled
                  ? "fill-yellow-400 text-yellow-400"
                  : half
                  ? "fill-yellow-400/50 text-yellow-400"
                  : "fill-muted text-muted-foreground/40"
              )}
            />
          );
        })}
        {showLabel && (
          <span className={cn("font-semibold ml-1", textSize)}>
            {safe.toFixed(1)}
            {totalReviews > 0 && (
              <span className="text-muted-foreground font-normal ml-1">
                ({totalReviews})
              </span>
            )}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
