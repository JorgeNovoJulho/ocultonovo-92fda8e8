/**
 * MaintenanceBanner — banner global exibido quando platform_mode === 'maintenance'.
 * Não bloqueia a UI; apenas avisa. Guards reais ficam nos edge functions.
 */
import { usePlatformPhase } from '@/hooks/usePlatformPhase';
import { Wrench } from 'lucide-react';

export function MaintenanceBanner() {
  const { isMaintenance } = usePlatformPhase();
  if (!isMaintenance) return null;
  return (
    <div className="w-full bg-destructive/15 border-b border-destructive/30 text-destructive-foreground">
      <div className="container mx-auto px-4 py-2 flex items-center gap-2 text-sm">
        <Wrench className="h-4 w-4 shrink-0" />
        <span className="font-medium">Plataforma em manutenção.</span>
        <span className="opacity-80 hidden sm:inline">
          Cobranças, saques e ações críticas estão temporariamente pausadas.
        </span>
      </div>
    </div>
  );
}
