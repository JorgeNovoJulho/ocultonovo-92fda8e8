import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Search, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";

interface DailyTrend { day: string; total_actions: number; unique_users: number; suspicious: number }
interface TopIP { ip_address: string; distinct_users: number; total_actions: number; last_seen: string }
interface TopDevice { device_id: string; distinct_users: number; total_actions: number; last_seen: string }
interface TopAction { action_type: string; total: number; unique_users: number }
interface ActivityLog {
  id: string; user_id: string | null; action_type: string;
  ip_address: string | null; device_id: string | null;
  user_agent: string | null; risk_score: number;
  metadata: Record<string, unknown>; created_at: string;
}
interface FraudPatterns {
  generated_at: string;
  multi_account_ip: Array<{ ip_address: string; distinct_users: number; user_ids: string[] }>;
  action_bursts: Array<{ user_id: string; minute: string; actions: number }>;
  repetitive_behavior: Array<{ user_id: string; action_type: string; times: number }>;
  payment_burst?: Array<{ user_id: string; attempts: number; first_attempt: string; last_attempt: string }>;
  auto_flagged_count?: number;
}
interface BurstRow {
  user_id: string; username: string | null; action: string;
  event_count: number; first_event: string; last_event: string;
  unique_ips: number; unique_devices: number;
}

