import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { QrCode, CheckCircle, XCircle, Copy, Timer, CreditCard, Loader2 } from 'lucide-react';
import { useImpersonationStore } from '@/store/useImpersonationStore';
import { toast } from 'sonner';

interface SimulatePixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string;
  planType?: string;
}

export function SimulatePixModal({ open, onOpenChange, userName, planType }: SimulatePixModalProps) {
  const { setSimulatedStatus } = useImpersonationStore();
  const [stage, setStage] = useState<'qr' | 'processing' | 'success' | 'failed'>('qr');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [progress, setProgress] = useState(100);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStage('qr');
      setTimeLeft(300);
      setProgress(100);
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!open || stage !== 'qr') return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleExpired();
          return 0;
        }
        return prev - 1;
      });
      setProgress((prev) => Math.max(0, prev - (100 / 300)));
    }, 1000);

    return () => clearInterval(timer);
  }, [open, stage]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText('00020126580014br.gov.bcb.pix0136SIMULACAO-PIX-OCULTO-TESTE');
    toast.success('Código PIX copiado!');
  };

  const handleSimulateSuccess = () => {
    setStage('processing');
    setTimeout(() => {
      setStage('success');
      setSimulatedStatus('active');
      toast.success('✅ Pagamento simulado com sucesso!');
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    }, 2000);
  };

  const handleSimulateFailure = () => {
    setStage('processing');
    setTimeout(() => {
      setStage('failed');
      setSimulatedStatus('overdue');
      toast.error('❌ Falha simulada no pagamento');
    }, 2000);
  };

  const handleExpired = () => {
    setStage('failed');
    setSimulatedStatus('overdue');
    toast.error('⏰ PIX expirou - status alterado para inadimplente');
  };

  const handleRetry = () => {
    setStage('qr');
    setTimeLeft(300);
    setProgress(100);
  };

  const simulatedAmount = planType === 'vip' ? '49,90' : planType === 'premium' ? '29,90' : '0,00';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Simular Checkout PIX
          </DialogTitle>
          <DialogDescription>
            Teste o fluxo de pagamento para {userName || 'usuário'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Amount Display */}
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground">Valor da simulação</p>
            <p className="text-3xl font-bold text-foreground">R$ {simulatedAmount}</p>
            <Badge variant="outline" className="mt-2">
              Plano {planType || 'Free'}
            </Badge>
          </div>

          {/* QR Code Stage */}
          {stage === 'qr' && (
            <>
              {/* Timer Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Timer className="h-4 w-4" />
                    Expira em
                  </span>
                  <span className={`font-mono font-bold ${timeLeft < 60 ? 'text-destructive' : 'text-foreground'}`}>
                    {formatTime(timeLeft)}
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Fake QR Code */}
              <div className="flex justify-center p-6 bg-white rounded-lg">
                <div className="relative">
                  <QrCode className="h-40 w-40 text-gray-800" strokeWidth={1} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      SIMULAÇÃO
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Copy Code Button */}
              <Button variant="outline" className="w-full gap-2" onClick={handleCopyCode}>
                <Copy className="h-4 w-4" />
                Copiar código PIX
              </Button>

              {/* Simulation Actions */}
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="default" 
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSimulateSuccess}
                >
                  <CheckCircle className="h-4 w-4" />
                  Simular Sucesso
                </Button>
                <Button 
                  variant="destructive" 
                  className="gap-2"
                  onClick={handleSimulateFailure}
                >
                  <XCircle className="h-4 w-4" />
                  Simular Falha
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                🎭 Modo teste: nenhuma transação real será processada
              </p>
            </>
          )}

          {/* Processing Stage */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Processando pagamento...</p>
            </div>
          )}

          {/* Success Stage */}
          {stage === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="p-4 rounded-full bg-emerald-500/20">
                <CheckCircle className="h-12 w-12 text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-emerald-500">Pagamento Confirmado!</p>
                <p className="text-sm text-muted-foreground">
                  Status do usuário: Normal
                </p>
              </div>
            </div>
          )}

          {/* Failed Stage */}
          {stage === 'failed' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="p-4 rounded-full bg-destructive/20">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-destructive">Pagamento Falhou</p>
                <p className="text-sm text-muted-foreground">
                  Status do usuário alterado para: Inadimplente
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRetry}>
                  Tentar Novamente
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
