import { useSmartOnlineCounter } from '@/hooks/useSmartOnlineCounter';
import { cn } from '@/lib/utils';

interface OnlineUsersCounterProps {
  className?: string;
}

export function OnlineUsersCounter({ className }: OnlineUsersCounterProps) {
  const { count, isLoading } = useSmartOnlineCounter();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="h-3 w-3 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-20 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full",
      "bg-green-500/10 border border-green-500/30",
      "backdrop-blur-sm",
      "shadow-[0_0_20px_rgba(34,197,94,0.15)]",
      className
    )}>
      {/* Indicador estático */}
      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
      
      {/* Contador estático */}
      <span className="font-bold text-green-400 tabular-nums text-lg">
        {count.toLocaleString('pt-BR')}
      </span>
      
      <span className="text-green-300/80 text-sm font-medium">
        online agora
      </span>
    </div>
  );
}
