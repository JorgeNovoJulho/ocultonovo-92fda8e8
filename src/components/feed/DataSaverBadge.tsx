import { Zap } from "lucide-react";
import { usePerformance } from "@/contexts/PerformanceContext";
import { cn } from "@/lib/utils";

/**
 * Badge discreto exibido no topo do feed quando o "Modo Economia" está ativo.
 * Sinaliza ao usuário que otimizações automáticas (imagens em qualidade
 * reduzida, carrosséis ocultos, blurs/sombras desligados) estão aplicadas.
 *
 * Auto-ativado por: hardware fraco (RAM<4GB), FPS baixo sustentado,
 * ou conexão lenta (saveData / 2g).
 */
export function DataSaverBadge({ className }: { className?: string }) {
  const { profile, autoDowngraded } = usePerformance();
  if (!profile.dataSaver) return null;

  return (
    <div className={cn("px-4 pt-2", className)}>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
          "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400",
          "text-[11px] font-semibold leading-none"
        )}
        title={
          autoDowngraded
            ? "Ativado automaticamente para melhor desempenho"
            : "Modo Economia ativo"
        }
      >
        <Zap className="h-3 w-3" aria-hidden="true" />
        <span>Modo Economia</span>
        {autoDowngraded && (
          <span className="opacity-70 font-normal">· auto</span>
        )}
      </div>
    </div>
  );
}
