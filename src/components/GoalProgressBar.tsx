import { Button } from "@/components/ui/button";
import { Heart, Target, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface GoalProgressBarProps {
  title: string;
  currentAmount: number;
  targetAmount: number;
  onContribute?: () => void;
  showContributeButton?: boolean;
  className?: string;
  /** Se true, mostra em créditos. Se false, mostra em R$ */
  useCredits?: boolean;
}

export function GoalProgressBar({
  title,
  currentAmount,
  targetAmount,
  onContribute,
  showContributeButton = true,
  className,
  useCredits = true,
}: GoalProgressBarProps) {
  const progress = Math.min((currentAmount / targetAmount) * 100, 100);
  const remaining = Math.max(targetAmount - currentAmount, 0);

  // Formatar valor (créditos ou moeda)
  const formatValue = (value: number) => {
    if (useCredits) {
      return `${value.toLocaleString('pt-BR')} créditos`;
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Goal Title */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {Math.round(progress)}% concluído
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          {/* Background */}
          <div className="h-3 rounded-full bg-muted/50 border border-border/30 overflow-hidden">
            {/* Gradient Fill */}
            <div 
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ 
                width: `${progress}%`,
                background: 'linear-gradient(90deg, hsl(330, 80%, 50%) 0%, hsl(330, 90%, 60%) 50%, hsl(340, 85%, 55%) 100%)',
                boxShadow: progress > 0 ? '0 0 12px hsl(330, 80%, 50%, 0.5)' : 'none',
              }}
            />
          </div>
          
          {/* Amount Labels */}
          <div className="flex justify-between mt-1.5">
            <span className="text-xs font-medium text-primary flex items-center gap-1">
              {useCredits && <Coins className="h-3 w-3 text-[hsl(45,93%,47%)]" />}
              {formatValue(currentAmount)}
            </span>
            <span className="text-xs text-muted-foreground">
              Faltam {formatValue(remaining)}
            </span>
          </div>
        </div>

        {/* Contribute Button */}
        {showContributeButton && onContribute && (
          <Button
            size="sm"
            onClick={onContribute}
            className="shrink-0 bg-gradient-to-r from-primary to-[hsl(330,80%,60%)] hover:opacity-90 text-white font-semibold gap-1.5 px-4"
          >
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">Contribuir</span>
          </Button>
        )}
      </div>
    </div>
  );
}
