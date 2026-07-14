/**
 * RateLimitReachedModal — bloco visual para limite de uso atingido.
 * Exibe countdown até reset_at e CTA de upgrade.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Clock, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface RateLimitReachedModalProps {
  open: boolean;
  onClose: () => void;
  feature?: string;
  reason?: 'feature_disabled' | 'limit_exceeded' | string | null;
  count?: number;
  limit?: number;
  resetAt?: string | null;
  plan?: 'free' | 'premium' | 'vip' | string;
}

function useCountdown(target?: string | null) {
  const [remaining, setRemaining] = useState<string>('');
  useEffect(() => {
    if (!target) { setRemaining(''); return; }
    const t = new Date(target).getTime();
    const tick = () => {
      const diff = Math.max(0, t - Date.now());
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m` : `${m}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

export function RateLimitReachedModal({ open, onClose, feature, reason, count, limit, resetAt, plan }: RateLimitReachedModalProps) {
  const navigate = useNavigate();
  const countdown = useCountdown(resetAt);
  const isDisabled = reason === 'feature_disabled';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDisabled ? <Lock className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-primary" />}
            {isDisabled ? 'Recurso indisponível' : 'Limite atingido'}
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            {isDisabled ? (
              <span>Esta funcionalidade {feature ? <code className="text-xs">({feature})</code> : null} não está liberada para o seu plano <strong className="capitalize">{plan ?? 'free'}</strong>.</span>
            ) : (
              <>
                <span>Você atingiu o limite{typeof count === 'number' && typeof limit === 'number' ? ` (${count}/${limit})` : ''} para <strong>{feature ?? 'esta ação'}</strong> no plano <strong className="capitalize">{plan ?? 'free'}</strong>.</span>
                {countdown && (
                  <span className="block text-sm text-muted-foreground">Reseta em <strong className="text-foreground">{countdown}</strong>.</span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Voltar</Button>
          <Button onClick={() => { onClose(); navigate('/subscriptions'); }} className="flex-1 gap-1">
            <Crown className="h-4 w-4" /> Fazer upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
