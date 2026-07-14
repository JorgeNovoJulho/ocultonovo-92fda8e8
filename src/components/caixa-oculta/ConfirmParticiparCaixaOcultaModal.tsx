/**
 * ConfirmParticiparCaixaOcultaModal — modal leve de confirmação de entrada.
 * Mostra saldo XP atual, custo, aviso de 1 participação e dispara a RPC.
 */
import { Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { type CoxCampaign, useParticipateCaixaOculta } from '@/hooks/useCaixaOculta';

interface Props {
  campaign: CoxCampaign;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ConfirmParticiparCaixaOcultaModal({ campaign, open, onOpenChange }: Props) {
  const { progress } = useAuraProgress(false);
  const participate = useParticipateCaixaOculta();
  const xp = progress?.xp ?? 0;
  const insufficient = xp < campaign.xp_cost;

  const handleConfirm = () => {
    participate.mutate(campaign.id, {
      onSettled: (res: any) => {
        if (res?.ok) onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{campaign.title}</DialogTitle>
          <DialogDescription>Confirme sua participação nesta Caixa Oculta.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Custo</span>
              <span className="inline-flex items-center gap-1 font-semibold text-amber-500">
                <Sparkles className="h-4 w-4" /> {campaign.xp_cost} XP
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Seu saldo</span>
              <span className={`font-semibold ${insufficient ? 'text-destructive' : 'text-foreground'}`}>
                {xp} XP
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Saldo após participar</span>
              <span className="font-semibold">{Math.max(0, xp - campaign.xp_cost)} XP</span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Cada usuário só pode participar uma vez por Caixa. A entrada é registrada e auditada.</p>
          </div>

          {insufficient && (
            <p className="text-xs text-destructive">
              XP insuficiente. Você precisa de mais {campaign.xp_cost - xp} XP para participar.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={participate.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={insufficient || participate.isPending}>
            {participate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar participação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmParticiparCaixaOcultaModal;
