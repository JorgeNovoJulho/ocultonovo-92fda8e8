import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  AlertCircle,
  TrendingUp,
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
import { toast } from "@/hooks/use-toast";

interface RiskRow {
  request_id: string;
  user_id: string;
  user_name: string | null;
  user_username: string | null;
  requested_amount: number;
  justification: string;
  status: string;
  risk_level: string;
  risk_percentage: number;
  total_platform_balance: number;
  admin_notes: string | null;
  is_used: boolean;
  created_at: string;
}

const riskConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  high: { label: "ALTO RISCO", color: "bg-destructive/10 text-destructive border-destructive/30", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  moderate: { label: "RISCO MODERADO", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  low: { label: "BAIXO RISCO", color: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { label: "Aprovado", color: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected: { label: "Negado", color: "bg-destructive/10 text-destructive border-destructive/30", icon: <XCircle className="h-3.5 w-3.5" /> },
};

export default function AdminSpecialRequestsPage() {
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin-special-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("analyze_withdrawal_risk");
      if (error) throw error;
      return (data || []) as RiskRow[];
    },
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("withdrawal_exceptions")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // Find request to notify user
      const req = requests.find(r => r.request_id === id);
      if (req) {
        await (supabase as any).from("notifications").insert({
          user_id: req.user_id,
          type: "exception_approved",
          title: "✅ Limite Especial Aprovado!",
          body: `Seu pedido de limite especial de R$ ${Number(req.requested_amount).toFixed(2)} foi aprovado. Você pode usá-lo no próximo saque.`,
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      toast({ title: "Limite especial aprovado!" });
      queryClient.invalidateQueries({ queryKey: ["admin-special-requests"] });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from("withdrawal_exceptions")
        .update({ status: "rejected", admin_notes: reason, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      const req = requests.find(r => r.request_id === id);
      if (req) {
        await (supabase as any).from("notifications").insert({
          user_id: req.user_id,
          type: "exception_rejected",
          title: "❌ Limite Especial Negado",
          body: `Seu pedido de limite especial foi negado. Motivo: ${reason}`,
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      toast({ title: "Solicitação negada" });
      setRejectId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-special-requests"] });
    },
    onError: () => toast({ title: "Erro ao negar", variant: "destructive" }),
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const pendingRequests = requests.filter(r => r.status === "pending");
  const platformBalance = requests[0]?.total_platform_balance || 0;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-destructive/20 to-yellow-500/20">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Solicitações Especiais</h1>
          <p className="text-muted-foreground">Análise de risco e aprovação de limites excepcionais</p>
        </div>
      </div>

      {/* Platform Balance Context */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Saldo Total da Plataforma</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(platformBalance)}</p>
          </div>
          <Badge variant="outline" className="ml-auto">
            {pendingRequests.length} pendente(s)
          </Badge>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : requests.length === 0 ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma solicitação especial no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const risk = riskConfig[r.risk_level] || riskConfig.low;
            const status = statusConfig[r.status] || statusConfig.pending;
            const creatorName = r.user_name || r.user_username || "Criador";

            return (
              <Card key={r.request_id} className="bg-card/50 border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground">{creatorName}</p>
                        <Badge variant="outline" className={`gap-1 text-xs ${status.color}`}>
                          {status.icon} {status.label}
                        </Badge>
                        <Badge variant="outline" className={`gap-1 text-xs ${risk.color}`}>
                          {risk.icon} {risk.label}
                        </Badge>
                      </div>
                      <p className="text-lg font-bold text-[hsl(45,93%,47%)]">{formatCurrency(r.requested_amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.risk_percentage}% do saldo total da plataforma
                      </p>
                    </div>

                    {r.is_used && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">
                        Já utilizado
                      </Badge>
                    )}
                  </div>

                  {/* Justification */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                    <p className="text-xs text-muted-foreground mb-1">Justificativa:</p>
                    <p className="text-sm text-foreground">{r.justification}</p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Solicitado em {new Date(r.created_at).toLocaleDateString("pt-BR")} às{" "}
                    {new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>

                  {r.admin_notes && (
                    <p className="text-xs text-destructive">Motivo da negação: {r.admin_notes}</p>
                  )}

                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,30%)] text-white gap-1"
                        onClick={() => approveMutation.mutate(r.request_id)}
                        disabled={approveMutation.isPending}
                      >
                        {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Aprovar Limite Único
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-1"
                        onClick={() => setRejectId(r.request_id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Negar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      <Dialog open={!!rejectId} onOpenChange={(open) => { if (!open) { setRejectId(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Negar Solicitação Especial
            </DialogTitle>
            <DialogDescription>Informe o motivo da negação para o criador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                placeholder="Ex: Valor muito alto para o volume atual..."
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
              Confirmar Negação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
