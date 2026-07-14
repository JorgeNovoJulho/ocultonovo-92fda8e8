import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Mostra quanto falta para o reset diário das missões e do streak.
 * Reset acontece às 00:00 no fuso America/Sao_Paulo.
 */
function msUntilSpMidnight(): number {
  const now = new Date();
  // Hora atual em São Paulo via Intl
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const h = parseInt(parts.hour, 10);
  const m = parseInt(parts.minute, 10);
  const s = parseInt(parts.second, 10);
  const elapsed = ((h * 60) + m) * 60 + s;
  const remaining = 24 * 3600 - elapsed;
  return remaining * 1000;
}

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function AuraResetTimer({ compact = false }: { compact?: boolean }) {
  const [ms, setMs] = useState(() => msUntilSpMidnight());

  useEffect(() => {
    const i = setInterval(() => setMs(msUntilSpMidnight()), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-200/90">
            <Clock className="h-3 w-3" />
            {compact ? format(ms) : <>Reset em <strong className="font-semibold">{format(ms)}</strong></>}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-[11px] leading-snug">
          As missões diárias e o check-in do streak resetam todos os dias à
          <strong> meia-noite (00:00) no fuso America/São Paulo</strong>.
          Faltam <strong>{format(ms)}</strong> para o próximo reset.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
