/**
 * PlayRetentionCard — Etapa 44
 *
 * Card de métricas de retenção para o criador (dono do item).
 * Carrega via RPC `oculto_play_item_retention`. Falha silenciosa se
 * o usuário atual não for o dono.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { BarChart3, Eye, CheckCircle2, Activity } from 'lucide-react';

interface Props {
  itemId: string;
  className?: string;
}

interface Metrics {
  viewers: number;
  total_samples: number;
  avg_watched_pct: number;
  completion_rate: number;
  last_sample_at: string | null;
}

export function PlayRetentionCard({ itemId, className }: Props) {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { data: rows, error } = await supabase.rpc('oculto_play_item_retention', {
          p_item_id: itemId,
        });
        if (!alive) return;
        if (error) {
          if (/forbidden/i.test(error.message)) setAllowed(false);
          setData(null);
        } else {
          const row = Array.isArray(rows) ? rows[0] : rows;
          setData(row ? {
            viewers: Number(row.viewers) || 0,
            total_samples: Number(row.total_samples) || 0,
            avg_watched_pct: Number(row.avg_watched_pct) || 0,
            completion_rate: Number(row.completion_rate) || 0,
            last_sample_at: row.last_sample_at ?? null,
          } : null);
        }
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [itemId]);

  if (!allowed) return null;

  return (
    <div className={`rounded-lg border border-border/60 bg-card/60 p-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-4 w-4 text-fuchsia-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Retenção
        </span>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : !data || data.viewers === 0 ? (
        <div className="text-xs text-muted-foreground">Ainda sem dados de visualização.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Metric icon={<Eye className="h-3.5 w-3.5" />}     label="Viewers"     value={data.viewers.toString()} />
          <Metric icon={<Activity className="h-3.5 w-3.5" />} label="% médio"     value={`${data.avg_watched_pct.toFixed(0)}%`} />
          <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Concluiu" value={`${data.completion_rate.toFixed(0)}%`} />
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-bold text-foreground mt-0.5">{value}</div>
    </div>
  );
}
