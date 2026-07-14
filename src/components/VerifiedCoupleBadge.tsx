import { cn } from "@/lib/utils";

interface VerifiedCoupleBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
}

/**
 * Verified Couple Badge - Two intertwined hearts with golden/pink gradient
 * Used throughout the app to indicate verified couples
 */
export function VerifiedCoupleBadge({ 
  size = 'md', 
  className,
  showLabel = false 
}: VerifiedCoupleBadgeProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const labelSizeClasses = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Intertwined Hearts Icon */}
      <div className={cn("relative", sizeClasses[size])}>
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="coupleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(45, 93%, 47%)" />
              <stop offset="50%" stopColor="hsl(330, 80%, 55%)" />
              <stop offset="100%" stopColor="hsl(45, 93%, 47%)" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* First Heart - slightly offset left */}
          <path 
            d="M8 5C5.5 5 3.5 7 3.5 9.5C3.5 14 8 17 10 19C10.5 18.5 11.5 17.5 12 17"
            stroke="url(#coupleGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            filter="url(#glow)"
          />
          
          {/* Second Heart - slightly offset right */}
          <path 
            d="M16 5C18.5 5 20.5 7 20.5 9.5C20.5 14 16 17 14 19C13.5 18.5 12.5 17.5 12 17"
            stroke="url(#coupleGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            filter="url(#glow)"
          />
          
          {/* Connecting center with shield accent */}
          <path 
            d="M12 17L12 20M12 8V10"
            stroke="url(#coupleGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#glow)"
          />
          
          {/* Small checkmark in center */}
          <path 
            d="M10 12L11.5 13.5L14 10.5"
            stroke="url(#coupleGradient)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#glow)"
          />
        </svg>
      </div>
      
      {showLabel && (
        <span className={cn(
          "font-semibold bg-gradient-to-r from-[hsl(45,93%,47%)] via-[hsl(330,80%,55%)] to-[hsl(45,93%,47%)] bg-clip-text text-transparent",
          labelSizeClasses[size]
        )}>
          Casal Verificado
        </span>
      )}
    </div>
  );
}

/**
 * Avatar wrapper with verified couple gradient border
 */
interface VerifiedCoupleAvatarProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isVerifiedCouple?: boolean;
  isOnline?: boolean;
  className?: string;
}

export function VerifiedCoupleAvatar({
  src,
  alt,
  size = 'md',
  isVerifiedCouple = false,
  isOnline = false,
  className,
}: VerifiedCoupleAvatarProps) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20',
  };

  const borderWidth = {
    sm: 'p-[2px]',
    md: 'p-[2px]',
    lg: 'p-[3px]',
    xl: 'p-[3px]',
  };

  const innerBorder = {
    sm: 'p-[1px]',
    md: 'p-[2px]',
    lg: 'p-[2px]',
    xl: 'p-[2px]',
  };

  const onlineIndicatorSize = {
    sm: 'w-2.5 h-2.5 border-2',
    md: 'w-3 h-3 border-2',
    lg: 'w-4 h-4 border-[3px]',
    xl: 'w-5 h-5 border-4',
  };

  const badgePosition = {
    sm: '-bottom-0.5 -right-0.5',
    md: '-bottom-0.5 -right-0.5',
    lg: '-bottom-1 -right-1',
    xl: '-bottom-1 -right-1',
  };

  const badgeSize = {
    sm: 'sm' as const,
    md: 'sm' as const,
    lg: 'md' as const,
    xl: 'md' as const,
  };

  // Gradient for verified couples: golden to pink
  const gradientClass = isVerifiedCouple
    ? 'bg-gradient-to-tr from-[hsl(45,93%,47%)] via-[hsl(330,80%,55%)] to-[hsl(45,93%,47%)]'
    : 'bg-gradient-to-tr from-primary via-secondary to-primary';

  // Add subtle glow animation for verified couples
  const glowClass = isVerifiedCouple
    ? 'shadow-[0_0_15px_rgba(255,0,127,0.3)]'
    : '';

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <div className={cn(
        "w-full h-full rounded-full",
        borderWidth[size],
        gradientClass,
        glowClass,
        isVerifiedCouple && "animate-pulse-subtle"
      )}>
        <div className={cn(
          "w-full h-full rounded-full bg-background",
          innerBorder[size]
        )}>
          <img
            src={src}
            alt={alt}
            className="w-full h-full rounded-full object-cover object-center"
            style={{ objectPosition: '50% 30%' }}
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>

      {/* Online/Offline indicator — verde quando online, vermelho quando offline */}
      <div
        className={cn(
          "absolute bottom-0 right-0 rounded-full border-background",
          onlineIndicatorSize[size],
          isOnline ? "bg-[hsl(142,76%,46%)]" : "bg-[hsl(0,84%,60%)]"
        )}
        aria-label={isOnline ? "Online" : "Offline"}
      />

      {/* Verified couple badge */}
      {isVerifiedCouple && (
        <div className={cn(
          "absolute bg-background rounded-full p-0.5",
          badgePosition[size]
        )}>
          <VerifiedCoupleBadge size={badgeSize[size]} />
        </div>
      )}
    </div>
  );
}
