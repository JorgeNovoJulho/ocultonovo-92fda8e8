import { useState, useCallback } from "react";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { Card, CardContent } from "@/components/ui/card";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet,
  ArrowDownToLine,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  RefreshCw,
  Banknote,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "@/hooks/use-toast";
import { useAdminBypass } from "@/hooks/useAdminBypass";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

async function callPayoutFn(action: string, extra?: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Não autenticado");

  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/admin-payout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, ...extra }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || "Erro na requisição");
  return json;
}

export function AdminPayoutCard() {
  const queryClient = useQueryClient();
  const { shouldBypass } = useAdminBypass();
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  // ── Balance query ──────────────────────────────────────────────────────
  const { data: balance, isLoading: loadingBalance, refetch: refetchBalance } = useQuery({
    queryKey: ["admin-asaas-balance"],
    queryFn: () => callPayoutFn("get-balance"),
    staleTime: 60_000,
    enabled: shouldBypass,
  });

  // ── Transfer mutation ──────────────────────────────────────────────────
  const transferMutation = useMutation({
    mutationFn: async (value: number) => {
      const result = await callPayoutFn("create-transfer", { amount: value });
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Saque solicitado com sucesso",
        description: `Transferência de ${fmt(data.transfer?.value || 0)} criada. Status: ${data.transfer?.status || "pendente"}`,
      });
      setShowModal(false);
      setAmount("");
      setConfirmStep(false);
      queryClient.invalidateQueries({ queryKey: ["admin-asaas-balance"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Erro no saque",
        description: err.message,
        variant: "destructive",
      });
      setConfirmStep(false);
    },
  });

  const handleOpenModal = useCallback(() => {
    setAmount("");
    setConfirmStep(false);
    setShowModal(true);
  }, []);

  const handleConfirm = useCallback(() => {
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    if (value > (balance?.balance || 0)) {
      toast({ title: "Valor excede o saldo disponível", variant: "destructive" });
      return;
    }
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    transferMutation.mutate(value);
  }, [amount, balance, confirmStep, transferMutation]);

  const available = balance?.balance ?? 0;
  const pending = balance?.statistics?.pending ?? 0;
  const canWithdraw = shouldBypass && available > 0;

  if (!shouldBypass) return null;

  return (
    <>
      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="relative overflow-hidden border-0">
          <div className="absolute inset-0 rounded-lg p-[1.5px] bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(170,60%,40%)] -z-10" />
          <div className="bg-card rounded-[calc(0.5rem-1.5px)]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-[hsl(142,76%,36%)]" />
                  <span className="text-sm font-medium text-[hsl(142,76%,36%)] tracking-wide">
                    Saldo Disponível
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => refetchBalance()}
                  disabled={loadingBalance}
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loadingBalance ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {loadingBalance ? (
                <Skeleton className="h-9 w-32" />
              ) : balance?.success === false ? (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">{balance.message || "Erro ao consultar"}</span>
                </div>
              ) : (
                <p className="text-3xl font-bold text-[hsl(142,76%,36%)] tracking-tight">
                  {fmt(available)}
                </p>
              )}
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-muted-foreground">Gateway Asaas · PIX</p>
                <Button
                  size="sm"
                  disabled={!canWithdraw || transferMutation.isPending}
                  onClick={handleOpenModal}
                  className="h-8 gap-1.5 text-xs bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(152,60%,30%)] hover:opacity-90"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Saque Instantâneo
                </Button>
              </div>
            </CardContent>
          </div>
        </Card>

        <Card className="relative overflow-hidden border-0">
          <div className="absolute inset-0 rounded-lg p-[1.5px] bg-gradient-to-r from-blue-500 to-blue-600 -z-10" />
          <div className="bg-card rounded-[calc(0.5rem-1.5px)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-medium text-blue-400 tracking-wide">
                  Saldo a Receber
                </span>
              </div>
              {loadingBalance ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <p className="text-3xl font-bold text-blue-400 tracking-tight">
                  {fmt(pending)}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Pagamentos em compensação
              </p>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Transfer Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-[hsl(142,76%,36%)]" />
              Saque Instantâneo
            </DialogTitle>
            <DialogDescription>
              Transferência PIX para sua conta bancária cadastrada no Asaas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Available info */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground">Saldo disponível</p>
              <p className="text-xl font-bold text-[hsl(142,76%,36%)]">{fmt(available)}</p>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Valor do saque (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setConfirmStep(false);
                }}
                className="h-10 text-lg font-bold"
                disabled={transferMutation.isPending}
              />
            </div>

            {/* Fee info */}
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
              <p className="font-medium text-blue-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Informações da transferência
              </p>
              <p className="text-muted-foreground">• PIX: <strong className="text-foreground">Gratuito</strong></p>
              <p className="text-muted-foreground">• Conta destino: configurada no Asaas (somente leitura)</p>
              <p className="text-muted-foreground">• Prazo: instantâneo (dias úteis)</p>
            </div>

            {/* Confirm step */}
            {confirmStep && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs">
                <p className="font-medium text-yellow-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Confirmação final
                </p>
                <p className="text-muted-foreground mt-1">
                  Tem certeza que deseja sacar{" "}
                  <strong className="text-foreground">
                    {fmt(parseFloat(amount.replace(",", ".")) || 0)}
                  </strong>
                  ? Esta ação não pode ser desfeita.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={handleConfirm}
              disabled={transferMutation.isPending || !amount}
              className={`w-full gap-2 ${
                confirmStep
                  ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-black"
                  : "bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(152,60%,30%)]"
              } hover:opacity-90`}
            >
              {transferMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processando…
                </>
              ) : transferMutation.isSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Concluído!
                </>
              ) : confirmStep ? (
                <>
                  <ShieldCheck className="h-4 w-4" /> Confirmar Saque
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-4 w-4" /> Solicitar Saque
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-xs"
              onClick={() => setShowModal(false)}
              disabled={transferMutation.isPending}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
