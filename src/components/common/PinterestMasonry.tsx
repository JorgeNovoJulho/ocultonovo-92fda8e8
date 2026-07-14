/**
 * PinterestMasonry — grid masonry estilo Pinterest usando CSS columns nativas.
 * Mobile-first, leve (<4GB RAM), sem libs externas.
 * Preserva aspect ratio real das imagens (heights variados).
 *
 * Recursos extras:
 * - Bloqueia menu de contexto (click-direito) e long-press para impedir download.
 * - Suporte opcional a seleção múltipla (checkbox + callback).
 */
import { ReactNode } from "react";
import { Play, Heart, MessageCircle, Eye, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MasonryItem {
  id: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  media_type?: string | null;
  likes_count?: number;
  comments_count?: number;
  views_count?: number;
}

interface PinterestMasonryProps<T extends MasonryItem> {
  items: T[];
  onItemClick?: (item: T) => void;
  isLoading?: boolean;
  emptyHint?: ReactNode;
  showStats?: boolean;
  columns?: { base?: number; sm?: number; md?: number; lg?: number };
  className?: string;
  /** Seleção múltipla. Quando definido, renderiza checkboxes e suprime clique padrão. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Overlay opcional por tile (ex.: menu Master). Renderizado como irmão do botão. */
  renderOverlay?: (item: T) => ReactNode;
}

export function PinterestMasonry<T extends MasonryItem>({
  items,
  onItemClick,
  isLoading,
  emptyHint,
  showStats = true,
  className,
  selectable,
  selectedIds,
  onToggleSelect,
  renderOverlay,
}: PinterestMasonryProps<T>) {
  const safeItems = Array.isArray(items) ? items : [];
  if (isLoading) {
    return (
      <div className={cn("columns-2 sm:columns-3 lg:columns-4 gap-2", className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="mb-2 break-inside-avoid rounded-lg bg-muted/40 animate-pulse"
            style={{ height: 120 + ((i * 37) % 180) }}
          />
        ))}
      </div>
    );
  }

  if (!safeItems.length) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {emptyHint ?? "Nada por aqui ainda."}
      </div>
    );
  }

  const noDownloadStyle: React.CSSProperties = {
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    pointerEvents: "auto",
  } as React.CSSProperties;

  return (
    <div className={cn("columns-2 sm:columns-3 lg:columns-4 gap-2", className)}>
      {safeItems.map((item) => {
        const isVideo = (item.media_type || "").startsWith("video");
        const src =
          item.thumbnail_url || item.preview_url || item.media_url || "";
        const isSelected = !!selectedIds?.has(item.id);
        return (
          <div key={item.id} className="relative mb-2 break-inside-avoid">
            <button
              type="button"
              onClick={() => {
                if (selectable) onToggleSelect?.(item.id);
                else onItemClick?.(item);
              }}
              onContextMenu={(e) => e.preventDefault()}
              className={cn(
                "group relative block w-full overflow-hidden rounded-lg",
                "border border-border/40 bg-muted hover:border-primary/60 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 select-none",
                isSelected && "ring-2 ring-primary border-primary",
              )}
              style={noDownloadStyle}
            >
              {src ? (
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-300 select-none pointer-events-none"
                  style={noDownloadStyle}
                />
              ) : (
                <div className="w-full aspect-square bg-muted" />
              )}

              {selectable && (
                <div
                  className={cn(
                    "absolute top-1.5 left-1.5 h-6 w-6 rounded-md border-2 flex items-center justify-center transition-colors",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-black/55 border-white/80 text-transparent",
                  )}
                >
                  <Check className="h-4 w-4" />
                </div>
              )}

              {isVideo && (
                <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/55 flex items-center justify-center">
                  <Play className="h-3 w-3 text-white fill-white" />
                </div>
              )}

              {showStats && !selectable && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 flex items-center gap-2 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
                  <span className="flex items-center gap-0.5">
                    <Heart className="h-3 w-3" /> {item.likes_count ?? 0}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <MessageCircle className="h-3 w-3" /> {item.comments_count ?? 0}
                  </span>
                  {typeof item.views_count === "number" && (
                    <span className="flex items-center gap-0.5 ml-auto">
                      <Eye className="h-3 w-3" /> {item.views_count}
                    </span>
                  )}
                </div>
              )}
            </button>
            {renderOverlay?.(item)}
          </div>
        );
      })}
    </div>
  );
}
