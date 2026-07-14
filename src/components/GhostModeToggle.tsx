import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGhostModeStatus, useToggleGhostActive } from "@/hooks/useGhostMode";
import { cn } from "@/lib/utils";

interface GhostModeToggleProps {
  className?: string;
  size?: "sm" | "default";
}

export function GhostModeToggle({ className, size = "default" }: GhostModeToggleProps) {
  const { data: status, isLoading } = useGhostModeStatus();
  const toggleGhost = useToggleGhostActive();

  // Não mostrar se o usuário não tem o add-on
  if (!status?.hasGhostMode || isLoading) {
    return null;
  }

  const handleToggle = () => {
    toggleGhost.mutate(!status.isGhostActive);
  };

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const buttonSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          disabled={toggleGhost.isPending}
          className={cn(
            buttonSize,
            "relative transition-all duration-300",
            status.isGhostActive && "bg-[#FF007F]/10",
            className
          )}
        >
          <Ghost
            className={cn(
              iconSize,
              "transition-all duration-300",
              status.isGhostActive
                ? "text-[#FF007F] drop-shadow-[0_0_8px_rgba(255,0,127,0.5)]"
                : "text-muted-foreground"
            )}
          />
          {/* Indicador de ativo */}
          {status.isGhostActive && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#FF007F] animate-pulse" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-sm">
          Modo Fantasma: {status.isGhostActive ? "Ativo" : "Inativo"}
        </p>
        <p className="text-xs text-muted-foreground">
          {status.isGhostActive
            ? "Você está invisível"
            : "Clique para ativar"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

// Badge pequeno para exibir no perfil do usuário
export function GhostModeBadge({ className }: { className?: string }) {
  const { data: status } = useGhostModeStatus();

  if (!status?.hasGhostMode) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center justify-center",
            className
          )}
        >
          <Ghost
            className={cn(
              "h-4 w-4",
              status.isGhostActive
                ? "text-[#FF007F] drop-shadow-[0_0_6px_rgba(255,0,127,0.5)]"
                : "text-muted-foreground/50"
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {status.isGhostActive ? "Modo Fantasma Ativo" : "Possui Modo Fantasma"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
