import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, ShieldCheck, AlertTriangle, Clock, Activity, Zap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { logger } from '@/lib/logger';

interface Health {
  webhooks_last_hour: number;
  duplicates_blocked_last_hour: number;
  failures_last_hour: number;
  avg_processing_ms: number | null;
  max_processing_ms: number | null;
  splits_last_hour: number;
  wallets_corrupted: number;
  overdue_releases: number;
}

const SCENARIOS: { id: string; label: string; desc: string; expected: string }[] = [
  { id: "duplicated_webhooks", label: "50 webhooks duplicados", desc: "Mesmo event_id 50x", expected: "1 processado + 49 bloqueados" },
  { id: "unique_webhooks", label: "50 webhooks únicos", desc: "50 event_ids distintos", expected: "50 processados, 0 duplicados" },
  { id: "split_with_affiliate", label: "Split com afiliado", desc: "Idempotência do split RPC com afiliado", expected: "1 split + N replays" },
  { id: "split_without_affiliate", label: "Split sem afiliado", desc: "Idempotência do split RPC sem afiliado", expected: "1 split + N replays" },
  { id: "refund_duplicated", label: "Refund duplicado", desc: "PAYMENT_REFUNDED 5x mesmo id", expected: "1 reverte + 4 bloqueados" },
  { id: "chargeback_requested", label: "Chargeback", desc: "PAYMENT_CHARGEBACK_REQUESTED", expected: "1 chargeback registrado" },
  { id: "subscription_lifecycle", label: "Subscription lifecycle", desc: "CREATED + UPDATED + INACTIVATED", expected: "3 eventos OK" },
  { id: "old_webhook_retry", label: "Retry antigo", desc: "Mesmo evento 3x sequenciais", expected: "1 OK + 2 bloqueados" },
];

