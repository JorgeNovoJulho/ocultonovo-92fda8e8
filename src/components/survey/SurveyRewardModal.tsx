/**
 * SurveyRewardModal — modal exibido após concluir a pesquisa OCULTO.
 * Mostra "+200 XP" recebido e leva ao chat com @oculto_master, onde a
 * mensagem final de agradecimento é entregue automaticamente.
 */
import { Gift, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onClose: () => void;
  xpAmount?: number;
  newBalance?: number | null;
  onOpenChat?: () => void;
};

export function SurveyRewardModal({ open, onClose, xpAmount = 200, newBalance, onOpenChat }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm rounded-2xl border-primary/30 overflow-hidden p-0">
        <div className="relative bg-gradient-to-br from-amber-500/15 via-fuchsia-500/10 to-primary/10 p-6">
          <div className="absolute inset-0 pointer-events-none opacity-30 [background:radial-gradient(circle_at_top,theme(colors.amber.400),transparent_60%)]" />
          <div className="relative flex flex-col items-center text-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-400/40 blur-xl animate-pulse" />
              <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-amber-400 to-fuchsia-500 flex items-center justify-center shadow-lg">
                <Gift className="h-8 w-8 text-white" />
              </div>
            </div>
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-xl font-bold">Presente recebido</DialogTitle>
              <DialogDescription className="text-sm text-foreground/80">
                Você recebeu{' '}
                <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                  <Sparkles className="h-4 w-4" /> +{xpAmount} XP
                </span>{' '}
                por ajudar a evoluir o Oculto.
              </DialogDescription>
            </DialogHeader>
            {typeof newBalance === 'number' && (
              <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Saldo atual: <span className="font-semibold text-foreground">{newBalance.toLocaleString('pt-BR')} XP</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 pt-3 flex flex-col gap-2">
          {onOpenChat && (
            <Button onClick={() => { onOpenChat(); onClose(); }} className="w-full h-10">
              Ver mensagem do @oculto_master
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="w-full h-9 text-muted-foreground">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SurveyRewardModal;
