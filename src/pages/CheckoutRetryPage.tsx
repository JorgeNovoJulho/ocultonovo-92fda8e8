import { CreditCard, QrCode, AlertTriangle, Clock, ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { useImpersonationStore } from '@/store/useImpersonationStore';

export default function CheckoutRetryPage() {
  const navigate = useNavigate();
  const { effectiveStatus, isSimulated, isSuspended } = usePaymentStatus();
  const { isImpersonating, setSimulatedStatus } = useImpersonationStore();

  const handleResetSimulation = () => {
    setSimulatedStatus('active');
    navigate('/feed');
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Alert Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">
            {isSuspended ? 'Conta Suspensa' : 'Regularize sua Assinatura'}
          </h1>
          <p className="text-muted-foreground">
            {isSuspended 
              ? 'Sua conta foi suspensa por falta de pagamento.'
              : 'Seu pagamento não foi processado. Regularize para continuar.'
            }
          </p>
          {isSimulated && (
            <Badge variant="outline" className="mt-2">
              🎭 SIMULAÇÃO ATIVA
            </Badge>
          )}
        </div>

        {/* Payment Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Detalhes do Pagamento
            </CardTitle>
            <CardDescription>
              Último pagamento não processado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-medium">VIP Mensal</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-bold text-lg">R$ 25,90</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="destructive">
                {isSuspended ? 'Suspenso' : 'Atrasado'}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Motivo</span>
              <span className="text-sm text-right">Cartão recusado - Saldo insuficiente</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Options */}
        <div className="space-y-3">
          <Button 
            className="w-full h-12 gap-2" 
            size="lg"
            onClick={() => navigate('/checkout')}
          >
            <CreditCard className="h-5 w-5" />
            Tentar com outro cartão
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full h-12 gap-2" 
            size="lg"
            onClick={() => navigate('/checkout')}
          >
            <QrCode className="h-5 w-5" />
            Pagar via PIX
          </Button>
        </div>

        {/* Urgency Message */}
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <Clock className="h-5 w-5 text-amber-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-600 dark:text-amber-400">
              Regularize em até 3 dias
            </p>
            <p className="text-muted-foreground">
              Após esse prazo, seu conteúdo e dados podem ser removidos permanentemente.
            </p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>Pagamento seguro e criptografado</span>
        </div>

        {/* Simulation Controls (only visible during impersonation) */}
        {isImpersonating && isSimulated && (
          <Card className="border-dashed border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-500">🎭 MODO TESTE</Badge>
                  <span className="text-sm text-muted-foreground">
                    Simulação de inadimplência ativa
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleResetSimulation}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Restaurar Status
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Back to Support */}
        <div className="text-center">
          <Button 
            variant="link" 
            onClick={() => navigate('/support')}
            className="text-muted-foreground"
          >
            Precisa de ajuda? Fale com o suporte
          </Button>
        </div>
      </div>
    </div>
  );
}
