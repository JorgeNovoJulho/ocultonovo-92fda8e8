import { useAuraStreak } from '@/hooks/useAuraStreak';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flame, Loader2, Snowflake, Info, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AuraResetTimer } from './AuraResetTimer';

export function AuraStreakCard() {
  const { status, loading, claiming, checkIn } = useAuraStreak();
  const streak = status?.current_streak ?? 0;
  const longest = status?.longest_streak ?? 0;
  const can = !!status?.can_check_in_today;
  const xpPreview = status?.today_xp_preview ?? 10;
  const freezes = status?.freezes_left ?? 0;

  return (
    <section
      className={cn(
        'rounded-2xl border p-3 transition-colors',
        streak > 0
          ? 'border-orange-400/30 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent'
          : 'border-white/5 bg-white/[0.02]'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            streak > 0 ? 'bg-orange-500/25 text-orange-200' : 'bg-white/5 text-orange-300'
          )}
        >
          <Flame className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-bold">Streak diário</h2>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="O que é o streak diário?"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-[11px] leading-snug">
                  Faça check-in todo dia para manter sua chama acesa. Cada dia
                  consecutivo aumenta seu streak e o XP ganho. Se faltar um dia,
                  o streak zera — use um <span className="text-cyan-300">freeze</span> para
                  proteger contra um dia perdido.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="outline" className="text-[10px]">
              {streak} dia{streak === 1 ? '' : 's'}
            </Badge>
            {longest > streak && (
              <span className="text-[10px] text-muted-foreground">recorde {longest}</span>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Como funciona o freeze?"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] transition-colors',
                    freezes > 0
                      ? 'bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                      : 'bg-white/5 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Snowflake className="h-2.5 w-2.5" />
                  {freezes} freeze
                  <ShieldQuestion className="h-2.5 w-2.5 opacity-70" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-[280px] text-[12px] leading-snug space-y-2">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Snowflake className="h-3.5 w-3.5 text-cyan-300" /> Como funciona o Freeze
                </p>
                <p className="text-muted-foreground">
                  Se você esquecer de fazer check-in em um dia, um <strong className="text-cyan-200">freeze</strong> é
                  consumido automaticamente para preservar sua sequência. Sem freeze disponível,
                  o streak zera no dia seguinte.
                </p>
                <ul className="text-muted-foreground space-y-1 pl-3 list-disc">
                  <li>Você ganha freezes ao manter o streak por várias semanas.</li>
                  <li>Cada falta consome 1 freeze (no máximo 1 por semana).</li>
                  <li>Saldo atual: <strong className="text-cyan-200">{freezes}</strong> freeze{freezes === 1 ? '' : 's'}.</li>
                </ul>
                <div className="pt-1 border-t border-border/40">
                  <AuraResetTimer />
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {can
              ? `Faça o check-in de hoje e ganhe +${xpPreview} XP. Volte amanhã para somar +1 dia.`
              : 'Streak garantido hoje ✓ Volte amanhã para não perder a sequência.'}
          </p>
        </div>

        <Button
          size="sm"
          disabled={loading || claiming || !can}
          onClick={checkIn}
          className={cn(
            'shrink-0 gap-1',
            can
              ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white hover:opacity-95'
              : 'bg-white/5 text-muted-foreground'
          )}
        >
          {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
          {can ? 'Check-in' : 'Feito'}
        </Button>
      </div>
    </section>
  );
}
