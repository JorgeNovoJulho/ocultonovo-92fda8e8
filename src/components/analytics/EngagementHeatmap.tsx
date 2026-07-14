import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEngagementHeatmap } from '@/hooks/useAdvancedAnalytics';
import { cn } from '@/lib/utils';

interface EngagementHeatmapProps {
  eventType?: string;
  title?: string;
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function EngagementHeatmap({ eventType, title = 'Mapa de Calor de Engajamento' }: EngagementHeatmapProps) {
  const { data: heatmapData, isLoading } = useEngagementHeatmap(eventType);

  // Processar dados para matriz
  const matrix = useMemo(() => {
    if (!heatmapData) return null;

    // Criar matriz 7x24 (dias x horas)
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxValue = 0;

    heatmapData.forEach((item) => {
      if (item.day_of_week !== null && item.hour_of_day !== null) {
        grid[item.day_of_week][item.hour_of_day] += item.event_count;
        maxValue = Math.max(maxValue, grid[item.day_of_week][item.hour_of_day]);
      }
    });

    return { grid, maxValue };
  }, [heatmapData]);

  const getColor = (value: number, maxValue: number): string => {
    if (maxValue === 0 || value === 0) return 'bg-muted';
    
    const intensity = value / maxValue;
    
    if (intensity > 0.8) return 'bg-primary';
    if (intensity > 0.6) return 'bg-primary/80';
    if (intensity > 0.4) return 'bg-primary/60';
    if (intensity > 0.2) return 'bg-primary/40';
    return 'bg-primary/20';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!matrix) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          Sem dados suficientes para exibir o heatmap
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Header com horas */}
            <div className="flex mb-1">
              <div className="w-10 shrink-0" />
              {HOURS.filter((_, i) => i % 3 === 0).map((hour) => (
                <div
                  key={hour}
                  className="flex-1 text-center text-xs text-muted-foreground"
                  style={{ minWidth: '40px' }}
                >
                  {hour}h
                </div>
              ))}
            </div>

            {/* Grid */}
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="flex items-center gap-0.5 mb-0.5">
                <div className="w-10 text-xs text-muted-foreground shrink-0">
                  {day}
                </div>
                {HOURS.map((hour) => (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className={cn(
                      'h-5 flex-1 rounded-sm transition-colors cursor-pointer hover:ring-1 hover:ring-foreground/30',
                      getColor(matrix.grid[dayIndex][hour], matrix.maxValue)
                    )}
                    title={`${day} ${hour}h: ${matrix.grid[dayIndex][hour]} eventos`}
                  />
                ))}
              </div>
            ))}

            {/* Legenda */}
            <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
              <span>Menos</span>
              <div className="flex gap-0.5">
                <div className="w-4 h-4 rounded-sm bg-muted" />
                <div className="w-4 h-4 rounded-sm bg-primary/20" />
                <div className="w-4 h-4 rounded-sm bg-primary/40" />
                <div className="w-4 h-4 rounded-sm bg-primary/60" />
                <div className="w-4 h-4 rounded-sm bg-primary/80" />
                <div className="w-4 h-4 rounded-sm bg-primary" />
              </div>
              <span>Mais</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
