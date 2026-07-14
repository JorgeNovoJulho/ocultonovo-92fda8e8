/**
 * BetaPublicBanner — faixa global "Beta Público Ativo" para landing/topo.
 */
import { Sparkles } from 'lucide-react';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';

export function BetaPublicBanner() {
  const { isBeta } = usePlatformPhase();
  if (!isBeta) return null;
  return (
    <div className="w-full bg-gradient-to-r from-primary/15 via-primary/10 to-secondary/15 border-b border-primary/20 text-xs md:text-sm">
      <div className="container mx-auto px-3 py-1.5 sm:py-2 flex items-center justify-center gap-2 text-center leading-tight">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-foreground">
          <strong>Beta Público Ativo</strong>
          <span className="sm:hidden"> · Early access</span>
          <span className="hidden sm:inline"> · Early access · funções Premium liberadas temporariamente · monetização em breve</span>
        </span>
      </div>
    </div>
  );
}
