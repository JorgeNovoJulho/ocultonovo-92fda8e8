import { Crown, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SuperMatchBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SuperMatchBadge({ size = 'md', className }: SuperMatchBadgeProps) {
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-3 py-1',
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  return (
    <Badge 
      className={cn(
        "bg-gradient-to-r from-yellow-500 via-amber-400 to-orange-500 text-black font-bold border-none shadow-lg shadow-yellow-500/25 animate-pulse",
        sizeClasses[size],
        className
      )}
    >
      <Crown className={cn(iconSizes[size], "mr-1")} />
      <Sparkles className={cn(iconSizes[size], "mr-1")} />
      Super Match
    </Badge>
  );
}
