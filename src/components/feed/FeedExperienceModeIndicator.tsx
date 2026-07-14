import { useFeedExperienceMode } from "@/hooks/useFeedExperienceMode";
import { cn } from "@/lib/utils";

interface FeedExperienceModeIndicatorProps {
  onOpenSelector?: () => void;
  className?: string;
}

/**
 * Indicador DISCRETO do modo de conteúdo ativo do feed.
 *
 * Renderizado como um pequeno ponto (dot) posicionado sobre o botão
 * "Conteúdo" (Flame) no canto superior do feed — preserva o alinhamento
 * dos botões e mantém a estética limpa.
 *
 * Cor:
 *  - âmbar  → "Apenas +18"
 *  - fúcsia → "Experiência completa"
 */
export function FeedExperienceModeIndicator({
  onOpenSelector,
  className,
}: FeedExperienceModeIndicatorProps) {
  const { isAdultOnly } = useFeedExperienceMode();
  const label = isAdultOnly ? "Apenas +18" : "Experiência completa";

  return (
    <span
      role={onOpenSelector ? "button" : undefined}
      onClick={onOpenSelector}
      aria-label={`Modo de conteúdo ativo: ${label}. Toque para alterar.`}
      title={`Modo ativo: ${label}`}
      className={cn(
        "pointer-events-none absolute -top-1 -right-1 z-10 flex h-3 w-3 items-center justify-center",
        onOpenSelector && "pointer-events-auto cursor-pointer",
        className
      )}
    >
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping",
          isAdultOnly ? "bg-amber-400" : "bg-fuchsia-400"
        )}
      />
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-background",
          isAdultOnly ? "bg-amber-500" : "bg-fuchsia-500"
        )}
      />
    </span>
  );
}
