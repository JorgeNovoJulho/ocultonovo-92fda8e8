import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export const Logo = forwardRef<HTMLDivElement, LogoProps>(
  ({ className, showText = true }, ref) => {
    return (
      <div ref={ref} className={cn("flex items-center gap-3", className)}>
        {/* Eclipse/Mask Icon */}
        <div className="relative w-10 h-10">
          {/* Outer glow */}
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-md animate-pulse-glow" />
          
          {/* Main circle with eclipse effect */}
          <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary via-primary to-secondary overflow-hidden">
            {/* Shadow/mask creating eclipse effect */}
            <div className="absolute -right-2 -top-2 w-10 h-10 rounded-full bg-background" />
            {/* Inner highlight */}
            <div className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-primary-foreground/30" />
          </div>
        </div>
        
        {/* Brand name with BETA tag */}
        {showText && (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-[0.2em] text-foreground uppercase">
              OCULTO
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-gradient-to-r from-primary to-secondary text-primary-foreground rounded uppercase animate-pulse">
              BETA
            </span>
          </div>
        )}
      </div>
    );
  }
);
Logo.displayName = "Logo";
