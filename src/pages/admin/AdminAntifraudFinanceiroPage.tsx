import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Snowflake, AlertTriangle, Activity, CheckCircle2, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type RiskLevel = "low" | "medium" | "high" | "critical";

interface FraudScoreRow {
  user_id: string;
  fraud_score: number;
  risk_level: RiskLevel;
  reasons: any[];
  updated_at: string;
  username: string | null;
  display_name: string | null;
  fraud_frozen_until: string | null;
  open_incidents: number;
  chargebacks_total: number;
}

interface FraudIncident {
  id: string;
  user_id: string;
  rule_code: string;
  severity: string;
  score_delta: number;
  reason: string | null;
  resolved: boolean;
  created_at: string;
  metadata: any;
}

interface FraudKPI {
  critical_users: number;
  high_users: number;
  medium_users: number;
  updated_24h: number;
  open_incidents: number;
  incidents_24h: number;
  frozen_wallets: number;
}

const RISK_STYLES: Record<RiskLevel, string> = {
  low: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function AdminAntifraudFinanceiroPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const kpi = useQuery({
    queryKey: ["fraud-kpi"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_admin_fraud_kpi").select("*").maybeSingle();
      if (error) throw error;
      return (data as FraudKPI) || null;
    },
  });

  const scores = useQuery({
    queryKey: ["fraud-scores"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_admin_fraud_scores")
        .select("*")
        .order("fraud_score", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as FraudScoreRow[]) || [];
    },
  });

  const incidents = useQuery({
    queryKey: ["fraud-incidents"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oculto_fraud_incidents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as FraudIncident[]) || [];
    },
  });

  const filtered = useMemo(() => {
    const list = scores.data || [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(r =>
      (r.username || "").toLowerCase().includes(q) ||
      (r.display_name || "").toLowerCase().includes(q) ||
      r.user_id.toLowerCase().includes(q)
    );
  }, [scores.data, search]);

  const resolveIncident = async (id: string, clearScore: boolean) => {
    const { error } = await (supabase as any).rpc("oculto_fraud_resolve", {
      p_incident_id: id,
      p_clear_score: clearScore,
      p_unfreeze: true,
      p_note: clearScore ? "Resolvido: falso positivo" : "Resolvido: revisão concluída",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Incidente resolvido");
    qc.invalidateQueries({ queryKey: ["fraud-incidents"] });
    qc.invalidateQueries({ queryKey: ["fraud-scores"] });
    qc.invalidateQueries({ queryKey: ["fraud-kpi"] });
  };

  const k = kpi.data;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-destructive/10 p-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Antifraude Financeiro ASAAS</h1>
          <p className="text-sm text-muted-foreground">
            Detecção, score e bloqueios automáticos para proteger plataforma, criadores e compradores.
          </p>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                 label="Críticos" value={k?.critical_users ?? 0} tone="critical" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
                 label="Alto risco" value={k?.high_users ?? 0} tone="high" />
        <KpiCard icon={<Activity className="h-4 w-4 text-amber-500" />}
                 label="Incidentes 24h" value={k?.incidents_24h ?? 0} />
        <KpiCard icon={<Snowflake className="h-4 w-4 text-blue-500" />}
                 label="Wallets congeladas" value={k?.frozen_wallets ?? 0} />
      </div>

      <Tabs defaultValue="scores">
        <TabsList>
          <TabsTrigger value="scores">Usuários por Score</TabsTrigger>
          <TabsTrigger value="incidents">Incidentes</TabsTrigger>
        </TabsList>

        <TabsContent value="scores" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Top scores de risco</CardTitle>
                <div className="relative w-64 max-w-full">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar por nome ou ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {scores.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
              {!scores.isLoading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum usuário com score elevado.</p>
              )}
              {filtered.map((r) => (
                <div key={r.user_id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {r.display_name || r.username || r.user_id.slice(0, 8)}
                      </span>
                      <Badge variant="outline" className={RISK_STYLES[r.risk_level]}>
                        {r.risk_level}
                      </Badge>
                      {r.fraud_frozen_until && new Date(r.fraud_frozen_until) > new Date() && (
                        <Badge variant="outline" className="border-blue-500/40 text-blue-500">
                          <Snowflake className="h-3 w-3 mr-1" /> Wallet congelada
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Score: <strong>{Number(r.fraud_score).toFixed(1)}</strong> ·
                      Incidentes abertos: {r.open_incidents} ·
                      Chargebacks: {r.chargebacks_total}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.updated_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Incidentes detectados</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {incidents.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
              {!incidents.isLoading && (incidents.data || []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum incidente registrado.</p>
              )}
              {(incidents.data || []).map((i) => (
                <div key={i.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={RISK_STYLES[(i.severity as RiskLevel) || "low"]}>
                        {i.severity}
                      </Badge>
                      <span className="font-mono text-sm">{i.rule_code}</span>
                      {i.resolved && (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Resolvido
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(i.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p className="text-sm">{i.reason || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">user: {i.user_id.slice(0, 8)}… · +{i.score_delta}</p>
                  {!i.resolved && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => resolveIncident(i.id, false)}>
                        Marcar como revisado
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resolveIncident(i.id, true)}>
                        Falso positivo (limpar score)
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "critical" | "high" }) {
  return (
    <Card className={tone === "critical" ? "border-destructive/30" : tone === "high" ? "border-orange-500/30" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
