import { useState } from "react";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Banknote,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ArrowDownToLine,
  ShieldCheck,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "@/hooks/use-toast";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { icon: <Clock className="h-3.5 w-3.5" />, label: "Pendente", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
  approved: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Aprovado", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Enviado", color: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" },
  paid: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Pago", color: "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" },
  rejected: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Rejeitado", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

async function callCreatorPayout(action: string, withdrawal_id: string, admin_notes?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Não autenticado");

  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/creator-payout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, withdrawal_id, admin_notes }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || "Erro na requisição");
  return json;
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  platform_fee: number;
  net_amount: number;
  pix_key_type: string;
  pix_key: string;
  status: string;
  admin_notes: string | null;
  asaas_transfer_id: string | null;
  asaas_transfer_status: string | null;
  created_at: string;
  creator_name?: string;
}

export function AdminWithdrawalsPanel() {
  const queryClient = useQueryClient();
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["admin-withdrawal-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      
      // Fetch creator names
      const userIds = [...new Set((data || []).map((w: any) => w.user_id))] as string[];
      if (userIds.length === 0) return [];
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, username")
        .in("user_id", userIds);
      
      const nameMap = new Map<string, string>();
      (profiles || []).forEach((p: any) => {
        nameMap.set(p.user_id, p.name || p.username || "Criador");
      });
      
      return (data || []).map((w: any) => ({
        ...w,
        creator_name: nameMap.get(w.user_id) || "Criador",
      })) as Withdrawal[];
    },
    staleTime: 30_000,
  });

  const processMutation = useMutation({
    mutationFn: async ({ action, withdrawal_id, admin_notes }: { action: string; withdrawal_id: string; admin_notes?: string }) => {
      return callCreatorPayout(action, withdrawal_id, admin_notes);
    },
    onSuccess: (data) => {
      const msg = action === "approve"
        ? `✅ Saque aprovado e PIX enviado! ${data.transfer?.id ? `ID: ${data.transfer.id}` : ""}`
        : "❌ Saque rejeitado";
      toast({ title: msg });
      setSelectedWithdrawal(null);
      setAction(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawal-requests"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const handleProcess = () => {
    if (!selectedWithdrawal || !action) return;
    processMutation.mutate({
      action,
      withdrawal_id: selectedWithdrawal.id,
      admin_notes: adminNotes || undefined,
    });
  };

  const pendingCount = withdrawals.filter((w) => w.status === "pending").length;

  return (
    <>
      <Card className="gradient-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-[hsl(45,93%,47%)]" />
              Solicitações de Saque
            </div>
            {pendingCount > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : withdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma solicitação de saque
            </p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {withdrawals.map((w) => {
                const cfg = statusConfig[w.status] || statusConfig.pending;
                const creatorName = w.creator_name || "Criador";
                return (
                  <div
                    key={w.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      w.status === "pending"
                        ? "bg-yellow-500/5 border-yellow-500/20 hover:border-yellow-500/40 cursor-pointer"
                        : "bg-muted/10 border-border/30"
                    }`}
                    onClick={() => {
                      if (w.status === "pending") {
                        setSelectedWithdrawal(w);
                        setAction(null);
                        setAdminNotes("");
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {creatorName}
                          </p>
                          <Badge variant="outline" className={`gap-1 shrink-0 text-[10px] ${cfg.color}`}>
                            {cfg.icon}
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>PIX {w.pix_key_type.toUpperCase()}: {w.pix_key}</span>
                          <span>•</span>
                          <span>{new Date(w.created_at).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-[hsl(142,76%,36%)]">{fmt(w.net_amount)}</p>
                        <p className="text-[10px] text-muted-foreground">bruto: {fmt(w.amount)}</p>
                      </div>
                    </div>
                    {w.asaas_transfer_id && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Asaas: {w.asaas_transfer_id} ({w.asaas_transfer_status})
                      </p>
                    )}
                    {w.admin_notes && (
                      <p className="text-[10px] text-muted-foreground mt-1 italic">
                        Nota: {w.admin_notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Process Modal */}
      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => !open && setSelectedWithdrawal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-[hsl(45,93%,47%)]" />
              Processar Saque
            </DialogTitle>
            <DialogDescription>
              Aprovar enviará PIX automaticamente para a chave do criador via Asaas.
            </DialogDescription>
          </DialogHeader>

          {selectedWithdrawal && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Criador</span>
                  <span className="font-medium">{selectedWithdrawal.creator_name || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor líquido</span>
                  <span className="font-bold text-[hsl(142,76%,36%)]">{fmt(selectedWithdrawal.net_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Chave PIX</span>
                  <span className="font-medium">{selectedWithdrawal.pix_key}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">{selectedWithdrawal.pix_key_type.toUpperCase()}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Nota do admin (opcional)</label>
                <Input
                  placeholder="Observação..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  disabled={processMutation.isPending}
                />
              </div>

              {action === "approve" && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs">
                  <p className="font-medium text-yellow-500 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Confirmação
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Confirmar envio de <strong className="text-foreground">{fmt(selectedWithdrawal.net_amount)}</strong> via PIX
                    para <strong className="text-foreground">{selectedWithdrawal.pix_key}</strong>?
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {action === "approve" ? (
              <Button
                onClick={handleProcess}
                disabled={processMutation.isPending}
                className="w-full gap-2 bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(152,60%,30%)] hover:opacity-90"
              >
                {processMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Enviando PIX...</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" /> Confirmar e Enviar PIX</>
                )}
              </Button>
            ) : (
              <div className="flex gap-2 w-full">
                <Button
                  onClick={() => setAction("approve")}
                  className="flex-1 gap-1.5 bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(152,60%,30%)] hover:opacity-90"
                  disabled={processMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" /> Aprovar
                </Button>
                <Button
                  onClick={() => {
                    setAction("reject");
                    processMutation.mutate({
                      action: "reject",
                      withdrawal_id: selectedWithdrawal!.id,
                      admin_notes: adminNotes || undefined,
                    });
                  }}
                  variant="destructive"
                  className="flex-1 gap-1.5"
                  disabled={processMutation.isPending}
                >
                  {processMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Rejeitar
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full text-xs"
              onClick={() => { setSelectedWithdrawal(null); setAction(null); }}
              disabled={processMutation.isPending}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
