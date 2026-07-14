import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Download, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StressRun {
  id: string;
  triggered_by: string;
  scenario: string;
  params: any;
  result: any;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
}

function durationMs(r: StressRun): number {
  if (!r.finished_at) return 0;
  return new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
}

function extractMetrics(r: StressRun) {
  const res = r.result || {};
  return {
    total: Number(res.total ?? res.payloads_sent ?? 0),
    duplicates_blocked: Number(res.duplicates_blocked ?? res.idempotent_hits ?? 0),
    failures: Number(res.failures ?? res.errors ?? 0),
    avg_latency_ms: Number(res.avg_latency_ms ?? 0),
    p95_latency_ms: Number(res.p95_latency_ms ?? 0),
  };
}

export default function AdminStressTestReportPage() {
  const q = useQuery({
    queryKey: ["stress-runs"],
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oculto_stress_test_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as StressRun[]) || [];
    },
  });

  const summary = useMemo(() => {
    const list = q.data || [];
    const totals = list.reduce(
      (acc, r) => {
        const m = extractMetrics(r);
        acc.runs += 1;
        acc.total += m.total;
        acc.duplicates_blocked += m.duplicates_blocked;
        acc.failures += m.failures;
        acc.latency_sum += m.avg_latency_ms;
        if (r.status === "success") acc.success += 1;
        if (r.status === "failed") acc.failed += 1;
        return acc;
      },
      { runs: 0, total: 0, duplicates_blocked: 0, failures: 0, latency_sum: 0, success: 0, failed: 0 }
    );
    const avg = totals.runs > 0 ? Math.round(totals.latency_sum / totals.runs) : 0;
    return { ...totals, avg };
  }, [q.data]);

  const exportCsv = () => {
    const rows = q.data || [];
    const header = ["started_at","scenario","status","duration_ms","total","duplicates_blocked","failures","avg_latency_ms","p95_latency_ms"];
    const csv = [header.join(",")]
      .concat(rows.map(r => {
        const m = extractMetrics(r);
        return [
          r.started_at, r.scenario, r.status, durationMs(r),
          m.total, m.duplicates_blocked, m.failures, m.avg_latency_ms, m.p95_latency_ms,
        ].join(",");
      }))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stress-test-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <FlaskConical className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Relatório de Stress Test ASAAS</h1>
          <p className="text-sm text-muted-foreground">
            Idempotência, latência e falhas por rodada (últimas 100).
          </p>
        </div>
        <Button onClick={exportCsv} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Rodadas" value={summary.runs} />
        <Kpi label="Sucesso" value={summary.success} tone="ok" />
        <Kpi label="Falhas" value={summary.failed} tone={summary.failed > 0 ? "bad" : "default"} />
        <Kpi label="Eventos disparados" value={summary.total} />
        <Kpi label="Duplicados bloqueados" value={summary.duplicates_blocked} tone="ok" />
        <Kpi label="Erros internos" value={summary.failures} tone={summary.failures > 0 ? "bad" : "default"} />
        <Kpi label="Latência média" value={`${summary.avg} ms`} />
        <Kpi
          label="Idempotência"
          value={summary.total > 0
            ? `${((summary.duplicates_blocked / summary.total) * 100).toFixed(1)}%`
            : "—"}
          tone="ok"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de rodadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!q.isLoading && (q.data || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma rodada de stress test executada.</p>
          )}
          {(q.data || []).map((r) => {
            const m = extractMetrics(r);
            return (
              <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {r.status === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {r.status === "failed"  && <XCircle className="h-4 w-4 text-destructive" />}
                  {r.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
                  <span className="font-mono text-sm">{r.scenario}</span>
                  <Badge variant="outline" className="text-xs">{r.status}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(r.started_at).toLocaleString("pt-BR")}
                    {" · "}
                    {durationMs(r)} ms
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{m.total} eventos</Badge>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                    {m.duplicates_blocked} idemp.
                  </Badge>
                  {m.failures > 0 && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      {m.failures} falhas
                    </Badge>
                  )}
                  <Badge variant="outline">{m.avg_latency_ms} ms avg</Badge>
                  {m.p95_latency_ms > 0 && <Badge variant="outline">{m.p95_latency_ms} ms p95</Badge>}
                </div>
              </div>
            );
          })}
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
