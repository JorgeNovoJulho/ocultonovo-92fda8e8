/**
 * PostCardSkeleton — placeholder leve enquanto um RealPostCard carrega.
 *
 * Mantém a mesma estrutura visual (avatar + linha do username + linha de tags
 * + bloco de mídia + barra de ações) para que o layout não "pule" quando o
 * post real renderiza. Puro CSS, sem animação pesada além de `animate-pulse`.
 */
import { cn } from "@/lib/utils";

interface PostCardSkeletonProps {
  /** Tipo visual do bloco de mídia simulado. Padrão `image`. */
  mediaShape?: "image" | "video" | "text";
  className?: string;
}

const Bar = ({ className = "" }: { className?: string }) => (
  <div className={cn("bg-muted rounded", className)} />
);

export function PostCardSkeleton({
  mediaShape = "image",
  className,
}: PostCardSkeletonProps) {
  return (
    <article
      aria-hidden="true"
      className={cn(
        "gradient-border rounded-xl overflow-hidden animate-pulse",
        className,
      )}
    >
      <div className="p-4 bg-card">
        {/* Header: avatar + (username row) */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Bar className="h-3 w-1/3" />
              <div className="flex-1" />
              <Bar className="h-3 w-12" />
              <Bar className="h-6 w-6 rounded-full" />
            </div>
            <div className="flex items-center gap-1.5">
              <Bar className="h-5 w-12 rounded-full" />
              <Bar className="h-5 w-16 rounded-full" />
              <Bar className="h-5 w-10 rounded-full" />
              <Bar className="h-5 w-14 rounded-full" />
            </div>
          </div>
        </div>

        {/* Content */}
        {mediaShape !== "text" && (
          <div
            className={cn(
              "w-full bg-muted rounded-lg",
              mediaShape === "video" ? "aspect-video" : "aspect-square",
            )}
          />
        )}
        {mediaShape === "text" && (
          <div className="space-y-2 py-2">
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-5/6" />
            <Bar className="h-3 w-2/3" />
          </div>
        )}

        {/* Actions bar */}
        <div className="mt-4 flex items-center gap-4">
          <Bar className="h-5 w-12" />
          <Bar className="h-5 w-12" />
          <Bar className="h-5 w-12" />
          <div className="flex-1" />
          <Bar className="h-5 w-8" />
        </div>
      </div>
    </article>
  );
}

export default PostCardSkeleton;
