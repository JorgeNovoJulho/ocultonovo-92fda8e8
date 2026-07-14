import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QrCode, Copy, Loader2, CheckCircle, XCircle, Zap, PartyPopper } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';

interface PixResult {
  qrCode: string;
  qrCodeBase64: string | null;
  transactionId: string;
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

type ModalState = 'qrcode' | 'confirmed';

export function AsaasTestPixCard() {
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState>('qrcode');
  const [pixResult, setPixResult] = useState<PixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [payerName, setPayerName] = useState('Admin Oculto');
  const [payerEmail, setPayerEmail] = useState('admin@oculto.app');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTransactionIdRef = useRef<string | null>(null);

  const rawCpfCnpj = cpfCnpj.replace(/\D/g, '');
  const isValidDoc = rawCpfCnpj.length === 11 || rawCpfCnpj.length === 14;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const confettiTriggered = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const triggerConfetti = useCallback(async () => {
    if (confettiTriggered.current) return;
    confettiTriggered.current = true;
    try {
      const confetti = (await import('canvas-confetti')).default;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b'],
      });
    } catch {}
  }, []);

  const checkPaymentStatus = useCallback(async (transactionId: string) => {
    const { data, error: statusError } = await supabase.functions.invoke('pix-gateway', {
      body: { action: 'check-status', transaction_id: transactionId },
    });

    if (statusError) return false;

    if (data?.confirmed) {
      stopPolling();
      setModalState('confirmed');
      triggerConfetti();
      return true;
    }

    return false;
  }, [stopPolling, triggerConfetti]);

  const startPolling = useCallback((transactionId: string) => {
    stopPolling();
    currentTransactionIdRef.current = transactionId;

    // first check immediately (important on mobile app switch)
    void checkPaymentStatus(transactionId);

    pollingRef.current = setInterval(() => {
      void checkPaymentStatus(transactionId);
    }, 3000);
  }, [checkPaymentStatus, stopPolling]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        modalOpen &&
        modalState === 'qrcode' &&
        currentTransactionIdRef.current
      ) {
        void checkPaymentStatus(currentTransactionIdRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkPaymentStatus, modalOpen, modalState]);

  const generateTestPix = useCallback(async () => {
    if (!isValidDoc) {
      setError('Preencha um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }

    setLoading(true);
    setError(null);
    confettiTriggered.current = false;

    try {
      const { data, error: fnError } = await supabase.functions.invoke('pix-gateway', {
        body: {
          action: 'generate',
          amount: 5.00,
          description: 'Teste Webhook OCULTO - R$5,00',
          payer_email: payerEmail || 'admin@oculto.app',
          payer_name: payerName || 'Admin Oculto',
          payer_cpf_cnpj: rawCpfCnpj,
        },
      });

      if (fnError) {
        const errBody = typeof fnError === 'object' && fnError?.context?.body
          ? await fnError.context.body.text?.().catch(() => null)
          : null;
        let parsedMsg: string | null = null;
        if (errBody) {
          try { parsedMsg = JSON.parse(errBody)?.error; } catch {}
        }
        throw new Error(parsedMsg || fnError.message || 'Falha ao gerar PIX');
      }
      if (!data?.success) throw new Error(data?.error || 'Falha ao gerar PIX');

      setPixResult({
        qrCode: data.qr_code,
        qrCodeBase64: data.qr_code_base64 || null,
        transactionId: data.transaction_id,
      });
      setModalState('qrcode');
      setModalOpen(true);
      startPolling(data.transaction_id);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao gerar PIX de teste';
      setError(msg);
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isValidDoc, rawCpfCnpj, payerEmail, payerName, startPolling]);

  const handleModalClose = useCallback((open: boolean) => {
    setModalOpen(open);
    if (!open) {
      stopPolling();
      currentTransactionIdRef.current = null;
      // Reset state for next use
      setTimeout(() => setModalState('qrcode'), 300);
    }
  }, [stopPolling]);

  const copyPixCode = useCallback(async () => {
    if (!pixResult?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixResult.qrCode);
      toast({ title: 'Copiado!', description: 'Cole no app do banco para pagar.' });
    } catch {
      toast({ title: 'Erro ao copiar', description: 'Copie manualmente.', variant: 'destructive' });
    }
  }, [pixResult]);

  return (
    <>
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-500" />
            Teste Webhook Asaas
          </CardTitle>
          <CardDescription>
            Gere um PIX real de R$ 5,00 para forçar o evento PAYMENT_RECEIVED e desbloquear o webhook
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-muted-foreground">
              Ao pagar esse PIX, o Asaas enviará um webhook real para a Edge Function <code className="bg-muted px-1 rounded text-xs">pix-webhook</code>, validando a integração e removendo penalizações.
            </p>
          </div>

          {/* Dados do pagador */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="test-cpf" className="text-sm font-medium">
                CPF ou CNPJ <span className="text-destructive">*</span>
              </Label>
              <Input
                id="test-cpf"
                placeholder="000.000.000-00"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                className="font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="test-name" className="text-sm font-medium">Nome</Label>
                <Input
                  id="test-name"
                  placeholder="Nome do pagador"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-email" className="text-sm font-medium">E-mail</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            onClick={generateTestPix}
            disabled={loading || !isValidDoc}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            Gerar PIX de Teste (R$ 5,00)
          </Button>
        </CardContent>
      </Card>

      {/* Modal — QR Code + Success */}
      <Dialog open={modalOpen} onOpenChange={handleModalClose}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden [&>button]:z-10">
          {modalState === 'qrcode' ? (
            <>
              <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  PIX Gerado
                </DialogTitle>
                <DialogDescription>
                  Pague R$ 5,00 para validar o webhook
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 space-y-4 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-3xl font-bold">R$ 5,00</p>
                  <Badge variant="outline" className="mt-1 text-xs">Teste Webhook</Badge>
                </div>

                {pixResult?.qrCodeBase64 ? (
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <img
                      src={`data:image/png;base64,${pixResult.qrCodeBase64}`}
                      alt="QR Code PIX"
                      className="w-44 h-44 sm:w-48 sm:h-48"
                      loading="eager"
                    />
                  </div>
                ) : (
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <QrCode className="h-36 w-36 sm:h-40 sm:w-40 text-gray-800" strokeWidth={1} />
                  </div>
                )}

                {pixResult?.qrCode && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-center">Copia e Cola:</p>
                    <div className="p-2 bg-muted/50 rounded text-xs font-mono break-all max-h-16 overflow-y-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {pixResult.qrCode}
                    </div>
                    <Button variant="outline" className="w-full gap-2" onClick={copyPixCode}>
                      <Copy className="h-4 w-4" />
                      Copiar Código PIX
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Aguardando confirmação do pagamento…
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => pixResult?.transactionId && void checkPaymentStatus(pixResult.transactionId)}
                >
                  Já paguei, verificar agora
                </Button>

                {pixResult?.transactionId && (
                  <p className="text-xs text-center text-muted-foreground">
                    ID: <code className="bg-muted px-1 rounded">{pixResult.transactionId}</code>
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
                <DialogTitle className="flex items-center justify-center gap-2 text-emerald-500">
                  <PartyPopper className="h-6 w-6" />
                  Webhook Validado!
                </DialogTitle>
                <DialogDescription className="text-center">
                  O pagamento foi confirmado com sucesso
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 space-y-5 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex justify-center">
                  <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle className="h-12 w-12 text-emerald-500" />
                  </div>
                </div>

                <div className="text-center space-y-2">
                  <p className="text-2xl font-bold">R$ 5,00</p>
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20">
                    Pagamento Confirmado
                  </Badge>
                </div>

                <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Evento <code className="bg-muted px-1 rounded text-xs font-semibold">PAYMENT_RECEIVED</code> enviado pelo Asaas
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Edge Function <code className="bg-muted px-1 rounded text-xs font-semibold">pix-webhook</code> processou com sucesso
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Penalização do webhook removida no painel Asaas
                    </p>
                  </div>
                </div>

                {pixResult?.transactionId && (
                  <p className="text-xs text-center text-muted-foreground">
                    Transaction ID: <code className="bg-muted px-1 rounded">{pixResult.transactionId}</code>
                  </p>
                )}

                <Button
                  onClick={() => handleModalClose(false)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Concluir
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
