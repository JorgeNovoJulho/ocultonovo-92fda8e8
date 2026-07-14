import { useState } from "react";
import { 
  Wallet, 
  Plus, 
  QrCode, 
  Copy, 
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Shield
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useProfile } from "@/hooks/useProfile";
import { useTransactions, useCreateTransaction } from "@/hooks/useTransactions";
import { toast } from "@/hooks/use-toast";

const PRESET_AMOUNTS = [10, 25, 50, 100, 200, 500];

export default function WalletPage() {
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [showPixCode, setShowPixCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const { profile, isLoading: loadingProfile } = useProfile();
  const { data: transactions, isLoading: loadingTransactions } = useTransactions();
  const createTransaction = useCreateTransaction();

  const handleTopUp = () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value < 5) {
      toast({
        title: 'Valor inválido',
        description: 'O valor mínimo para recarga é R$ 5,00',
        variant: 'destructive',
      });
      return;
    }
    setShowPixCode(true);
  };

  const handleConfirmPayment = async () => {
    const value = parseFloat(amount);
    
    await createTransaction.mutateAsync({
      amount: value,
      type: 'deposit',
      description: `Recarga via PIX - R$ ${value.toFixed(2)}`,
    });

    toast({
      title: 'Recarga solicitada!',
      description: 'Aguardando confirmação do pagamento PIX.',
    });

    setShowTopUpModal(false);
    setShowPixCode(false);
    setAmount('');
  };

  const copyPixCode = () => {
    const pixCode = `00020126580014br.gov.bcb.pix0136oculto-wallet-${Date.now()}52040000530398654${amount.padStart(10, '0')}5802BR`;
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Código PIX copiado!' });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const recentTransactions = transactions
    ?.filter(t => t.type === 'deposit')
    .slice(0, 5) || [];

  const isLoading = loadingProfile || loadingTransactions;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(45,93%,47%)]/20 to-[hsl(35,93%,47%)]/20">
          <Wallet className="h-6 w-6 text-[hsl(45,93%,47%)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minha Carteira</h1>
          <p className="text-muted-foreground">
            Recarregue seu saldo para desbloquear conteúdos exclusivos
          </p>
        </div>
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-[hsl(35,93%,47%)]/10 border-[hsl(45,93%,47%)]/30 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,47%)]/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-[hsl(35,93%,47%)]/10 rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Saldo Disponível</p>
              <p className="text-4xl font-bold text-[hsl(45,93%,47%)]">
                {formatCurrency(profile?.balance || 0)}
              </p>
            </div>
            <Button 
              onClick={() => setShowTopUpModal(true)}
              className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] hover:opacity-90 text-background font-semibold gap-2"
            >
              <Plus className="h-4 w-4" />
              Recarregar
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-background/50">
              <div className="flex items-center gap-2 text-[hsl(142,76%,36%)] mb-1">
                <ArrowUpRight className="h-4 w-4" />
                <span className="text-xs">Total Recarregado</span>
              </div>
              <p className="font-semibold">
                {formatCurrency(recentTransactions.reduce((sum, t) => sum + t.amount, 0))}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-background/50">
              <div className="flex items-center gap-2 text-primary mb-1">
                <ArrowDownRight className="h-4 w-4" />
                <span className="text-xs">Gastos</span>
              </div>
              <p className="font-semibold">
                {formatCurrency(0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Top-up */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Recarga Rápida</CardTitle>
          <CardDescription>Selecione um valor ou digite um personalizado</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {PRESET_AMOUNTS.map((preset) => (
              <Button
                key={preset}
                variant="outline"
                className="h-14 text-lg font-semibold hover:bg-[hsl(45,93%,47%)]/10 hover:border-[hsl(45,93%,47%)]/50 hover:text-[hsl(45,93%,47%)]"
                onClick={() => {
                  setAmount(preset.toString());
                  setShowTopUpModal(true);
                }}
              >
                R$ {preset}
              </Button>
            ))}
          </div>
          <Button 
            className="w-full gap-2"
            onClick={() => setShowTopUpModal(true)}
          >
            <Plus className="h-4 w-4" />
            Outro Valor
          </Button>
        </CardContent>
      </Card>

      {/* Benefits */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Benefícios da Carteira
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <div className="p-2 rounded-lg bg-primary/10">
              <QrCode className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Pagamento Instantâneo</p>
              <p className="text-xs text-muted-foreground">
                PIX confirmado em segundos, saldo disponível na hora
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <div className="p-2 rounded-lg bg-[hsl(142,76%,36%)]/10">
              <Shield className="h-4 w-4 text-[hsl(142,76%,36%)]" />
            </div>
            <div>
              <p className="font-medium text-sm">100% Seguro</p>
              <p className="text-xs text-muted-foreground">
                Transações criptografadas e protegidas
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/10">
              <Wallet className="h-4 w-4 text-[hsl(45,93%,47%)]" />
            </div>
            <div>
              <p className="font-medium text-sm">Sem Taxas</p>
              <p className="text-xs text-muted-foreground">
                Não cobramos taxa de recarga
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Deposits */}
      {recentTransactions.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Recargas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTransactions.map((t) => (
                <div 
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(142,76%,36%)]/10">
                      <ArrowUpRight className="h-4 w-4 text-[hsl(142,76%,36%)]" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Recarga PIX</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[hsl(142,76%,36%)]">
                      +{formatCurrency(t.amount)}
                    </p>
                    <Badge 
                      variant="outline" 
                      className={
                        t.status === 'completed' 
                          ? 'text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30'
                          : 'text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30'
                      }
                    >
                      {t.status === 'completed' ? 'Confirmado' : 'Pendente'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top-up Modal */}
      <Dialog open={showTopUpModal} onOpenChange={(open) => {
        setShowTopUpModal(open);
        if (!open) {
          setShowPixCode(false);
          setAmount('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              {showPixCode ? 'Pagar com PIX' : 'Recarregar Carteira'}
            </DialogTitle>
            <DialogDescription>
              {showPixCode 
                ? 'Escaneie o QR Code ou copie o código PIX' 
                : 'Digite o valor desejado para recarga via PIX'
              }
            </DialogDescription>
          </DialogHeader>

          {!showPixCode ? (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Valor da Recarga</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    R$
                  </span>
                  <Input
                    id="amount"
                    type="number"
                    min="5"
                    step="0.01"
                    placeholder="0,00"
                    className="pl-10 text-lg font-semibold"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Valor mínimo: R$ 5,00
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {PRESET_AMOUNTS.slice(0, 6).map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(preset.toString())}
                    className={amount === preset.toString() ? 'border-primary bg-primary/10' : ''}
                  >
                    R$ {preset}
                  </Button>
                ))}
              </div>

              <Button
                className="w-full"
                onClick={handleTopUp}
                disabled={!amount || parseFloat(amount) < 5}
              >
                Gerar PIX
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-4">
              {/* QR Code placeholder */}
              <div className="aspect-square max-w-[200px] mx-auto bg-white p-4 rounded-lg">
                <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 rounded flex items-center justify-center">
                  <QrCode className="h-24 w-24 text-foreground" />
                </div>
              </div>

              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(parseFloat(amount))}
                </p>
                <p className="text-sm text-muted-foreground">
                  Valor a pagar
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={copyPixCode}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado!' : 'Copiar Código PIX'}
              </Button>

              <div className="p-3 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                <div className="flex items-center gap-2 text-[hsl(45,93%,47%)]">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">Aguardando pagamento</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  O código PIX expira em 30 minutos
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleConfirmPayment}
                disabled={createTransaction.isPending}
              >
                {createTransaction.isPending ? 'Processando...' : 'Já fiz o pagamento'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
