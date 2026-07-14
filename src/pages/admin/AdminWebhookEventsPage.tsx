/**
 * AdminWebhookEventsPage — Painel de depuração de webhooks recebidos
 * Lista os eventos da tabela `webhook_events` (Asaas, Stripe, MP, etc) com
 * status, payload, horário e mensagem de erro. Foco: depuração rápida do PIX.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Search, Eye, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WebhookEvent {
  id: string;
  provider: string;
  event_type: string;
  event_id: string | null;
  payload: any;
  status: "pending" | "processed" | "failed" | "ignored";
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

const statusConfig = {
  processed: { label: "Processado", icon: CheckCircle2, variant: "default" as const, className: "bg-green-500/15 text-green-500 border-green-500/30" },
  pending: { label: "Pendente", icon: Clock, variant: "secondary" as const, className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  failed: { label: "Falhou", icon: XCircle, variant: "destructive" as const, className: "" },
  ignored: { label: "Ignorado", icon: AlertCircle, variant: "outline" as const, className: "text-muted-foreground" },
};

export default function AdminWebhookEventsPage() {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<WebhookEvent | null>(null);

  const { data: events, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["webhook-events", providerFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("webhook_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (providerFilter !== "all") q = q.eq("provider", providerFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as WebhookEvent[];
    },
    refetchInterval: 15000,
  });

  const providers = useMemo(() => {
    const set = new Set<string>();
    events?.forEach((e) => set.add(e.provider));
    return Array.from(set);
  }, [events]);

  const filtered = useMemo(() => {
    if (!search.trim()) return events || [];
    const s = search.toLowerCase();
    return (events || []).filter(
      (e) =>
        e.provider.toLowerCase().includes(s) ||
        e.event_type.toLowerCase().includes(s) ||
        e.event_id?.toLowerCase().includes(s) ||
        JSON.stringify(e.payload).toLowerCase().includes(s)
    );
  }, [events, search]);

  const stats = useMemo(() => {
    const all = events || [];
    return {
      total: all.length,
      processed: all.filter((e) => e.status === "processed").length,
      failed: all.filter((e) => e.status === "failed").length,
      pending: all.filter((e) => e.status === "pending").length,
    };
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Logs de Webhooks Recebidos</h1>
          <p className="text-muted-foreground text-sm">
            Depure rapidamente eventos de PIX (Asaas), Stripe, Mercado Pago e outros.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total (200 últimos)" value={stats.total} />
        <StatCard label="Processados" value={stats.processed} className="text-green-500" />
        <StatCard label="Pendentes" value={stats.pending} className="text-yellow-500" />
        <StatCard label="Falharam" value={stats.failed} className="text-destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>Atualiza automaticamente a cada 15s.</CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por provedor, evento, ID ou payload..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Provedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos provedores</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="processed">Processado</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="ignored">Ignorado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum evento encontrado. Quando o Asaas chamar o webhook, aparecerá aqui.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => {
                const cfg = statusConfig[e.status] || statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs">{e.provider}</Badge>
                        <Badge className={cfg.className} variant={cfg.variant}>
                          <Icon className="h-3 w-3 mr-1" />
                          {cfg.label}
                        </Badge>
                        <span className="text-sm font-medium truncate">{e.event_type}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                        {e.event_id && <span className="ml-2 font-mono">• {e.event_id}</span>}
                      </p>
                      {e.error_message && (
                        <p className="text-xs text-destructive mt-1 truncate">⚠ {e.error_message}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(e)}>
                      <Eye className="h-4 w-4 mr-1" /> Detalhes
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Evento</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Provedor" value={selected.provider} />
              <DetailRow label="Tipo" value={selected.event_type} />
              <DetailRow label="Event ID" value={selected.event_id || "—"} />
              <DetailRow label="Status" value={statusConfig[selected.status]?.label || selected.status} />
              <DetailRow
                label="Recebido em"
                value={format(new Date(selected.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
              />
              {selected.processed_at && (
                <DetailRow
                  label="Processado em"
                  value={format(new Date(selected.processed_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                />
              )}
              {selected.error_message && (
                <div>
                  <p className="text-xs font-semibold mb-1 text-destructive">Mensagem de erro</p>
                  <pre className="bg-destructive/10 border border-destructive/30 text-destructive text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {selected.error_message}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold mb-1">Payload</p>
                <pre className="bg-muted text-xs p-3 rounded overflow-x-auto max-h-[400px]">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${className}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-xs text-right break-all">{value}</span>
    </div>
  );
}
