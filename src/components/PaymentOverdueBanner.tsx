import { AlertTriangle, CreditCard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

export function PaymentOverdueBanner() {
  const { shouldShowBanner, isSimulated, effectiveStatus } = usePaymentStatus();
  const navigate = useNavigate();

  if (!shouldShowBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Warning Info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-full">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base">
                  PAGAMENTO PENDENTE
                </span>
                {isSimulated && (
                  <Badge variant="outline" className="border-white/50 text-white text-xs">
                    SIMULAÇÃO
                  </Badge>
                )}
              </div>
              <span className="text-white/90 text-xs sm:text-sm hidden sm:block">
                Sua assinatura venceu. Regularize agora para continuar acessando o conteúdo VIP.
              </span>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => navigate('/checkout/retry')}
              className="bg-white text-red-600 hover:bg-white/90 font-semibold gap-2"
            >
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Regularizar Agora</span>
              <span className="sm:hidden">Pagar</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
