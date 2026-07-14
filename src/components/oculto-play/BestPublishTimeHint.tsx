/**
 * BestPublishTimeHint — Etapa 22.
 * Widget compacto que sugere os melhores horários para publicar no
 * OCULTO PLAY, com base em views/item das últimas janelas.
 *
 * Uso:
 *   <BestPublishTimeHint kind="short_video" />
 *   <BestPublishTimeHint />  // geral
 */
import { Sparkles, Clock, Info, Loader2 } from 'lucide-react';
import { useOcultoPlayBestSlots } from '@/hooks/useOcultoPlayBestSlots';
import { cn } from '@/lib/utils';

const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Props {
  kind?: string | null;
  days?: number;
  limit?: number;
  className?: string;
  compact?: boolean;
}

export function BestPublishTimeHint({
  kind = null,
  days = 30,
  limit = 3,
  className,
  compact = false,
}: Props) {
  const { data, isLoading } = useOcultoPlayBestSlots({ kind, days, limit });

  return (
    <div
      className={cn(
        'rounded-lg border border-primary/30 bg-primary/5 p-3',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-foreground">
          Melhor horário para publicar
        </p>
        <span className="text-[10px] text-muted-foreground ml-1">
          (últimos {days}d · BR/SP)
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Analisando histórico…
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Ainda não temos histórico suficiente para sugerir um horário
            ideal. Publique normalmente — a sugestão melhora com o tempo.
          </span>
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-2',
            compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3',
          )}
        >
          {data!.map((s, i) => (
            <div
              key={`${s.dow}-${s.hour}`}
              className={cn(
                'rounded-md border bg-card/60 p-2',
                i === 0 && 'border-primary/50 bg-primary/10',
              )}
            >
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary" />
                <span className="text-sm font-semibold tabular-nums">
                  {DOW_LABEL[s.dow]} · {s.hour.toString().padStart(2, '0')}h
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                ~{Math.round(s.views_per_item)} views/item · {s.items_published} pub.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BestPublishTimeHint;
