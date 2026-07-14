import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";
import { useLookingNow } from "@/hooks/useLookingNow";
import { cn } from "@/lib/utils";

interface LookingNowToggleProps {
  variant?: "button" | "compact";
  className?: string;
}

export function LookingNowToggle({ variant = "button", className }: LookingNowToggleProps) {
  const { isLookingNow, isUpdating, toggle } = useLookingNow();

  if (variant === "compact") {
    return (
      <button
        onClick={toggle}
        disabled={isUpdating}
        className={cn(
          "relative flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-300",
          isLookingNow
            ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.5)]"
            : "bg-muted/50 text-muted-foreground hover:bg-muted",
          isUpdating && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        <Flame className={cn(
          "h-4 w-4 transition-all",
          isLookingNow && "animate-pulse text-yellow-200"
        )} />
        <span className="text-sm font-medium">
          {isLookingNow ? "Buscando" : "Buscar"}
        </span>
        {isLookingNow && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
          </span>
        )}
      </button>
    );
  }

  return (
    <Button
      onClick={toggle}
      disabled={isUpdating}
      variant={isLookingNow ? "default" : "outline"}
      className={cn(
        "relative transition-all duration-300",
        isLookingNow
          ? "bg-gradient-to-r from-orange-500 to-red-500 border-0 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)]"
          : "border-border/50 hover:border-orange-500/50 hover:text-orange-500",
        className
      )}
    >
      <Flame className={cn(
        "h-4 w-4 mr-2",
        isLookingNow && "animate-pulse text-yellow-200"
      )} />
      {isLookingNow ? "🔥 Buscando Agora" : "Buscar Agora"}
      {isLookingNow && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
        </span>
      )}
    </Button>
  );
}
