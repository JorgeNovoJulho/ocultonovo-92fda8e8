import { useState } from "react";
import { useTrustScore } from "@/hooks/useTrustScore";
import { Shield, TrendingUp, AlertTriangle, CheckCircle2, Info, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrustScoreTipsModal } from "@/components/TrustScoreTipsModal";

interface TrustScoreCardProps {
  userId?: string;
  variant?: "full" | "compact" | "minimal";
  showBreakdown?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-[hsl(142,76%,46%)]";
  if (score >= 60) return "text-[hsl(45,93%,47%)]";
  if (score >= 40) return "text-[hsl(35,93%,47%)]";
  return "text-destructive";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bom";
  if (score >= 40) return "Regular";
  return "Baixo";
}

function getScoreIcon(score: number) {
  if (score >= 80) return <CheckCircle2 className="h-4 w-4" />;
  if (score >= 60) return <TrendingUp className="h-4 w-4" />;
  if (score >= 40) return <Info className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

export function TrustScoreCard({ userId, variant = "compact", showBreakdown = false }: TrustScoreCardProps) {
  const { data: trustScore, isLoading } = useTrustScore(userId);
  const [tipsOpen, setTipsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="animate-pulse bg-muted rounded-lg h-12 w-24" />
    );
  }

  const score = trustScore?.score || 0;
  const colorClass = getScoreColor(score);

  if (variant === "minimal") {
    return (
      <>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setTipsOpen(true)}
                className={cn("flex items-center gap-1 hover:opacity-80 transition-opacity", colorClass)}
              >
                <Shield className="h-4 w-4" />
                <span className="font-semibold text-sm">{score}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Score de Confiança: {getScoreLabel(score)} — clique para dicas</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TrustScoreTipsModal open={tipsOpen} onClose={() => setTipsOpen(false)} userId={userId} />
      </>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/50 border border-border/30">
        <Shield className={cn("h-5 w-5", colorClass)} />
        <div className="flex flex-col">
          <span className={cn("font-bold text-lg leading-none", colorClass)}>{score}</span>
          <span className="text-xs text-muted-foreground">Confiança</span>
        </div>
        <div className={cn("ml-1", colorClass)}>
          {getScoreIcon(score)}
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div
      className="p-4 rounded-xl bg-card/50 border border-border/30 space-y-3 transition-all duration-300"
      style={{
        boxShadow: score >= 80
          ? '0 0 24px -8px hsl(142 76% 46% / 0.45)'
          : score >= 60
            ? '0 0 18px -8px hsl(210 90% 55% / 0.35)'
            : score >= 40
              ? '0 0 14px -8px hsl(45 93% 47% / 0.3)'
              : '0 0 10px -8px hsl(0 80% 55% / 0.25)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className={cn("h-6 w-6", colorClass)} />
          <span className="font-semibold">Score de Confiança</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1", colorClass)}>
            <span className="font-bold text-2xl">{score}</span>
            <span className="text-sm">/100</span>
          </div>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
            onClick={() => setTipsOpen(true)}>
            <HelpCircle className="h-3.5 w-3.5 mr-1" /> Como aumentar?
          </Button>
        </div>
      </div>

      <Progress value={score} className="h-2" />

      <div className="flex items-center justify-between text-sm">
        <span className={cn("font-medium", colorClass)}>{getScoreLabel(score)}</span>
        <span className="text-muted-foreground flex items-center gap-1">
          {getScoreIcon(score)}
          {score >= 80 && "Membro verificado"}
          {score >= 60 && score < 80 && "Membro ativo"}
          {score >= 40 && score < 60 && "Membro recente"}
          {score < 40 && "Construindo confiança"}
        </span>
      </div>

      <TrustScoreTipsModal open={tipsOpen} onClose={() => setTipsOpen(false)} userId={userId} />
    </div>
  );
}
