import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, AlertTriangle, Clock, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OpsStatus {
  last_event_at: string | null;
  last_processed_at: string | null;
  events_24h: number;
  processed_24h: number;
  duplicated_24h: number;
  failed_24h: number;
  ignored_24h: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  health: "healthy" | "unhealthy" | "stale";
}

interface EventTypeRow {
  event_type: string | null;
  total: number;
  processed: number;
  failed: number;
  duplicated: number;
  last_at: string | null;
}

const HEALTH_STYLES: Record<string, string> = {
  healthy: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  unhealthy: "bg-destructive/15 text-destructive border-destructive/30",
  stale: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

export default function AdminAsaasOpsStatusPage() {
  const status = useQuery({
    queryKey: ["asaas-ops-status"],
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_admin_asaas_ops_status").select("*").maybeSingle();
      if (error) throw error;
      return (data as OpsStatus) || null;
    },
  });

  const byType = useQuery({
    queryKey: ["asaas-ops-by-type"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_admin_asaas_events_by_type").select("*");
      if (error) throw error;
      return (data as EventTypeRow[]) || [];
    },
  });

  const s = status.data;
  const ago = useMemo(() => {
    if (!s?.last_event_at) return "—";
    const diff = Date.now() - new Date(s.last_event_at).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `${min} min atrás`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
  }, [s?.last_event_at]);

  const exportCsv = () => {
    const rows = byType.data || [];
    const header = ["event_type","total","processed","failed","duplicated","last_at"];
    const csv = [header.join(",")]
      .concat(rows.map(r => [r.event_type ?? "", r.total, r.processed, r.failed, r.duplicated, r.last_at ?? ""].join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asaas-events-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Activity className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Status Operacional ASAAS</h1>
          <p className="text-sm text-muted-foreground">
            Saúde do webhook, última execução e contadores de eventos (últimas 24h).
          </p>
        </div>
        {s && (
          <Badge variant="outline" className={HEALTH_STYLES[s.health]}>
            {s.health === "healthy" && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {s.health === "unhealthy" && <AlertTriangle className="h-3 w-3 mr-1" />}
            {s.health === "stale" && <Clock className="h-3 w-3 mr-1" />}
            {s.health}
          </Badge>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Último evento" value={ago} />
        <Kpi label="Processados 24h" value={s?.processed_24h ?? 0} tone="ok" />
        <Kpi label="Falhas 24h" value={s?.failed_24h ?? 0} tone={s && s.failed_24h > 5 ? "bad" : "default"} />
        <Kpi label="Duplicados (idempotência)" value={s?.duplicated_24h ?? 0} />
        <Kpi label="Latência média" value={`${s?.avg_latency_ms ?? 0} ms`} />
        <Kpi label="Latência máx" value={`${s?.max_latency_ms ?? 0} ms`} />
        <Kpi label="Eventos 24h" value={s?.events_24h ?? 0} />
        <Kpi label="Ignorados" value={s?.ignored_24h ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Eventos por tipo (24h)</CardTitle>
            <Button onClick={exportCsv} variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {byType.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!byType.isLoading && (byType.data || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum evento nas últimas 24h.</p>
          )}
          {(byType.data || []).map((r) => (
            <div key={r.event_type ?? "_"} className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-mono text-sm truncate">{r.event_type || "(sem tipo)"}</p>
                <p className="text-xs text-muted-foreground">
                  {r.last_at ? new Date(r.last_at).toLocaleString("pt-BR") : "—"}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">{r.total} total</Badge>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">{r.processed} ok</Badge>
                {r.failed > 0 && <Badge variant="outline" className="border-destructive/40 text-destructive">{r.failed} fail</Badge>}
                {r.duplicated > 0 && <Badge variant="outline">{r.duplicated} dup</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "bad" | "default" }) {
  const cls = tone === "ok" ? "border-emerald-500/30" : tone === "bad" ? "border-destructive/30" : "";
  return (
    <Card className={cls}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-1 truncate">{value}</p>
      </CardContent>
    </Card>
  );
}
