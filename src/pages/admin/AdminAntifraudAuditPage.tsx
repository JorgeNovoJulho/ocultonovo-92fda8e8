import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter, History } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AuditRow {
  id: string;
  user_id: string | null;
  scope: string;
  severity: string | null;
  rule_code: string | null;
  decision: string;
  reason: string | null;
  ref_id: string | null;
  actor_id: string | null;
  metadata: any;
  created_at: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

function toCSV(rows: AuditRow[]): string {
  const header = ["created_at","scope","severity","rule_code","decision","user_id","ref_id","reason"];
  const lines = rows.map(r => [
    r.created_at, r.scope, r.severity ?? "", r.rule_code ?? "",
    r.decision, r.user_id ?? "", r.ref_id ?? "",
    (r.reason ?? "").replace(/"/g,'""'),
  ].map(v => `"${v}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

export default function AdminAntifraudAuditPage() {
  const [scope, setScope] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["fraud-audit", scope, severity],
    staleTime: 30_000,
    queryFn: async () => {
      let query = (supabase as any)
        .from("oculto_fraud_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (scope !== "all") query = query.eq("scope", scope);
      if (severity !== "all") query = query.eq("severity", severity);
      const { data, error } = await query;
      if (error) throw error;
      return (data as AuditRow[]) || [];
    },
  });

  const filtered = useMemo(() => {
    const list = q.data || [];
    if (!search) return list;
    const t = search.toLowerCase();
    return list.filter(r =>
      (r.reason || "").toLowerCase().includes(t) ||
      (r.rule_code || "").toLowerCase().includes(t) ||
      (r.user_id || "").toLowerCase().includes(t)
    );
  }, [q.data, search]);

  const exportCsv = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `antifraud-audit-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Auditoria Antifraude</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de chamadas e decisões high/critical e under_review.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger><SelectValue placeholder="Escopo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os escopos</SelectItem>
              <SelectItem value="incident">Incidente</SelectItem>
              <SelectItem value="withdraw_review">Saque em revisão</SelectItem>
              <SelectItem value="wallet_freeze">Wallet congelada</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger><SelectValue placeholder="Severidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Buscar por regra, motivo ou user_id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:col-span-1"
          />
          <Button onClick={exportCsv} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV ({filtered.length})
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos recentes (limite 500)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!q.isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum evento de auditoria encontrado.</p>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {r.severity && (
                  <Badge variant="outline" className={SEVERITY_STYLES[r.severity] || ""}>
                    {r.severity}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">{r.scope}</Badge>
                <span className="font-mono text-xs">{r.rule_code || "—"}</span>
                <Badge variant="outline" className="text-xs">{r.decision}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              {r.reason && <p className="text-sm">{r.reason}</p>}
              <p className="text-xs text-muted-foreground font-mono">
                user: {r.user_id?.slice(0, 8) || "—"}… · ref: {r.ref_id?.slice(0, 8) || "—"}…
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
