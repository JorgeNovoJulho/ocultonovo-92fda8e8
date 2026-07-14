import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Coins, CreditCard, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface InsufficientCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  required: number;
  available: number;
}

export function InsufficientCreditsModal({
  open,
  onOpenChange,
  required,
  available,
}: InsufficientCreditsModalProps) {
  const navigate = useNavigate();
  const missing = required - available;

  const handleGoToWallet = () => {
    onOpenChange(false);
    navigate('/wallet');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Coins className="h-8 w-8 text-destructive" />
          </div>
          <DialogTitle className="text-center">Créditos Insuficientes</DialogTitle>
          <DialogDescription className="text-center">
            Você precisa de mais créditos para votar nesta enquete.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Credit breakdown */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Custo do voto:</span>
              <span className="font-semibold">{required} créditos</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Seu saldo:</span>
              <span className="font-semibold text-amber-500">{available} créditos</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Faltam:</span>
              <span className="font-bold text-destructive">{missing} créditos</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Button onClick={handleGoToWallet} className="w-full gap-2">
              <Wallet className="h-4 w-4" />
              Ir para Carteira
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Converta seu saldo em créditos ou recarregue sua conta
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
