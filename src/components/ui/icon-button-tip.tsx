/**
 * IconButtonTip — Wrapper para envolver botões de ícone com Tooltip.
 * Uso:
 *   <IconButtonTip label="Curtir"><Button size="icon">...</Button></IconButtonTip>
 *
 * Requer que <TooltipProvider> esteja montado no root (já está em App.tsx via shadcn).
 */
import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconButtonTipProps {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactElement;
  delayMs?: number;
}

export function IconButtonTip({ label, side = "top", children }: IconButtonTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        collisionPadding={12}
        avoidCollisions
        className="text-xs max-w-[min(260px,calc(100vw-24px))] whitespace-normal break-words leading-snug text-center"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
