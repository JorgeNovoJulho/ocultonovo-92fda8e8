/**
 * BetaWithdrawCTA — botão "Solicitar Saque" que respeita o flag payouts_enabled.
 * Encapsula a lógica de bloqueio Beta + validação de limites.
 */
import { Button } from '@/components/ui/button';
import { ArrowUpRight, Lock } from 'lucide-react';
import { useBetaGuard } from '@/hooks/useBetaGuard';
import { toast as topToast } from '@/hooks/use-toast';

interface Props {
  canWithdrawApi: boolean;
  minAmount: number;
  maxMonthly: number;
  availableBalance: number;
  formatCurrency: (v: number) => string;
  onProceed: () => void;
}

export function BetaWithdrawCTA({
  canWithdrawApi, minAmount, maxMonthly, availableBalance, formatCurrency, onProceed,
}: Props) {
  const { isLocked, lockedLabel, guard } = useBetaGuard('payouts');

  const handleClick = () => {
    if (isLocked) { guard(() => {}); return; }
    if (!canWithdrawApi) {
      topToast({ title: 'Limite de saques atingido', description: `Você já realizou ${maxMonthly} saques este mês.`, variant: 'destructive' });
      return;
    }
    if (availableBalance < minAmount) {
      topToast({ title: 'Saldo insuficiente', description: `O valor mínimo para saque é ${formatCurrency(minAmount)}.`, variant: 'destructive' });
      return;
    }
    onProceed();
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isLocked || availableBalance <= 0 || !canWithdrawApi}
      className="w-full md:w-auto bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(142,76%,46%)] text-white font-semibold h-12 hover:opacity-90"
    >
      {isLocked ? <Lock className="h-5 w-5 mr-2" /> : <ArrowUpRight className="h-5 w-5 mr-2" />}
      {isLocked ? lockedLabel : 'Solicitar Saque'}
    </Button>
  );
}
