/**
 * Borda dourada animada para avatares VIP
 * Usa CSS puro para não consumir GPU
 */
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface VipAvatarBorderProps {
  isVip: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  className?: string;
}

export function VipAvatarBorder({ isVip, size = 'md', children, className }: VipAvatarBorderProps) {
  if (!isVip) return <>{children}</>;

  const sizeClasses = {
    sm: 'p-[2px]',
    md: 'p-[2.5px]',
    lg: 'p-[3px]',
  };

  return (
    <div
      className={cn(
        "rounded-full vip-avatar-border",
        sizeClasses[size],
        className
      )}
      style={{
        background: 'linear-gradient(135deg, hsl(45,93%,47%), hsl(35,80%,55%), hsl(45,93%,47%), hsl(25,90%,50%))',
        backgroundSize: '300% 300%',
        animation: 'vip-border-rotate 3s ease infinite',
      }}
    >
      {children}
    </div>
  );
}
