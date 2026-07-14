import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

interface UserStatusBadgeProps {
  planType?: string | null;
  isOcultoVerified?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function UserStatusBadge({
  planType,
  isOcultoVerified = false,
  size = 'sm',
  showLabel = true,
  className,
}: UserStatusBadgeProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const badgeSizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-0.5',
    md: 'text-xs px-2 py-0.5 gap-1',
    lg: 'text-sm px-2.5 py-1 gap-1.5',
  };

  const iconClass = sizeClasses[size];
  const badgeClass = badgeSizeClasses[size];

  // Selo Oculto: badge exclusivo da plataforma OcultoSwing (prioridade máxima)
  if (isOcultoVerified) {
    return (
      <span
        className={cn(
          "inline-flex items-center font-bold rounded-full",
          "bg-gradient-to-r from-primary/80 via-primary to-secondary/80",
          "text-primary-foreground border border-primary/40",
          "shadow-[0_0_10px_hsl(var(--primary)/0.5)]",
          badgeClass,
          className
        )}
      >
        {/* Ícone "O" circular — símbolo OcultoSwing */}
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.2"/>
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
        </svg>
        {showLabel && <span>Oculto</span>}
      </span>
    );
  }

  // Plano Gratuito: badge vermelho com texto branco (visível em todo o sistema)
  if (!planType || planType === 'free') {
    return (
      <span
        className={cn(
          "inline-flex items-center font-semibold rounded-full whitespace-nowrap",
          "bg-[hsl(0,84%,55%)] text-white border border-[hsl(0,84%,45%)]",
          badgeClass,
          className
        )}
      >
        {showLabel && <span>Gratuito</span>}
      </span>
    );
  }

  if (planType === 'vip') {
    return (
      <span
        className={cn(
          "inline-flex items-center font-semibold rounded-full",
          "bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)]",
          "text-[hsl(45,93%,10%)]",
          "animate-glow-pulse-gold",
          badgeClass,
          className
        )}
      >
        <Crown className={iconClass} />
        {showLabel && <span>VIP</span>}
      </span>
    );
  }

  if (planType === 'premium') {
    return (
      <span
        className={cn(
          "inline-flex items-center font-semibold rounded-full",
          "bg-primary text-primary-foreground",
          "animate-glow-pulse-pink",
          badgeClass,
          className
        )}
      >
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.15"/>
        </svg>
        {showLabel && <span>PRO</span>}
      </span>
    );
  }

  return null;
}