export default function AdminAsaasStressTestPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const [lastRun, setLastRun] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = async () => {
    setLoading(true); setErr(null);
    const [{ data: h, error: e1 }, { data: hist }] = await Promise.all([
      (supabase as any).from("vw_asaas_concurrency_health").select("*").maybeSingle(),
      (supabase as any).from("oculto_stress_test_runs").select("id, scenario, status, result, started_at").order("started_at", { ascending: false }).limit(10),
    ]);
    if (e1) setErr(e1.message); else setData(h);
    setHistory(hist || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const fireScenario = async (scenario: string) => {
    setFiring(true); setLastRun(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const url = `${(supabase as any).supabaseUrl}/functions/v1/asaas-stress-simulator`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenario, count: 50, confirm: "I_UNDERSTAND_THIS_IS_A_STRESS_TEST" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || "Falha");
      setLastRun(json);
      toast.success(`✅ ${scenario}: ${json.ok} OK / ${json.duplicated} bloqueados / ${json.failed} falhas`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setFiring(false); setPendingScenario(null); setConfirmText("");
    }
  };

  const cleanup = async () => {
    const { data: r, error } = await (supabase as any).rpc("cleanup_stress_test_artifacts");
    if (error) toast.error(error.message);
    else { toast.success(`Limpos: ${r?.webhook_logs_deleted || 0} logs / ${r?.split_logs_deleted || 0} splits`); load(); }
  };

  const runSandboxSmoke = async () => {
    setFiring(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Não autenticado");
      const url = `${(supabase as any).supabaseUrl}/functions/v1/asaas-sandbox-smoketest`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Smoke test falhou");
      toast.success(`✅ Sandbox OK — payment ${json.payment_id}`);
      logger.log("[smoke]", json);
    } catch (e: any) {
      toast.error(e.message || "Erro no smoke test");
    } finally {
      setFiring(false);
    }
  };

  const Metric = ({ label, value, icon: Icon, danger }: any) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${danger ? "text-destructive" : "text-muted-foreground"}`} />
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-2xl font-bold ${danger ? "text-destructive" : ""}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Stress Test ASAAS</h1>
          <p className="text-sm text-muted-foreground">Telemetria + simulação de concorrência (somente Admin Master)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={cleanup}>
            <Trash2 className="h-4 w-4 mr-2" /> Limpar artefatos &gt;1h
          </Button>
          <Button variant="default" size="sm" onClick={runSandboxSmoke} disabled={firing}>
            🧪 Smoke Test Sandbox
          </Button>
        </div>
      </div>

      {err && <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{err}</CardContent></Card>}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Webhooks (1h)" value={data.webhooks_last_hour} icon={Activity} />
          <Metric label="Duplicatas bloqueadas" value={data.duplicates_blocked_last_hour} icon={ShieldCheck} />
          <Metric label="Falhas" value={data.failures_last_hour} icon={AlertTriangle} danger={data.failures_last_hour > 0} />
          <Metric label="Latência média" value={`${data.avg_processing_ms ?? "—"}ms`} icon={Clock} />
          <Metric label="Latência máx" value={`${data.max_processing_ms ?? "—"}ms`} icon={Clock} danger={(data.max_processing_ms ?? 0) > 5000} />
          <Metric label="Splits (1h)" value={data.splits_last_hour} icon={Activity} />
          <Metric label="Wallets corrompidas" value={data.wallets_corrupted} icon={AlertTriangle} danger={data.wallets_corrupted > 0} />
          <Metric label="Releases atrasados" value={data.overdue_releases} icon={Clock} danger={data.overdue_releases > 10} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Cenários de teste
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Dados sintéticos (prefixo STRESS_*). Não geram cobrança real. Rate limit: 1 run / 60s.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {SCENARIOS.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-3 rounded border bg-card">
              <div className="min-w-0">
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-muted-foreground truncate">{s.desc}</div>
                <div className="text-xs text-green-600 mt-1">→ {s.expected}</div>
              </div>
              <Button size="sm" onClick={() => setPendingScenario(s.id)} disabled={firing}>
                Disparar
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {lastRun && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Último run — {lastRun.scenario}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Disparados</div><div className="font-bold">{lastRun.fired}</div></div>
            <div><div className="text-xs text-muted-foreground">OK</div><div className="font-bold text-green-600">{lastRun.ok}</div></div>
            <div><div className="text-xs text-muted-foreground">Bloqueados</div><div className="font-bold">{lastRun.duplicated}</div></div>
            <div><div className="text-xs text-muted-foreground">Falhas</div><div className={`font-bold ${lastRun.failed > 0 ? "text-destructive" : ""}`}>{lastRun.failed}</div></div>
            <div><div className="text-xs text-muted-foreground">Tempo</div><div className="font-bold">{lastRun.elapsed_ms}ms</div></div>
            <div><div className="text-xs text-muted-foreground">P50</div><div className="font-bold">{lastRun.latency_p50}ms</div></div>
            <div><div className="text-xs text-muted-foreground">P95</div><div className="font-bold">{lastRun.latency_p95}ms</div></div>
            <div className="col-span-2 md:col-span-1"><div className="text-xs text-muted-foreground">Esperado</div><div className="text-xs">{lastRun.expected}</div></div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Histórico (últimos 10)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={h.status === "success" ? "default" : "destructive"}>{h.status}</Badge>
                  <span className="truncate">{h.scenario}</span>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {h.result ? `${h.result.ok}/${h.result.fired} • ${h.result.elapsed_ms}ms` : "—"}
                  {" • "}{new Date(h.started_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Dupla confirmação */}
      <AlertDialog open={!!pendingScenario} onOpenChange={(o) => !o && setPendingScenario(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Stress Test</AlertDialogTitle>
            <AlertDialogDescription>
              Cenário: <strong>{pendingScenario}</strong>
              <br /><br />
              Isso enviará webhooks sintéticos (sem cobrança real) contra o pix-webhook em produção.
              Para confirmar, digite <strong>CONFIRMAR</strong> abaixo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRMAR" autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmText(""); setPendingScenario(null); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== "CONFIRMAR" || firing}
              onClick={() => pendingScenario && fireScenario(pendingScenario)}
            >
              {firing ? "Disparando..." : "Disparar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
