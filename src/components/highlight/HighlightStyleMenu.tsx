import { MoreVertical, Sparkles, Crown, Zap, ZapOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useHighlightGlow } from "@/hooks/useHighlightGlow";
import { usePerformance } from "@/contexts/PerformanceContext";

/**
 * Menu de 3 pontinhos exibido apenas no card do próprio usuário,
 * quando a moldura de Destaque está ativa. Permite alternar:
 *  - estilo do brilho (dourado pulsante / RGB rotativo)
 *  - reduzir animações (desliga RGB e pulsos globalmente)
 */
export function HighlightStyleMenu({ className = "" }: { className?: string }) {
  const { style, setStyle } = useHighlightGlow();
  const { profile, updateSetting } = usePerformance();
  const reduce = !profile.showAnimations;

  const stop = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`absolute top-2 right-2 z-20 ${className}`}
      onClick={stop}
      onPointerDown={stop}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Opções do destaque"
          className="h-7 w-7 inline-flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-sm text-amber-300 border border-amber-400/40 shadow-md transition-colors"
          onClick={stop}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onClick={stop}
        >
          <DropdownMenuLabel className="text-xs flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-amber-400" />
            Moldura de destaque
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={style === "rgb" && !reduce}
            onCheckedChange={(checked) => setStyle(checked ? "rgb" : "gold")}
            disabled={reduce}
            className="text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2 text-fuchsia-400" />
            RGB rotativo ao redor
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem
            onClick={() => setStyle("gold")}
            className="text-xs"
          >
            <Crown className="h-3.5 w-3.5 mr-2 text-amber-400" />
            Apenas dourado pulsante
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => updateSetting("showAnimations", reduce ? true : false)}
            className="text-xs"
          >
            {reduce ? (
              <Zap className="h-3.5 w-3.5 mr-2 text-emerald-400" />
            ) : (
              <ZapOff className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            )}
            {reduce ? "Reativar animações" : "Reduzir animações"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
