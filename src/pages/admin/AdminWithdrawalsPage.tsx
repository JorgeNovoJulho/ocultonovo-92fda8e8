import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import {
  Banknote,
  Copy,
  Check,
  XCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Zap } from "lucide-react";

interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  platform_fee: number;
  net_amount: number;
  pix_key_type: string;
  pix_key: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { name: string | null; username: string | null; avatar_url: string | null };
}

const PAGE_SIZE = 20;

export default function AdminWithdrawalsPage() {
  const queryClient = useQueryClient();
  const { data: isMaster } = useIsMasterAdmin();

  const forceReleaseMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("release_due_balances_force_admin", {
        p_creator_id: null,
      });
      if (error) throw error;
      return data as { released_count: number; released_total: number; skipped_blocked: number };
    },
    onSuccess: (res) => {
      toast({
        title: "Liberação executada",
        description: `${res.released_count} liberações · R$ ${Number(res.released_total || 0).toFixed(2)} · ${res.skipped_blocked} bloqueadas`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Falha na liberação", description: err.message, variant: "destructive" });
    },
  });
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [page, setPage] = useState(0);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const updatingRef = useRef(false);

  // Fetch withdrawals with profile join
  const { data, isLoading } = useQuery({
    queryKey: ["admin-withdrawals", statusFilter, page],
    queryFn: async () => {
      let q = (supabase as any)
        .from("withdrawal_requests")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data: rows, error, count } = await q;
      if (error) throw error;

      // Batch resolve profiles (withdrawal_requests.user_id may be auth uuid or profile id)
      const list = (rows || []) as any[];
      const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))];
      let profilesData: any[] = [];
      if (userIds.length) {
        const idList = userIds.join(',');
        const { data: pd } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, name, username, avatar_url')
          .or(`id.in.(${idList}),user_id.in.(${idList})`);
        profilesData = pd || [];
      }
      const profileMap = new Map<string, any>();
      profilesData.forEach((p: any) => {
        if (p.id) profileMap.set(p.id, p);
        if (p.user_id) profileMap.set(p.user_id, p);
      });

      const enriched = list.map((r) => ({ ...r, profiles: profileMap.get(r.user_id) || null }));
      return { rows: enriched as WithdrawalRow[], total: count || 0 };
    },
    staleTime: 30_000,
  });

  // Fetch platform fee totals
  const { data: feeStats } = useQuery({
    queryKey: ["admin-withdrawal-fees"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("withdrawal_requests")
        .select("platform_fee, status");
      if (error) throw error;
      const rows = (data || []) as { platform_fee: number; status: string }[];
      const totalFees = rows.reduce((sum, r) => sum + (r.platform_fee || 0), 0);
      const completedFees = rows.filter(r => r.status === "completed" || r.status === "approved" || r.status === "paid").reduce((sum, r) => sum + (r.platform_fee || 0), 0);
      const pendingCount = rows.filter(r => r.status === "pending").length;
      return { totalFees, completedFees, pendingCount };
    },
    staleTime: 60_000,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (updatingRef.current) throw new Error("already_updating");
      updatingRef.current = true;

      try {
        const { error } = await (supabase as any)
          .from("withdrawal_requests")
          .update({ status: "paid", reviewed_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;

        const { data: wd } = await (supabase as any)
          .from("withdrawal_requests")
          .select("user_id, net_amount")
          .eq("id", id)
          .single();

        if (wd) {
          await (supabase as any).from("notifications").insert({
            user_id: wd.user_id,
            type: "withdrawal_completed",
            title: "💰 Saque Realizado!",
            body: `Seu saque de R$ ${Number(wd.net_amount).toFixed(2)} foi processado via PIX.`,
          }).catch(() => {});
        }
      } finally {
        updatingRef.current = false;
      }
    },
    onSuccess: () => {
      toast({ title: "Saque marcado como pago!" });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawal-fees"] });
    },
    onError: (err: Error) => {
      if (err.message === "already_updating") return;
      toast({ title: "Erro ao aprovar saque. Verifique sua conexão e tente novamente.", variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from("withdrawal_requests")
        .update({ status: "rejected", admin_notes: reason, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saque rejeitado" });
      setRejectId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawal-fees"] });
    },
    onError: () => toast({ title: "Erro ao rejeitar saque", variant: "destructive" }),
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    pending: { icon: <Clock className="h-3.5 w-3.5" />, label: "Pendente", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
    approved: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Aprovado", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
    completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Pago", color: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" },
    paid: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Pago", color: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" },
    rejected: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Rejeitado", color: "bg-destructive/10 text-destructive border-destructive/30" },
  };

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(45,93%,47%)]/20 to-[hsl(35,93%,47%)]/20">
            <Banknote className="h-6 w-6 text-[hsl(45,93%,47%)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestão de Saques</h1>
            <p className="text-muted-foreground">Gerencie as solicitações de saque dos criadores VIP</p>
          </div>
        </div>
        {isMaster && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-[hsl(45,93%,47%)]/40 text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10">
                <Zap className="h-4 w-4" />
                Forçar liberação D+7
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forçar liberação D+7?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vai liberar TODOS os saldos pendentes elegíveis (sem chargeback/refund), inclusive os que ainda não venceram.
                  A ação fica registrada nos logs de auditoria.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => forceReleaseMutation.mutate()}
                  disabled={forceReleaseMutation.isPending}
                >
                  {forceReleaseMutation.isPending ? "Liberando..." : "Confirmar liberação"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[hsl(45,93%,47%)]/5 border-[hsl(45,93%,47%)]/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[hsl(45,93%,47%)] mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Taxas Acumuladas (Total)</span>
            </div>
            <p className="text-2xl font-bold text-[hsl(45,93%,47%)]">
              {feeStats ? formatCurrency(feeStats.totalFees) : <Skeleton className="h-8 w-24 inline-block" />}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[hsl(142,76%,36%)] mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium">Taxas (Pagos)</span>
            </div>
            <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">
              {feeStats ? formatCurrency(feeStats.completedFees) : <Skeleton className="h-8 w-24 inline-block" />}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-500/5 border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-yellow-500 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-yellow-500">
              {feeStats ? feeStats.pendingCount : <Skeleton className="h-8 w-12 inline-block" />}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
            <SelectItem value="rejected">Rejeitados</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} resultado(s)</span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum pedido de saque {statusFilter !== "all" ? statusFilter : ""} no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((w) => {
            const cfg = statusConfig[w.status] || statusConfig.pending;
            const creatorName = w.profiles?.name || w.profiles?.username || "Criador";
            return (
              <Card key={w.id} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground truncate">{creatorName}</p>
                        <Badge variant="outline" className={`gap-1 text-xs ${cfg.color}`}>
                          {cfg.icon}
                          {cfg.label}
                        </Badge>
                      </div>
                      <p className="text-lg font-bold text-[hsl(45,93%,47%)]">{formatCurrency(w.net_amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        Bruto: {formatCurrency(w.amount)} • Taxa: {formatCurrency(w.platform_fee)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          PIX ({w.pix_key_type.toUpperCase()}): <strong className="font-bold font-mono text-foreground text-sm">{w.pix_key}</strong>
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(w.pix_key, w.id)}
                        >
                          {copiedId === w.id ? <Check className="h-3 w-3 text-[hsl(142,76%,36%)]" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.created_at).toLocaleDateString("pt-BR")} às {new Date(w.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {w.admin_notes && (
                        <p className="text-xs text-destructive mt-1">Motivo: {w.admin_notes}</p>
                      )}
                    </div>

                    {w.status === "pending" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          className="bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,30%)] text-white gap-1"
                          onClick={() => approveMutation.mutate(w.id)}
                          disabled={approveMutation.isPending}
                        >
                          {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Pago
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-1"
                          onClick={() => setRejectId(w.id)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Próxima
          </Button>
        </div>
      )}

      {/* Reject Modal */}
      <Dialog open={!!rejectId} onOpenChange={(open) => { if (!open) { setRejectId(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Rejeitar Saque
            </DialogTitle>
            <DialogDescription>Informe o motivo da rejeição para o criador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                placeholder="Ex: Chave PIX inválida, dados inconsistentes..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              variant="destructive"
              disabled={rejectMutation.isPending || !rejectReason.trim()}
              onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason.trim() })}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Rejeição
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
