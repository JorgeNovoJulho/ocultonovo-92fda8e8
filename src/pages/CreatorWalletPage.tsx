/**
 * Dashboard Financeiro para Criadores VIP
 * Exibe saldo, taxas, saques e chave PIX
 */
import { useState, useEffect } from "react";
import { 
  Wallet, 
  Banknote,
  Key,
  Percent,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  CircleDollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useProfile } from "@/hooks/useProfile";
import { useAdminBypass } from "@/hooks/useAdminBypass";
import { useCreatorWallet } from "@/hooks/useCreatorWallet";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

const PLATFORM_FEE = 0.20;

export default function CreatorWalletPage() {
  const { profile, isLoading } = useProfile();
  const { shouldBypass } = useAdminBypass();
  const {
    withdrawals,
    savePixKey,
    isSavingPix,
    requestWithdrawal,
    isRequesting,
    limits,
    hasPendingException,
    hasApprovedUnusedException,
    requestException,
    isRequestingException,
  } = useCreatorWallet();

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionAmount, setExceptionAmount] = useState('');
  const [exceptionJustification, setExceptionJustification] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKeyType, setPixKeyType] = useState('cpf');
  const [pixKey, setPixKey] = useState('');

  const isVip = shouldBypass || profile?.plan_type === 'vip';

  // Load saved PIX key from profile
  useEffect(() => {
    if (profile) {
      const p = profile as any;
      if (p.pix_key_type) setPixKeyType(p.pix_key_type);
      if (p.pix_key) setPixKey(p.pix_key);
    }
  }, [profile]);

  if (!isLoading && !isVip) {
    return (
      <div className="p-4 md:p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-20 h-20 rounded-full bg-[hsl(45,93%,47%)]/10 flex items-center justify-center mb-6">
          <Wallet className="h-10 w-10 text-[hsl(45,93%,47%)]" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2 text-center">
          Carteira do Criador
        </h1>
        <p className="text-muted-foreground text-center max-w-sm mb-6">
          Gerencie seus ganhos e solicite saques. Exclusivo para criadores VIP.
        </p>
        <Link to="/checkout?plan=monthly&amount=145.90">
          <Button className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-semibold gap-2">
            <Wallet className="h-5 w-5" />
            Tornar-se VIP
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const grossBalance = profile?.balance || 0;
  const platformFee = grossBalance * PLATFORM_FEE;
  const netBalance = grossBalance - platformFee;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleWithdraw = () => {
    const value = parseFloat(withdrawAmount);
    if (isNaN(value) || value < 250) {
      toast({ title: 'Valor mínimo de saque: R$ 250,00', variant: 'destructive' });
      return;
    }
    if (value > netBalance) {
      toast({ title: 'Saldo insuficiente', variant: 'destructive' });
      return;
    }
    if (!limits.canWithdraw) {
      toast({ title: limits.monthlyRemaining <= 0 ? 'Limite de 4 saques mensais atingido' : 'Limite diário de R$ 1.000,00 atingido', variant: 'destructive' });
      return;
    }
    if (value > limits.dailyRemaining) {
      toast({ title: `Limite diário restante: ${formatCurrency(limits.dailyRemaining)}`, variant: 'destructive' });
      return;
    }
    if (!pixKey.trim()) {
      toast({ title: 'Informe sua chave PIX', variant: 'destructive' });
      return;
    }

    requestWithdrawal({
      amount: value,
      pixKeyType,
      pixKey: pixKey.trim(),
      grossBalance,
    }, {
      onSuccess: () => {
        setShowWithdrawModal(false);
        setWithdrawAmount('');
      },
    });
  };

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    pending: { icon: <Clock className="h-3.5 w-3.5" />, label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
    approved: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Aprovado', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
    completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Concluído', color: 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30' },
    paid: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Pago', color: 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30' },
    rejected: { icon: <XCircle className="h-3.5 w-3.5" />, label: 'Rejeitado', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Creator Settings Card - Golden border */}
      <Card className="relative overflow-hidden border-0">
        <div className="absolute inset-0 rounded-lg p-[1.5px] bg-gradient-to-r from-[#FFD700] to-[#B8860B] -z-10" />
        <div className="bg-card rounded-[calc(0.5rem-1.5px)] p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(45,93%,47%)]/20 to-[hsl(35,93%,47%)]/20">
              <Wallet className="h-6 w-6 text-[hsl(45,93%,47%)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Carteira do Criador</h1>
                <Badge className="bg-gradient-to-r from-[#FFD700] to-[#B8860B] text-[hsl(45,93%,10%)] text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 shrink-0">
                  CREATOR
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm tracking-wide">Gerencie seus ganhos e solicite saques</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Balance Overview - Stacked on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-[hsl(35,93%,47%)]/10 border-[hsl(45,93%,47%)]/30">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[hsl(45,93%,47%)] mb-2">
              <Wallet className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-medium tracking-wide">Ganhos Acumulados</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-[hsl(45,93%,47%)] tracking-tight">
              {formatCurrency(grossBalance)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <Percent className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-medium tracking-wide">Taxa da Plataforma (20%)</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-destructive tracking-tight">
              -{formatCurrency(platformFee)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/20">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[hsl(142,76%,36%)] mb-2">
              <Banknote className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-medium tracking-wide">Disponível para Saque</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-[hsl(142,76%,36%)] tracking-tight">
              {formatCurrency(netBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Withdraw Pill Button - Emerald gradient */}
      <Button
        onClick={() => setShowWithdrawModal(true)}
        disabled={netBalance < 250 || !limits.canWithdraw || isRequesting}
        className="w-full sm:w-auto rounded-full bg-gradient-to-r from-[hsl(152,60%,30%)] to-[hsl(145,50%,22%)] hover:from-[hsl(152,60%,35%)] hover:to-[hsl(145,50%,27%)] text-white font-semibold h-12 gap-2.5 px-8 border border-[hsl(152,60%,40%)]/30 transition-all"
      >
        {isRequesting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CircleDollarSign className="h-5 w-5" />
        )}
        {isRequesting ? 'Processando...' : 'Solicitar Saque via PIX'}
      </Button>

      {/* Withdrawal Limits Info */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/20">
          <span className="text-xs text-[hsl(45,93%,47%)] tracking-wide">Saques no mês: <strong>{limits.monthlyCount} de {limits.monthlyMax}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/20">
          <span className="text-xs text-[hsl(45,93%,47%)] tracking-wide">Limite diário restante: <strong>{formatCurrency(limits.dailyRemaining)}</strong></span>
        </div>
      </div>

      {netBalance < 250 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Valor mínimo para saque: R$ 250,00. Saldo líquido atual: {formatCurrency(netBalance)}
          </p>
        </div>
      )}

      {!limits.canWithdraw && netBalance >= 250 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <p className="text-sm text-yellow-500">
            {limits.monthlyRemaining <= 0 ? 'Limite de 4 saques mensais atingido. Tente novamente no próximo mês.' : 'Limite diário de R$ 1.000,00 atingido. Tente novamente amanhã.'}
          </p>
        </div>
      )}

      {/* Special Limit Request - Pill button, well-spaced from main withdraw */}
      {(!limits.canWithdraw || netBalance > limits.dailyRemaining) && !hasPendingException && (
        <div className="pt-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto rounded-full border-[hsl(45,93%,47%)]/30 text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10 gap-2 px-6"
            onClick={() => setShowExceptionModal(true)}
            disabled={isRequestingException}
          >
            {isRequestingException ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            Solicitar Limite Especial
          </Button>
        </div>
      )}

      {hasPendingException && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/20">
          <Clock className="h-4 w-4 text-[hsl(45,93%,47%)]" />
          <p className="text-xs text-[hsl(45,93%,47%)] tracking-wide">Você possui uma solicitação de limite especial em análise.</p>
        </div>
      )}

      {hasApprovedUnusedException && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/20">
          <CheckCircle2 className="h-4 w-4 text-[hsl(142,76%,36%)]" />
          <p className="text-xs text-[hsl(142,76%,36%)] tracking-wide">Limite especial aprovado! Será usado automaticamente no próximo saque.</p>
        </div>
      )}

      {/* PIX Key Section */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Chave PIX para Saques
          </CardTitle>
          <CardDescription>Configure sua chave PIX para receber pagamentos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Chave</Label>
            <Select
              value={pixKeyType}
              onValueChange={setPixKeyType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={4}
                className="max-h-[200px]"
              >
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="phone">Telefone</SelectItem>
                <SelectItem value="random">Chave Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Chave PIX</Label>
            <Input
              placeholder={
                pixKeyType === 'cpf' ? '000.000.000-00' :
                pixKeyType === 'email' ? 'seu@email.com' :
                pixKeyType === 'phone' ? '(11) 99999-9999' :
                'Sua chave PIX'
              }
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              onFocus={(e) => {
                // Prevent scroll jump on focus
                e.preventDefault();
                setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
              }}
            />
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={isSavingPix || !pixKey.trim()}
            onClick={() => savePixKey({ pixKeyType, pixKey: pixKey.trim() })}
          >
            {isSavingPix ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar Chave PIX
          </Button>
        </CardContent>
      </Card>

      {/* Withdrawal History */}
      {withdrawals.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Saques Realizados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {withdrawals.map((w) => {
              const cfg = statusConfig[w.status] || statusConfig.pending;
              return (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30 gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground tracking-tight">{formatCurrency(w.net_amount)}</p>
                    <p className="text-xs text-muted-foreground tracking-wide">
                      {new Date(w.created_at).toLocaleDateString('pt-BR')} • PIX {w.pix_key_type.toUpperCase()}
                    </p>
                  </div>
                  <Badge variant="outline" className={`gap-1 shrink-0 ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Withdraw Modal */}
      <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-[hsl(152,60%,30%)]" />
              Solicitar Saque via PIX
            </DialogTitle>
            <DialogDescription>
              O saque será processado em até 3 dias úteis após aprovação do administrador.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="p-4 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30">
              <p className="text-sm text-muted-foreground">Disponível</p>
              <p className="text-2xl font-bold text-[hsl(142,76%,36%)] tracking-tight">{formatCurrency(netBalance)}</p>
            </div>

            <div className="space-y-2">
              <Label>Valor do Saque</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <Input
                  type="number"
                  min="250"
                  step="0.01"
                  placeholder="0,00"
                  className="pl-10 text-lg font-semibold"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Mínimo: R$ 250,00</p>
            </div>

            {pixKey ? (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Chave PIX ({pixKeyType.toUpperCase()})</p>
                <p className="text-sm font-medium">{pixKey}</p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <p className="text-sm text-destructive">Configure sua chave PIX antes de solicitar saque.</p>
              </div>
            )}

            <Button
              className="w-full rounded-full bg-gradient-to-r from-[hsl(152,60%,30%)] to-[hsl(145,50%,22%)] hover:from-[hsl(152,60%,35%)] hover:to-[hsl(145,50%,27%)] text-white font-semibold border border-[hsl(152,60%,40%)]/30"
              onClick={handleWithdraw}
              disabled={isRequesting || !pixKey.trim()}
            >
              {isRequesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processando...
                </>
              ) : (
                'Confirmar Saque'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Special Limit Exception Modal */}
      <Dialog open={showExceptionModal} onOpenChange={setShowExceptionModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[hsl(45,93%,47%)]" />
              Solicitar Limite Especial
            </DialogTitle>
            <DialogDescription>
              Solicite um valor acima do limite padrão. O administrador analisará o risco e responderá em breve.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Valor desejado para saque (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <Input
                  type="number"
                  min="1001"
                  step="0.01"
                  placeholder="0,00"
                  className="pl-10 text-lg font-semibold"
                  value={exceptionAmount}
                  onChange={(e) => setExceptionAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Justificativa</Label>
              <Input
                placeholder="Ex: Preciso pagar fornecedor urgente..."
                value={exceptionJustification}
                onChange={(e) => setExceptionJustification(e.target.value)}
              />
            </div>
            <Button
              className="w-full rounded-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-semibold"
              disabled={isRequestingException || !exceptionAmount || !exceptionJustification.trim()}
              onClick={() => {
                const val = parseFloat(exceptionAmount);
                if (isNaN(val) || val <= 0) {
                  toast({ title: 'Informe um valor válido', variant: 'destructive' });
                  return;
                }
                requestException({ amount: val, justification: exceptionJustification.trim() }, {
                  onSuccess: () => {
                    setShowExceptionModal(false);
                    setExceptionAmount('');
                    setExceptionJustification('');
                  },
                });
              }}
            >
              {isRequestingException ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isRequestingException ? 'Analisando...' : 'Enviar Solicitação'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