export default function AdminFraudPage() {
  const [days, setDays] = useState(7);
  const [trend, setTrend] = useState<DailyTrend[]>([]);
  const [topIps, setTopIps] = useState<TopIP[]>([]);
  const [topDevices, setTopDevices] = useState<TopDevice[]>([]);
  const [topActions, setTopActions] = useState<TopAction[]>([]);
  const [patterns, setPatterns] = useState<FraudPatterns | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filters, setFilters] = useState({ ip: "", device: "", minRisk: 0 });
  const [loading, setLoading] = useState(false);
  const [bursts, setBursts] = useState<{ messages: BurstRow[]; payments: BurstRow[]; signups: BurstRow[] }>({
    messages: [], payments: [], signups: [],
  });

  const alertsCount = useMemo(() => {
    if (!patterns) return 0;
    return (patterns.multi_account_ip?.length || 0)
      + (patterns.action_bursts?.length || 0)
      + (patterns.repetitive_behavior?.length || 0);
  }, [patterns]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [t, ips, devs, acts, p, bMsg, bPay, bSign] = await Promise.all([
        supabase.rpc("fraud_daily_trend", { p_days: days }),
        supabase.rpc("fraud_top_ips", { p_limit: 20, p_days: days }),
        supabase.rpc("fraud_top_devices", { p_limit: 20, p_days: days }),
        supabase.rpc("fraud_top_actions", { p_limit: 20, p_days: days }),
        supabase.rpc("detect_fraud_patterns", {}),
        supabase.rpc("fraud_burst_activity", { p_action: "message_sent", p_window_minutes: 5, p_min_count: 20, p_limit: 30 }),
        supabase.rpc("fraud_burst_activity", { p_action: "payment_init", p_window_minutes: 60, p_min_count: 5, p_limit: 30 }),
        supabase.rpc("fraud_burst_activity", { p_action: "signup", p_window_minutes: 60, p_min_count: 3, p_limit: 30 }),
      ]);
      if (t.error) throw t.error;
      setTrend((t.data as DailyTrend[]) || []);
      setTopIps((ips.data as TopIP[]) || []);
      setTopDevices((devs.data as TopDevice[]) || []);
      setTopActions((acts.data as TopAction[]) || []);
      setPatterns(p.data as FraudPatterns | null);
      setBursts({
        messages: (bMsg.data as BurstRow[]) || [],
        payments: (bPay.data as BurstRow[]) || [],
        signups: (bSign.data as BurstRow[]) || [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar fraude";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const searchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("fraud_search_logs", {
        p_ip: filters.ip || null,
        p_device: filters.device || null,
        p_user_id: null,
        p_min_risk: filters.minRisk,
        p_days: days,
        p_limit: 200,
      });
      if (error) throw error;
      setLogs((data as ActivityLog[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro na busca";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling realtime: revalida padrões a cada 20s para alertar payment_burst sem refresh manual
  useEffect(() => {
    const id = setInterval(() => { loadAll(); }, 20_000);
    return () => clearInterval(id);
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alerta dedicado quando aparece NOVO payment_burst entre polls
  const lastBurstSigRef = useRef<string>("");
  useEffect(() => {
    const sig = (patterns?.payment_burst || []).map(b => `${b.user_id}:${b.attempts}`).sort().join("|");
    if (sig && sig !== lastBurstSigRef.current) {
      const n = patterns?.payment_burst?.length || 0;
      if (n > 0 && lastBurstSigRef.current !== "") {
        toast.error(`💳 Novo burst de pagamento detectado (${n} usuário(s))`, { id: "payment-burst-alert", duration: 8000 });
      }
      lastBurstSigRef.current = sig;
    }
  }, [patterns?.payment_burst]);

  // Alerta visual via toast quando alertsCount sobe acima de threshold
  useEffect(() => {
    if (alertsCount >= 5) {
      toast.warning(`⚠️ ${alertsCount} padrões suspeitos detectados`, { id: "fraud-alert" });
    }
  }, [alertsCount]);

  // Alerta para auto-flag de bursts de pagamento
  useEffect(() => {
    const n = patterns?.auto_flagged_count ?? 0;
    if (n > 0) {
      toast.error(`🚩 ${n} usuário(s) marcado(s) como suspeito por burst de checkout`, { id: "fraud-autoflag" });
    }
  }, [patterns?.auto_flagged_count]);

  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-destructive" />
          <h1 className="text-2xl font-bold">Detecção de Fraude</h1>
          {alertsCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              <AlertTriangle className="w-3 h-3 mr-1" /> {alertsCount} alertas
            </Badge>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-background border rounded px-2 py-1 text-sm"
          >
            <option value={1}>24h</option>
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
          </select>
          <Button size="sm" variant="outline" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </header>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="patterns">Padrões suspeitos</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-2">Tendência diária</h2>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))" }} />
                  <Line type="monotone" dataKey="total_actions" stroke="hsl(var(--primary))" name="Ações" />
                  <Line type="monotone" dataKey="unique_users" stroke="hsl(var(--secondary))" name="Usuários" />
                  <Line type="monotone" dataKey="suspicious" stroke="hsl(var(--destructive))" name="Suspeitas" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h2 className="font-semibold mb-2">Top IPs</h2>
              <div className="max-h-72 overflow-auto text-sm">
                <table className="w-full">
                  <thead className="text-xs opacity-70">
                    <tr><th className="text-left">IP</th><th>Usuários</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {topIps.map((r) => (
                      <tr key={r.ip_address} className={r.distinct_users > 3 ? "text-destructive" : ""}>
                        <td className="font-mono">{r.ip_address}</td>
                        <td className="text-center">{r.distinct_users}</td>
                        <td className="text-center">{r.total_actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-2">Top Devices</h2>
              <div className="max-h-72 overflow-auto text-sm">
                <table className="w-full">
                  <thead className="text-xs opacity-70">
                    <tr><th className="text-left">Device</th><th>Usuários</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {topDevices.map((r) => (
                      <tr key={r.device_id} className={r.distinct_users > 2 ? "text-destructive" : ""}>
                        <td className="font-mono truncate max-w-[180px]">{r.device_id}</td>
                        <td className="text-center">{r.distinct_users}</td>
                        <td className="text-center">{r.total_actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h2 className="font-semibold mb-2">Top ações</h2>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={topActions}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="action_type" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))" }} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">Bursts de atividade (detecção soft)</h2>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              {([
                { key: "messages", title: "Mensagens (>20 / 5min)", rows: bursts.messages },
                { key: "payments", title: "Checkouts (>5 / 1h)", rows: bursts.payments },
                { key: "signups", title: "Signups por IP/device (>3 / 1h)", rows: bursts.signups },
              ] as const).map((b) => (
                <div key={b.key}>
                  <h3 className="font-medium mb-1 text-xs uppercase opacity-70">{b.title}</h3>
                  {b.rows.length === 0 ? (
                    <p className="opacity-50 text-xs">Nada suspeito.</p>
                  ) : (
                    <ul className="space-y-1">
                      {b.rows.slice(0, 8).map((r) => (
                        <li key={r.user_id + r.action} className="border-b border-border/40 pb-1">
                          <span className="font-mono">{r.username || r.user_id.slice(0, 8)}</span>
                          {" — "}
                          <Badge variant="destructive" className="text-[10px]">{r.event_count}×</Badge>
                          <div className="opacity-60 text-[11px]">
                            {r.unique_ips} IPs · {r.unique_devices} devices
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="patterns" className="space-y-4">
          {!patterns ? <p className="opacity-60">Carregando…</p> : (
            <>
              <Card className="p-4">
                <h3 className="font-semibold mb-2">Múltiplas contas no mesmo IP (&gt;3 / 7d)</h3>
                {patterns.multi_account_ip?.length === 0 ? <p className="opacity-60 text-sm">Nenhum.</p> : (
                  <ul className="text-sm space-y-1">
                    {patterns.multi_account_ip.map((m) => (
                      <li key={m.ip_address}>
                        <span className="font-mono">{m.ip_address}</span> — {m.distinct_users} usuários
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-2">Rajadas (&gt;30 ações/min — 24h)</h3>
                {patterns.action_bursts?.length === 0 ? <p className="opacity-60 text-sm">Nenhuma.</p> : (
                  <ul className="text-sm space-y-1">
                    {patterns.action_bursts.map((b, i) => (
                      <li key={i}>
                        User <span className="font-mono">{b.user_id?.slice(0, 8)}</span> — {b.actions} ações em {new Date(b.minute).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-2">Comportamento repetitivo (&gt;50× / 1h)</h3>
                {patterns.repetitive_behavior?.length === 0 ? <p className="opacity-60 text-sm">Nenhum.</p> : (
                  <ul className="text-sm space-y-1">
                    {patterns.repetitive_behavior.map((r, i) => (
                      <li key={i}>
                        User <span className="font-mono">{r.user_id?.slice(0, 8)}</span> — {r.action_type} ({r.times}×)
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4 border-destructive/40">
                <h3 className="font-semibold mb-2 text-destructive">
                  Burst de pagamentos (≥5 checkouts/1h) — auto-flagged
                </h3>
                {(patterns.payment_burst?.length ?? 0) === 0 ? (
                  <p className="opacity-60 text-sm">Nenhum.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {patterns.payment_burst!.map((r, i) => (
                      <li key={i}>
                        User <span className="font-mono">{r.user_id?.slice(0, 8)}</span> — {r.attempts} tentativas
                        <span className="opacity-60 ml-2 text-xs">
                          {new Date(r.first_attempt).toLocaleTimeString()} → {new Date(r.last_attempt).toLocaleTimeString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-3">
          <Card className="p-4 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Input placeholder="IP" value={filters.ip} onChange={(e) => setFilters((f) => ({ ...f, ip: e.target.value }))} />
              <Input placeholder="Device ID" value={filters.device} onChange={(e) => setFilters((f) => ({ ...f, device: e.target.value }))} />
              <Input type="number" placeholder="Risk mínimo" value={filters.minRisk} onChange={(e) => setFilters((f) => ({ ...f, minRisk: Number(e.target.value) || 0 }))} />
              <Button onClick={searchLogs} disabled={loading}>
                <Search className="w-4 h-4 mr-1" /> Buscar
              </Button>
            </div>
          </Card>

          <Card className="p-0 overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left p-2">Quando</th>
                  <th className="text-left p-2">Ação</th>
                  <th className="text-left p-2">User</th>
                  <th className="text-left p-2">IP</th>
                  <th className="text-left p-2">Device</th>
                  <th className="text-left p-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className={l.risk_score >= 50 ? "bg-destructive/10" : ""}>
                    <td className="p-2 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="p-2">{l.action_type}</td>
                    <td className="p-2 font-mono">{l.user_id?.slice(0, 8)}</td>
                    <td className="p-2 font-mono">{l.ip_address}</td>
                    <td className="p-2 font-mono truncate max-w-[140px]">{l.device_id}</td>
                    <td className="p-2 text-center">{l.risk_score}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center opacity-60">Use os filtros acima e clique em Buscar.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
