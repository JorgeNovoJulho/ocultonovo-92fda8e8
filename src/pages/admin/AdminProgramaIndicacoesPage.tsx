import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { Settings, Wallet, ShieldAlert, TrendingUp, Check, X, Send, History, Search, FileText } from "lucide-react";
import { ReferralsLandingEditor } from "@/components/admin/ReferralsLandingEditor";

const fmt = (n: number) => `R$ ${(Number(n) || 0).toFixed(2)}`;

interface Config {
  enabled: boolean;
  commission_pct: number;
  tracking_window_days: number;
  withdraw_min_amount: number;
  withdraw_monthly_limit: number;
  withdraw_processing_business_days: number;
  antifraud_block_self: boolean;
  antifraud_block_same_device: boolean;
  antifraud_block_same_ip: boolean;
  commission_only_first_subscription: boolean;
  public_ranking_enabled: boolean;
}

function useConfig() {
  return useQuery({
    queryKey: ["admin-referral-config"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("referral_program_config").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data as Config;
    },
  });
}

function useMetrics() {
  const q = useQuery({
    queryKey: ["admin-referral-metrics"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("v_referral_admin_metrics").select("*").maybeSingle();
      return data;
    },
  });
  useEffect(() => {
    const u1 = subscribeTable("referral_withdrawals", () => q.refetch());
    const u2 = subscribeTable("referral_users_tracking", () => q.refetch());
    return () => { try { u1(); u2(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return q;
}

function useWithdrawals(status: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-referral-withdrawals", status],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("v_referral_admin_withdrawals")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as any[]) || [];
    },
  });
  useEffect(() => {
    const unsub = subscribeTable("referral_withdrawals", () => {
      qc.invalidateQueries({ queryKey: ["admin-referral-withdrawals"] });
    });
    return () => { try { unsub(); } catch {} };
  }, [status, qc]);
  return q;
}

function useAntifraudEvents() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-referral-antifraud"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("referral_antifraud_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as any[]) || [];
    },
  });
  useEffect(() => {
    const unsub = subscribeTable("referral_antifraud_events", () => {
      qc.invalidateQueries({ queryKey: ["admin-referral-antifraud"] });
    });
    return () => { try { unsub(); } catch {} };
  }, [qc]);
  return q;
}

function useAuditLog() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-referral-audit"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("v_referral_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as any[]) || [];
    },
  });
  useEffect(() => {
    const unsub = subscribeTable("referral_audit_log", () => {
      qc.invalidateQueries({ queryKey: ["admin-referral-audit"] });
    }, { events: ['INSERT'] });
    return () => { try { unsub(); } catch {} };
  }, [qc]);
  return q;
}

export default function AdminProgramaIndicacoesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: cfg, isLoading: cfgLoading } = useConfig();
  const { data: metrics } = useMetrics();
  const [draft, setDraft] = useState<Partial<Config> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { if (cfg) setDraft(cfg); }, [cfg]);

  const saveCfg = useMutation({
    mutationFn: async (patch: Partial<Config>) => {
      const { data, error } = await (supabase as any).rpc("referral_admin_update_config", { p_patch: patch });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Configurações salvas" });
      qc.invalidateQueries({ queryKey: ["admin-referral-config"] });
      qc.invalidateQueries({ queryKey: ["referral-program-config"] });
      qc.invalidateQueries({ queryKey: ["admin-referral-audit"] });
      setConfirmOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  // Diff para preview na confirmação
  const diff = useMemo(() => {
    if (!cfg || !draft) return [] as Array<{ k: string; from: any; to: any }>;
    return Object.keys(draft).filter(k => (cfg as any)[k] !== (draft as any)[k])
      .map(k => ({ k, from: (cfg as any)[k], to: (draft as any)[k] }));
  }, [cfg, draft]);

  return (
    <div className="container mx-auto max-w-5xl py-6 px-3 space-y-4">
      <header>
        <h1 className="text-xl font-bold">Programa de Indicações</h1>
        <p className="text-xs text-muted-foreground">Configuração, fila de saques, antifraude e auditoria.</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Indicados (total)" value={String(metrics?.total_tracked || 0)} icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <Kpi label="Convertidos" value={String(metrics?.total_converted || 0)} icon={<Check className="h-3.5 w-3.5" />} />
        <Kpi label="Comissões totais" value={fmt(metrics?.total_commissions || 0)} icon={<Wallet className="h-3.5 w-3.5" />} highlight />
        <Kpi label="Saques pendentes" value={`${metrics?.pending_withdrawals || 0} · ${fmt(metrics?.pending_withdrawal_amount || 0)}`} icon={<Send className="h-3.5 w-3.5" />} />
      </div>

      <Tabs defaultValue="config">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="config"><Settings className="h-3.5 w-3.5 mr-1" />Config</TabsTrigger>
          <TabsTrigger value="withdrawals"><Wallet className="h-3.5 w-3.5 mr-1" />Saques</TabsTrigger>
          <TabsTrigger value="antifraud"><ShieldAlert className="h-3.5 w-3.5 mr-1" />Antifraude</TabsTrigger>
          <TabsTrigger value="audit"><History className="h-3.5 w-3.5 mr-1" />Auditoria</TabsTrigger>
          <TabsTrigger value="landing"><FileText className="h-3.5 w-3.5 mr-1" />Página Pública</TabsTrigger>
        </TabsList>

        {/* CONFIG */}
        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Regras do programa</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {cfgLoading || !draft ? <Skeleton className="h-64 w-full" /> : (
                <>
                  <Row label="Programa ativo">
                    <Switch checked={!!draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
                  </Row>
                  <Row label="Comissão (%)">
                    <Input type="number" step="0.1" value={draft.commission_pct ?? 0} onChange={(e) => setDraft({ ...draft, commission_pct: Number(e.target.value) })} className="w-32" />
                  </Row>
                  <Row label="Janela de tracking (dias)">
                    <Input type="number" value={draft.tracking_window_days ?? 90} onChange={(e) => setDraft({ ...draft, tracking_window_days: Number(e.target.value) })} className="w-32" />
                  </Row>
                  <Row label="Comissão só na primeira assinatura">
                    <Switch checked={!!draft.commission_only_first_subscription} onCheckedChange={(v) => setDraft({ ...draft, commission_only_first_subscription: v })} />
                  </Row>
                  <Row label="Saque mínimo (R$)">
                    <Input type="number" step="1" value={draft.withdraw_min_amount ?? 250} onChange={(e) => setDraft({ ...draft, withdraw_min_amount: Number(e.target.value) })} className="w-32" />
                  </Row>
                  <Row label="Saques por mês">
                    <Input type="number" value={draft.withdraw_monthly_limit ?? 3} onChange={(e) => setDraft({ ...draft, withdraw_monthly_limit: Number(e.target.value) })} className="w-32" />
                  </Row>
                  <Row label="Prazo de processamento (dias úteis)">
                    <Input type="number" value={draft.withdraw_processing_business_days ?? 7} onChange={(e) => setDraft({ ...draft, withdraw_processing_business_days: Number(e.target.value) })} className="w-32" />
                  </Row>
                  <Row label="Antifraude: bloquear autoindicação">
                    <Switch checked={!!draft.antifraud_block_self} onCheckedChange={(v) => setDraft({ ...draft, antifraud_block_self: v })} />
                  </Row>
                  <Row label="Antifraude: bloquear mesmo dispositivo">
                    <Switch checked={!!draft.antifraud_block_same_device} onCheckedChange={(v) => setDraft({ ...draft, antifraud_block_same_device: v })} />
                  </Row>
                  <Row label="Antifraude: bloquear mesmo IP">
                    <Switch checked={!!draft.antifraud_block_same_ip} onCheckedChange={(v) => setDraft({ ...draft, antifraud_block_same_ip: v })} />
                  </Row>
                  <Row label="Ranking público habilitado">
                    <Switch checked={!!draft.public_ranking_enabled} onCheckedChange={(v) => setDraft({ ...draft, public_ranking_enabled: v })} />
                  </Row>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={saveCfg.isPending || diff.length === 0}
                    className="w-full"
                  >
                    {diff.length === 0 ? "Sem alterações" : `Salvar (${diff.length} alteraç${diff.length === 1 ? "ão" : "ões"})`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar alterações</AlertDialogTitle>
                <AlertDialogDescription>
                  Estas alterações afetam o programa para todos os usuários.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="max-h-64 overflow-auto rounded-md border border-border/40 p-2 text-xs space-y-1">
                {diff.map(d => (
                  <div key={d.k} className="flex items-center justify-between gap-2 border-b border-border/30 last:border-0 py-1">
                    <span className="font-mono text-muted-foreground">{d.k}</span>
                    <span className="flex items-center gap-1">
                      <span className="line-through text-muted-foreground">{String(d.from)}</span>
                      <span>→</span>
                      <span className="font-semibold text-primary">{String(d.to)}</span>
                    </span>
                  </div>
                ))}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saveCfg.isPending}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => draft && saveCfg.mutate(draft)} disabled={saveCfg.isPending}>
                  {saveCfg.isPending ? "Salvando..." : "Confirmar e salvar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* SAQUES */}
        <TabsContent value="withdrawals" className="mt-4">
          <WithdrawalsQueue />
        </TabsContent>

        {/* ANTIFRAUDE */}
        <TabsContent value="antifraud" className="mt-4">
          <AntifraudPanel />
        </TabsContent>

        {/* AUDITORIA */}
        <TabsContent value="audit" className="mt-4">
          <AuditLogPanel />
        </TabsContent>

        <TabsContent value="landing" className="mt-4">
          <ReferralsLandingEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WithdrawalsQueue() {
  const [status, setStatus] = useState<string>("pending");
  const { data: rows = [], isLoading } = useWithdrawals(status);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: string; reason?: string }) => {
      const { error } = await (supabase as any).rpc("referral_admin_resolve_withdrawal", {
        p_withdrawal_id: id, p_action: action, p_reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saque atualizado" });
      qc.invalidateQueries({ queryKey: ["admin-referral-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["admin-referral-metrics"] });
      qc.invalidateQueries({ queryKey: ["admin-referral-audit"] });
      setNoteFor(null); setNote(""); setConfirmApprove(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">Fila de saques</CardTitle>
        <div className="flex gap-1 flex-wrap">
          {["pending", "approved", "paid", "rejected"].map(s => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {s}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhum saque {status}.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((w: any) => (
              <div key={w.id} className="rounded-lg border border-border/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{w.display_name || w.username || w.user_id.slice(0, 8)}</p>
                      <Badge variant="outline" className="text-[10px]">{w.user_plan}</Badge>
                      <Badge variant={w.status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px]">{w.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">PIX: {w.pix_key}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(w.created_at).toLocaleString("pt-BR")}</p>
                    {w.rejection_reason && (
                      <p className="text-xs italic text-destructive mt-1">Motivo: {w.rejection_reason}</p>
                    )}
                  </div>
                  <p className="text-lg font-bold text-primary shrink-0">{fmt(w.amount)}</p>
                </div>
                {status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="default" onClick={() => setConfirmApprove(w.id)} disabled={resolve.isPending}>
                      <Check className="h-3.5 w-3.5 mr-1" />Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setNoteFor(w.id)} disabled={resolve.isPending}>
                      <X className="h-3.5 w-3.5 mr-1" />Rejeitar
                    </Button>
                  </div>
                )}
                {status === "approved" && (
                  <Button size="sm" onClick={() => resolve.mutate({ id: w.id, action: "paid" })} disabled={resolve.isPending}>
                    <Send className="h-3.5 w-3.5 mr-1" />Marcar como pago
                  </Button>
                )}
                {noteFor === w.id && (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <Textarea placeholder="Motivo da rejeição (obrigatório)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="destructive" onClick={() => resolve.mutate({ id: w.id, action: "reject", reason: note })} disabled={resolve.isPending || !note.trim()}>
                        Confirmar rejeição
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNote(""); }}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <AlertDialog open={!!confirmApprove} onOpenChange={(o) => !o && setConfirmApprove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Aprovar saque?</AlertDialogTitle>
              <AlertDialogDescription>
                O saque será marcado como aprovado e o usuário será notificado. Esta ação fica registrada no log de auditoria.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resolve.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmApprove && resolve.mutate({ id: confirmApprove, action: "approve" })}
                disabled={resolve.isPending}
              >
                Aprovar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function AntifraudPanel() {
  const { data: events = [], isLoading } = useAntifraudEvents();
  const [type, setType] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const types = useMemo(() => Array.from(new Set(events.map((e: any) => e.event_type))).sort(), [events]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return events.filter((e: any) => {
      if (type !== "all" && e.event_type !== type) return false;
      if (severity !== "all" && e.severity !== severity) return false;
      if (!s) return true;
      return (
        (e.inviter_user_id || "").toLowerCase().includes(s) ||
        (e.referred_user_id || "").toLowerCase().includes(s) ||
        e.event_type.toLowerCase().includes(s) ||
        JSON.stringify(e.details || {}).toLowerCase().includes(s)
      );
    });
  }, [events, type, severity, search]);

  const sevColor = (s: string) =>
    s === "critical" ? "destructive" : s === "high" ? "destructive" : s === "medium" ? "default" : "secondary";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Eventos antifraude</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7 h-9" placeholder="Buscar (id, tipo, payload)" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {types.map(t => <SelectItem key={t as string} value={t as string}>{t as string}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Severidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda severidade</SelectItem>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="high">high</SelectItem>
              <SelectItem value="critical">critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhum evento encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Data</th><th>Severidade</th><th>Tipo</th><th>Inviter</th><th>Referido</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => (
                  <tr key={e.id} className="border-b border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(e)}>
                    <td className="py-1.5 whitespace-nowrap">{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                    <td><Badge variant={sevColor(e.severity) as any} className="text-[10px]">{e.severity}</Badge></td>
                    <td><Badge variant="outline" className="text-[10px]">{e.event_type}</Badge></td>
                    <td className="font-mono text-[10px] truncate max-w-[100px]">{e.inviter_user_id?.slice(0, 8) || '—'}</td>
                    <td className="font-mono text-[10px] truncate max-w-[100px]">{e.referred_user_id?.slice(0, 8) || '—'}</td>
                    <td className="text-right">{e.resolved ? <Badge variant="secondary" className="text-[10px]">resolvido</Badge> : <Badge variant="destructive" className="text-[10px]">aberto</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalhes do evento</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-3 text-xs">
                <DetailRow label="Data" value={new Date(selected.created_at).toLocaleString("pt-BR")} />
                <DetailRow label="Tipo" value={selected.event_type} />
                <DetailRow label="Severidade" value={selected.severity} />
                <DetailRow label="Inviter" value={selected.inviter_user_id || '—'} mono />
                <DetailRow label="Referido" value={selected.referred_user_id || '—'} mono />
                <DetailRow label="Resolvido" value={selected.resolved ? 'sim' : 'não'} />
                {selected.resolved_at && <DetailRow label="Resolvido em" value={new Date(selected.resolved_at).toLocaleString("pt-BR")} />}
                <div>
                  <p className="text-muted-foreground mb-1">Detalhes (payload)</p>
                  <pre className="bg-muted/50 rounded p-2 overflow-auto max-h-64 text-[10px]">
                    {JSON.stringify(selected.details || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function AuditLogPanel() {
  const { data: rows = [], isLoading } = useAuditLog();
  const [entity, setEntity] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (entity !== "all" && r.entity_type !== entity) return false;
      if (!s) return true;
      return (
        (r.actor_label || "").toLowerCase().includes(s) ||
        (r.entity_id || "").toLowerCase().includes(s) ||
        r.action.toLowerCase().includes(s)
      );
    });
  }, [rows, entity, search]);

  const actionColor = (a: string) =>
    a === "reject" ? "destructive" : a === "approve" || a === "paid" ? "default" : "secondary";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auditoria — config e saques</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7 h-9" placeholder="Buscar (autor, id, ação)" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Entidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="config">Config singleton</SelectItem>
              <SelectItem value="withdrawal">Saques</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Sem registros de auditoria.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Data</th><th>Autor</th><th>Entidade</th><th>Ação</th><th>ID</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                    <td className="py-1.5 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                    <td className="truncate max-w-[120px]">{r.actor_label}</td>
                    <td><Badge variant="outline" className="text-[10px]">{r.entity_type}</Badge></td>
                    <td><Badge variant={actionColor(r.action) as any} className="text-[10px]">{r.action}</Badge></td>
                    <td className="font-mono text-[10px] truncate max-w-[120px]">{r.entity_id}</td>
                    <td className="text-muted-foreground truncate max-w-[200px]">{r.note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registro de auditoria</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-3 text-xs">
                <DetailRow label="Data" value={new Date(selected.created_at).toLocaleString("pt-BR")} />
                <DetailRow label="Autor" value={selected.actor_label} />
                <DetailRow label="ID do autor" value={selected.actor_id || '—'} mono />
                <DetailRow label="Entidade" value={selected.entity_type} />
                <DetailRow label="ID da entidade" value={selected.entity_id || '—'} mono />
                <DetailRow label="Ação" value={selected.action} />
                {selected.note && <DetailRow label="Nota" value={selected.note} />}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground mb-1">Antes</p>
                    <pre className="bg-muted/50 rounded p-2 overflow-auto max-h-64 text-[10px]">
                      {JSON.stringify(selected.before_data || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Depois</p>
                    <pre className="bg-muted/50 rounded p-2 overflow-auto max-h-64 text-[10px]">
                      {JSON.stringify(selected.after_data || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border/30 pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-[10px] break-all text-right" : "text-right"}>{value}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function Kpi({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/40" : ""}>
      <CardContent className="pt-3 pb-2">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon}{label}</div>
        <div className="text-base font-bold mt-0.5">{value}</div>
      </CardContent>
    </Card>
  );
}
