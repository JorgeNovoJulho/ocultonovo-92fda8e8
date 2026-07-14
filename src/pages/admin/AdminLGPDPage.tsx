/**
 * Admin LGPD Panel — Onda 5
 * Visão consolidada para o Encarregado/DPO:
 *  - Solicitações de exportação e exclusão (lgpd_data_requests)
 *  - Métricas de consentimento (lgpd_consents)
 *  - Log de acessos sensíveis (lgpd_sensitive_access_log)
 *  - Políticas vigentes (lgpd_policy_versions)
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  FileDown,
  UserX,
  Eye,
  ScrollText,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

type RequestRow = {
  id: string;
  user_id: string;
  kind: "export" | "erasure" | "rectification" | "restriction" | "portability";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  signed_url: string | null;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
};

type ConsentAgg = { consent_type: string; granted: number; revoked: number };

type AccessLog = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  resource: string;
  action: string;
  reason: string | null;
  created_at: string;
};

type PolicyVersion = {
  policy_type: string;
  version: string;
  effective_at: string;
  is_current: boolean;
};

const STATUS_VARIANT: Record<RequestRow["status"], { label: string; cls: string; icon: JSX.Element }> = {
  pending:    { label: "Pendente",   cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30", icon: <Clock className="h-3 w-3" /> },
  processing: { label: "Processando",cls: "bg-blue-500/15 text-blue-500 border-blue-500/30",       icon: <Clock className="h-3 w-3 animate-spin" /> },
  completed:  { label: "Concluído",  cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed:     { label: "Falhou",     cls: "bg-destructive/15 text-destructive border-destructive/30", icon: <AlertCircle className="h-3 w-3" /> },
  cancelled: { label: "Cancelado",  cls: "bg-muted text-muted-foreground border-border",            icon: <AlertCircle className="h-3 w-3" /> },
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function useLGPDRequests() {
  return useQuery({
    queryKey: ["admin-lgpd-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lgpd_data_requests")
        .select("id,user_id,kind,status,signed_url,error_message,requested_at,completed_at")
        .order("requested_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as RequestRow[];
    },
    staleTime: 30_000,
  });
}

function useConsentMetrics() {
  return useQuery({
    queryKey: ["admin-lgpd-consents"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lgpd_consents")
        .select("consent_type,granted")
        .limit(10000);
      if (error) throw error;
      const map = new Map<string, ConsentAgg>();
      for (const r of (data || []) as any[]) {
        const key = r.consent_type as string;
        const agg = map.get(key) ?? { consent_type: key, granted: 0, revoked: 0 };
        if (r.granted) agg.granted++; else agg.revoked++;
        map.set(key, agg);
      }
      return Array.from(map.values()).sort((a, b) => b.granted - a.granted);
    },
    staleTime: 60_000,
  });
}

function useSensitiveAccess() {
  return useQuery({
    queryKey: ["admin-lgpd-sensitive-access"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lgpd_sensitive_access_log")
        .select("id,actor_user_id,target_user_id,resource,action,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as AccessLog[];
    },
    staleTime: 30_000,
  });
}

function usePolicies() {
  return useQuery({
    queryKey: ["admin-lgpd-policies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lgpd_policy_versions")
        .select("policy_type,version,effective_at,is_current")
        .order("effective_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as PolicyVersion[];
    },
    staleTime: 5 * 60_000,
  });
}

export default function AdminLGPDPage() {
  const [tab, setTab] = useState("requests");
  const reqs = useLGPDRequests();
  const consents = useConsentMetrics();
  const access = useSensitiveAccess();
  const policies = usePolicies();

  const stats = useMemo(() => {
    const list = reqs.data ?? [];
    return {
      total: list.length,
      pending: list.filter((r) => r.status === "pending" || r.status === "processing").length,
      exports: list.filter((r) => r.kind === "export").length,
      erasures: list.filter((r) => r.kind === "erasure").length,
    };
  }, [reqs.data]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Painel LGPD</h1>
          <p className="text-sm text-muted-foreground">
            Encarregado de Dados — solicitações, consentimentos, acessos sensíveis e políticas
          </p>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Solicitações (total)" value={stats.total} icon={<ScrollText className="h-4 w-4" />} />
        <KPI label="Pendentes" value={stats.pending} icon={<Clock className="h-4 w-4" />} accent="text-yellow-500" />
        <KPI label="Exportações" value={stats.exports} icon={<FileDown className="h-4 w-4" />} />
        <KPI label="Exclusões" value={stats.erasures} icon={<UserX className="h-4 w-4" />} accent="text-destructive" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="requests">Solicitações</TabsTrigger>
          <TabsTrigger value="consents">Consentimentos</TabsTrigger>
          <TabsTrigger value="access">Acessos Sensíveis</TabsTrigger>
          <TabsTrigger value="policies">Políticas</TabsTrigger>
        </TabsList>

        {/* SOLICITAÇÕES */}
        <TabsContent value="requests" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Solicitações de Titulares</CardTitle>
            </CardHeader>
            <CardContent>
              {reqs.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (reqs.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma solicitação registrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {(reqs.data ?? []).map((r) => {
                    const s = STATUS_VARIANT[r.status];
                    return (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center gap-3 py-2 border-b border-border/30 last:border-0"
                      >
                        <Badge variant="outline" className={`gap-1 ${s.cls}`}>
                          {s.icon}
                          {s.label}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          {r.kind === "export" ? <FileDown className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                          {r.kind === "export" ? "Exportação" : r.kind === "erasure" ? "Exclusão" : r.kind}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[260px]">
                          {r.user_id}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {fmt(r.requested_at)}
                          {r.completed_at && <> → {fmt(r.completed_at)}</>}
                        </span>
                        {r.signed_url && (
                          <Button asChild size="sm" variant="ghost" className="h-7">
                            <a href={r.signed_url} target="_blank" rel="noopener noreferrer">
                              <FileDown className="h-3 w-3 mr-1" /> Baixar
                            </a>
                          </Button>
                        )}
                        {r.error_message && (
                          <span className="text-xs text-destructive truncate max-w-full">
                            {r.error_message}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONSENTIMENTOS */}
        <TabsContent value="consents" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Métricas de Consentimento</CardTitle>
            </CardHeader>
            <CardContent>
              {consents.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (consents.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum consentimento registrado ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {(consents.data ?? []).map((c) => {
                    const total = c.granted + c.revoked;
                    const pct = total ? Math.round((c.granted / total) * 100) : 0;
                    return (
                      <div key={c.consent_type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{c.consent_type}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.granted} aceito • {c.revoked} revogado • {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACESSOS SENSÍVEIS */}
        <TabsContent value="access" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" /> Log de Acessos a Dados Sensíveis
              </CardTitle>
            </CardHeader>
            <CardContent>
              {access.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (access.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sem registros de acesso sensível.
                </p>
              ) : (
                <div className="space-y-2">
                  {(access.data ?? []).map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 py-2 border-b border-border/30 last:border-0 text-xs"
                    >
                      <Badge variant="outline">{a.action}</Badge>
                      <span className="font-mono text-muted-foreground">{a.resource}</span>
                      {a.actor_user_id && (
                        <span className="text-muted-foreground truncate max-w-[200px]">
                          actor: <span className="font-mono">{a.actor_user_id.slice(0, 8)}…</span>
                        </span>
                      )}
                      {a.target_user_id && (
                        <span className="text-muted-foreground truncate max-w-[200px]">
                          alvo: <span className="font-mono">{a.target_user_id.slice(0, 8)}…</span>
                        </span>
                      )}
                      {a.reason && <span className="text-muted-foreground">— {a.reason}</span>}
                      <span className="ml-auto text-muted-foreground">{fmt(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* POLÍTICAS */}
        <TabsContent value="policies" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Políticas vigentes</CardTitle>
            </CardHeader>
            <CardContent>
              {policies.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (policies.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma política cadastrada. Insira via SQL em <code>lgpd_policy_versions</code>.
                </p>
              ) : (
                <div className="space-y-2">
                  {(policies.data ?? []).map((p) => (
                    <div
                      key={`${p.policy_type}-${p.version}`}
                      className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0"
                    >
                      <Badge variant={p.is_current ? "default" : "secondary"}>
                        {p.policy_type}
                      </Badge>
                      <span className="text-sm font-medium">v{p.version}</span>
                      {p.is_current && (
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                          vigente
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {fmt(p.effective_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({
  label,
  value,
  icon,
  accent = "text-foreground",
}: {
  label: string;
  value: number;
  icon: JSX.Element;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md bg-muted flex items-center justify-center ${accent}`}>
          {icon}
        </div>
        <div>
          <div className="text-xl font-bold leading-none">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
