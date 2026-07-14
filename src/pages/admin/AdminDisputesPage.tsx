import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAdminBypass } from "@/hooks/useAdminBypass";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertTriangle, RotateCcw, ShieldAlert, Search, Download, Lock, FileText,
  CheckCircle2, XCircle, Clock, ExternalLink, ChevronDown,
} from "lucide-react";

type DisputeRow = {
  id: string;
  transaction_id: string | null;
  payment_external_id: string | null;
  creator_id: string | null;
  affiliate_id: string | null;
  buyer_user_id: string | null;
  asaas_dispute_id: string | null;
  event_type: string | null;
  status: string;
  reason: string | null;
  amount: number;
  creator_debit: number;
  affiliate_debit: number;
  evidence_due_date: string | null;
  opened_at: string;
  resolved_at: string | null;
  decision: string | null;
  resolution_notes?: string | null;
  metadata: Record<string, any>;
  creator_name: string | null;
  affiliate_name: string | null;
  buyer_name: string | null;
};

type WebhookLog = {
  id: string;
  asaas_event_id: string | null;
  event_type: string | null;
  payment_id: string | null;
  status: string;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  payload: Record<string, any>;
};

type BlockedTx = {
  dispute_id: string;
  transaction_id: string | null;
  buyer_id: string | null;
  creator_id: string | null;
  amount: number | null;
  transaction_status: string | null;
  withdrawal_blocked: boolean;
  block_reason: string | null;
  blocked_at: string | null;
  created_at: string;
  creator_name: string | null;
  buyer_name: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  opened: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  under_dispute: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  refunded: "bg-red-500/15 text-red-700 border-red-500/30",
  chargeback_lost: "bg-red-600/20 text-red-800 border-red-700/30",
  reversed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  resolved: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const PAGE_SIZE = 25;

function fmtBR(n: number | null | undefined) {
  return `R$ ${Number(n || 0).toFixed(2)}`;
}
function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleString("pt-BR") : "—";
}

function toCSV(rows: DisputeRow[]): string {
  const head = [
    "id","payment_external_id","status","decision","event_type","amount",
    "creator_debit","affiliate_debit","creator","affiliate","buyer",
    "opened_at","resolved_at","reason","resolution_notes",
  ];
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((d) =>
    [
      d.id, d.payment_external_id, d.status, d.decision, d.event_type,
      d.amount, d.creator_debit, d.affiliate_debit,
      d.creator_name, d.affiliate_name, d.buyer_name,
      d.opened_at, d.resolved_at, d.reason, d.resolution_notes,
    ].map(esc).join(",")
  );
  return [head.join(","), ...body].join("\n");
}

function downloadCSV(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminDisputesPage() {
  const { shouldBypass: isMaster, isLoading: roleLoading } = useAdminBypass();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<DisputeRow | null>(null);

  const { data: disputes = [], isLoading } = useQuery({
    queryKey: ["admin-disputes", statusFilter],
    enabled: !!isMaster,
    staleTime: 30_000,
    queryFn: async (): Promise<DisputeRow[]> => {
      let q = (supabase as any)
        .from("v_admin_disputes").select("*")
        .order("opened_at", { ascending: false }).limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DisputeRow[];
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await (supabase as any).rpc("oculto_reverse_chargeback", {
        p_payment_external_id: paymentId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Chargeback revertido — saldos recreditados.");
      qc.invalidateQueries({ queryKey: ["admin-disputes"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message || e}`),
  });

  const filtered = useMemo(() => {
    if (!filter) return disputes;
    const s = filter.toLowerCase();
    return disputes.filter((d) =>
      d.payment_external_id?.toLowerCase().includes(s) ||
      d.creator_name?.toLowerCase().includes(s) ||
      d.affiliate_name?.toLowerCase().includes(s) ||
      d.buyer_name?.toLowerCase().includes(s) ||
      d.transaction_id?.toLowerCase().includes(s)
    );
  }, [disputes, filter]);

  const visible = filtered.slice(0, visibleCount);

  const stats = useMemo(() => ({
    total: disputes.length,
    open: disputes.filter((d) => ["opened", "under_dispute"].includes(d.status)).length,
    refunded: disputes.filter((d) => d.status === "refunded").length,
    reversed: disputes.filter((d) => d.status === "reversed").length,
    blocked: disputes.filter((d) => !["reversed","closed","resolved"].includes(d.status))
      .reduce((s, d) => s + Number(d.creator_debit) + Number(d.affiliate_debit), 0),
    totalDebit: disputes.reduce((s, d) => s + Number(d.creator_debit) + Number(d.affiliate_debit), 0),
  }), [disputes]);

  if (roleLoading) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (!isMaster) return (
    <Card className="m-6 p-6 flex items-center gap-3">
      <ShieldAlert className="text-destructive" />
      <div>Acesso restrito ao Admin Master.</div>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="text-destructive" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Disputas e Chargebacks</h1>
          <p className="text-sm text-muted-foreground">Estornos, contestações e reversões via ASAAS.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          if (filtered.length === 0) { toast.warning("Sem disputas para exportar."); return; }
          downloadCSV(`disputas_${new Date().toISOString().slice(0,10)}.csv`, toCSV(filtered));
          toast.success(`Exportadas ${filtered.length} disputas.`);
        }}>
          <Download className="w-4 h-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl font-semibold">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Em aberto</div><div className="text-xl font-semibold text-yellow-600">{stats.open}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Reembolsados</div><div className="text-xl font-semibold text-red-600">{stats.refunded}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Revertidos</div><div className="text-xl font-semibold text-emerald-600">{stats.reversed}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Saldo bloqueado</div><div className="text-xl font-semibold text-orange-600">{fmtBR(stats.blocked)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Débito total</div><div className="text-xl font-semibold">{fmtBR(stats.totalDebit)}</div></Card>
      </div>

      <Card className="p-3 flex flex-col md:flex-row gap-2">
        <div className="flex-1 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por payment id, criador, afiliado, comprador…"
            value={filter} onChange={(e) => { setFilter(e.target.value); setVisibleCount(PAGE_SIZE); }} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "opened", "under_dispute", "refunded", "reversed", "resolved", "closed"].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"}
              onClick={() => { setStatusFilter(s); setVisibleCount(PAGE_SIZE); }}>
              {s === "all" ? "Todos" : s}
            </Button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <div className="p-6 text-muted-foreground">Carregando disputas…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Nenhuma disputa encontrada.</Card>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((d) => {
              const blockedTotal = Number(d.creator_debit) + Number(d.affiliate_debit);
              const isBlocked = blockedTotal > 0 && !["reversed","closed","resolved"].includes(d.status);
              return (
                <Card key={d.id} className="p-3 hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => setSelected(d)}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={STATUS_COLORS[d.status] || "bg-muted"}>{d.status}</Badge>
                        {d.event_type && <Badge variant="outline">{d.event_type}</Badge>}
                        {isBlocked && (
                          <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/40">
                            <Lock className="w-3 h-3 mr-1" /> Saldo bloqueado: {fmtBR(blockedTotal)}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground font-mono truncate">{d.payment_external_id}</span>
                      </div>
                      <div className="text-sm">
                        <strong>{fmtBR(d.amount)}</strong>
                        {d.creator_name && <> · Criador: <span className="font-medium">{d.creator_name}</span> (-{fmtBR(d.creator_debit)})</>}
                        {d.affiliate_name && <> · Afiliado: <span className="font-medium">{d.affiliate_name}</span> (-{fmtBR(d.affiliate_debit)})</>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Comprador: {d.buyer_name || d.buyer_user_id || "—"} · Aberto: {fmtDate(d.opened_at)}
                        {d.resolved_at && <> · Resolvido: {fmtDate(d.resolved_at)}</>}
                      </div>
                      {d.reason && <div className="text-xs text-muted-foreground">Motivo: {d.reason}</div>}
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(d)}>
                        <FileText className="w-4 h-4 mr-1" /> Detalhes
                      </Button>
                      {d.status !== "reversed" && d.payment_external_id && (
                        <Button size="sm" variant="outline" disabled={reverseMutation.isPending}
                          onClick={() => {
                            if (!confirm("Reverter este chargeback? Saldos do criador/afiliado serão recreditados.")) return;
                            reverseMutation.mutate(d.payment_external_id!);
                          }}>
                          <RotateCcw className="w-4 h-4 mr-1" /> Reverter
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          {visible.length < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                <ChevronDown className="w-4 h-4 mr-1" />
                Carregar mais ({filtered.length - visible.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      <DisputeDetailsDialog
        dispute={selected}
        onClose={() => setSelected(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["admin-disputes"] })}
      />
    </div>
  );
}

// ============================================================================
// Modal de detalhes
// ============================================================================
function DisputeDetailsDialog({
  dispute, onClose, onChanged,
}: {
  dispute: DisputeRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = !!dispute;
  const paymentId = dispute?.payment_external_id;

  const { data: webhookLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["dispute-webhook-logs", paymentId],
    enabled: open && !!paymentId,
    staleTime: 30_000,
    queryFn: async (): Promise<WebhookLog[]> => {
      const { data, error } = await (supabase as any)
        .from("oculto_asaas_webhook_logs").select("*")
        .eq("payment_id", paymentId)
        .order("received_at", { ascending: true });
      if (error) throw error;
      return (data || []) as WebhookLog[];
    },
  });

  const { data: blockedTx = [] } = useQuery({
    queryKey: ["dispute-blocked-tx", dispute?.id],
    enabled: open && !!dispute?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<BlockedTx[]> => {
      const { data, error } = await (supabase as any)
        .from("v_admin_dispute_blocked_transactions").select("*")
        .eq("dispute_id", dispute!.id);
      if (error) throw error;
      return (data || []) as BlockedTx[];
    },
  });

  const [resolveStatus, setResolveStatus] = useState<string>("resolved");
  const [resolveDecision, setResolveDecision] = useState<string>("");
  const [resolveNotes, setResolveNotes] = useState<string>("");

  const resolveMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("oculto_resolve_dispute", {
        p_dispute_id: dispute!.id,
        p_status: resolveStatus,
        p_decision: resolveDecision || null,
        p_notes: resolveNotes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Disputa atualizada.");
      setResolveDecision(""); setResolveNotes("");
      onChanged(); onClose();
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message || e}`),
  });

  if (!dispute) return null;

  const evidence = dispute.metadata || {};
  const blockedTotal = Number(dispute.creator_debit) + Number(dispute.affiliate_debit);
  const isBlocked = blockedTotal > 0 && !["reversed","closed","resolved"].includes(dispute.status);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Disputa
            <Badge className={STATUS_COLORS[dispute.status] || "bg-muted"}>{dispute.status}</Badge>
            {dispute.event_type && <Badge variant="outline">{dispute.event_type}</Badge>}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{dispute.payment_external_id}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sumário */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Valor</div><div className="font-semibold">{fmtBR(dispute.amount)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Débito criador</div><div className="font-semibold">-{fmtBR(dispute.creator_debit)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Débito afiliado</div><div className="font-semibold">-{fmtBR(dispute.affiliate_debit)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Aberto</div><div className="text-sm">{fmtDate(dispute.opened_at)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Resolvido</div><div className="text-sm">{fmtDate(dispute.resolved_at)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Decisão</div><div className="text-sm">{dispute.decision || "—"}</div></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <div><span className="text-muted-foreground">Criador:</span> {dispute.creator_name || "—"}</div>
            <div><span className="text-muted-foreground">Afiliado:</span> {dispute.affiliate_name || "—"}</div>
            <div><span className="text-muted-foreground">Comprador:</span> {dispute.buyer_name || "—"}</div>
          </div>

          {dispute.reason && (
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Motivo</div>
              <div className="text-sm">{dispute.reason}</div>
            </Card>
          )}

          {dispute.resolution_notes && (
            <Card className="p-3 border-blue-500/30 bg-blue-500/5">
              <div className="text-xs text-muted-foreground mb-1">Notas internas (Admin Master)</div>
              <div className="text-sm whitespace-pre-wrap">{dispute.resolution_notes}</div>
            </Card>
          )}

          {/* Saldo bloqueado + transações */}
          <Card className={`p-3 ${isBlocked ? "border-orange-500/40 bg-orange-500/5" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Lock className={`w-4 h-4 ${isBlocked ? "text-orange-600" : "text-muted-foreground"}`} />
                <strong className="text-sm">Saldo bloqueado por esta disputa</strong>
              </div>
              <Badge variant={isBlocked ? "default" : "outline"} className={isBlocked ? "bg-orange-500/20 text-orange-700 border-orange-500/40" : ""}>
                {fmtBR(blockedTotal)}
              </Badge>
            </div>
            {blockedTx.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nenhuma transação vinculada encontrada.</div>
            ) : (
              <div className="space-y-1">
                {blockedTx.map((tx) => (
                  <div key={tx.transaction_id || Math.random()}
                    className="flex items-center justify-between text-xs border-l-2 border-orange-500/40 pl-2 py-1">
                    <div className="min-w-0">
                      <div className="font-mono truncate">{tx.transaction_id || "—"}</div>
                      <div className="text-muted-foreground">
                        {tx.creator_name || "Criador"} ← {tx.buyer_name || "Comprador"} · {fmtDate(tx.blocked_at || tx.created_at)}
                      </div>
                      {tx.block_reason && <div className="text-muted-foreground">Motivo: {tx.block_reason}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{tx.transaction_status}</Badge>
                      {tx.withdrawal_blocked && (
                        <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/40">
                          <Lock className="w-3 h-3 mr-1" /> Saque bloqueado
                        </Badge>
                      )}
                      <span className="font-semibold">{fmtBR(tx.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Timeline de eventos do webhook */}
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4" />
              <strong className="text-sm">Timeline de eventos (webhook ASAAS)</strong>
              <Badge variant="outline">{webhookLogs.length}</Badge>
            </div>
            {loadingLogs ? (
              <div className="text-xs text-muted-foreground">Carregando…</div>
            ) : webhookLogs.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nenhum evento registrado para este pagamento.</div>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-3">
                {webhookLogs.map((log) => {
                  const ok = log.status === "processed";
                  const Icon = ok ? CheckCircle2 : log.status === "failed" ? XCircle : Clock;
                  return (
                    <li key={log.id} className="ml-4">
                      <span className={`absolute -left-[7px] flex h-3 w-3 items-center justify-center rounded-full
                        ${ok ? "bg-emerald-500" : log.status === "failed" ? "bg-rose-500" : "bg-yellow-500"}`} />
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <Icon className={`w-3 h-3 ${ok ? "text-emerald-600" : log.status === "failed" ? "text-rose-600" : "text-yellow-600"}`} />
                        <strong className="font-mono">{log.event_type}</strong>
                        <Badge variant="outline" className="text-[10px]">{log.status}</Badge>
                        <span className="text-muted-foreground">{fmtDate(log.received_at)}</span>
                      </div>
                      {log.error_message && (
                        <div className="text-xs text-rose-600 mt-1">{log.error_message}</div>
                      )}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                          ver payload
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[10px] font-mono">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {/* Evidências (metadata) */}
          {Object.keys(evidence).length > 0 && (
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4" />
                <strong className="text-sm">Evidências e metadata</strong>
              </div>
              <pre className="max-h-64 overflow-auto rounded bg-muted/50 p-2 text-[10px] font-mono">
                {JSON.stringify(evidence, null, 2)}
              </pre>
            </Card>
          )}

          {/* Ações Master */}
          <Card className="p-3 border-primary/30">
            <div className="text-sm font-semibold mb-2">Ações Admin Master</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={resolveStatus} onChange={(e) => setResolveStatus(e.target.value)}>
                <option value="resolved">Marcar como resolved</option>
                <option value="closed">Encerrar (closed)</option>
                <option value="chargeback_lost">Chargeback perdido</option>
                <option value="under_dispute">Reabrir como under_dispute</option>
              </select>
              <Input placeholder="Decisão (ex: refund_aceito)"
                value={resolveDecision} onChange={(e) => setResolveDecision(e.target.value)} />
            </div>
            <Textarea placeholder="Notas internas sobre a decisão (opcional)…"
              value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)}
              className="min-h-[60px] text-sm" />
          </Card>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {dispute.payment_external_id && (
            <a className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
              href={`https://www.asaas.com/payment/${dispute.payment_external_id}`}
              target="_blank" rel="noreferrer">
              <ExternalLink className="w-3 h-3 mr-1" /> abrir no ASAAS
            </a>
            )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => resolveMut.mutate()} disabled={resolveMut.isPending}>
            {resolveMut.isPending ? "Salvando…" : "Aplicar decisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
