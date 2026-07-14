import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTrustTips } from '@/hooks/useTrustTips';
import { Check, Circle, Shield } from 'lucide-react';

export function TrustScoreTipsModal({
  open, onClose, userId,
}: { open: boolean; onClose: () => void; userId?: string | null }) {
  const { tips, loading } = useTrustTips(userId);
  const total = tips.reduce((s, t) => s + (t.done ? t.points : 0), 0);
  const max = tips.reduce((s, t) => s + t.points, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Como aumentar seu Score de Confiança
          </DialogTitle>
          <DialogDescription>
            Cumprir essas etapas eleva sua confiança e te dá mais visibilidade.
            {max > 0 && <> Atual: <strong>{total}</strong> de {max} pontos disponíveis.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {loading && <div className="h-24 rounded bg-muted/40 animate-pulse" />}
          {!loading && tips.map((t) => (
            <div
              key={t.key}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/30"
            >
              {t.done
                ? <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${t.done ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                  {t.label}
                </div>
              </div>
              <div className={`text-xs font-semibold ${t.done ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                +{t.points}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
