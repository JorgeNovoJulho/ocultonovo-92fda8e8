/**
 * PaymentConfirmationModal — Modal elegante de confirmação pós-pagamento.
 * Glassmorphism leve + animação CSS pura para performance no Realme C55.
 */
import { useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Crown, Sparkles, Play, Calendar, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import type { ConfirmedPayment } from '@/hooks/usePaymentConfirmationListener';

interface Props {
  payment: ConfirmedPayment | null;
  onDismiss: () => void;
}

export function PaymentConfirmationModal({ payment, onDismiss }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!payment) return;
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.45 },
      colors: ['#FF007F', '#9b87f5', '#22c55e', '#FFD700'],
      zIndex: 10000,
    });
  }, [payment]);

  if (!payment) return null;

  const isSubscription = payment.type === 'subscription';
  const isPPV = payment.type === 'ppv';

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (iso?: string) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleAction = () => {
    onDismiss();
    navigate('/feed');
  };

  return (
    <Dialog open={!!payment} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden shadow-2xl border-[hsl(var(--gold))] backdrop-blur-xl"
        style={{ background: 'hsl(var(--card-glass))' }}
      >
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        {/* ── Success animation ring (CSS only) ── */}
        <div className="relative pt-10 pb-4 px-6 text-center">
          {/* Radial glow behind icon */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent pointer-events-none" />

          <div className="relative mx-auto mb-5 w-24 h-24">
            {/* Animated ring */}
            <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-[ping_1.5s_ease-out_1]" />
            {/* Inner circle */}
            <div className="relative w-24 h-24 rounded-full bg-primary/15 flex items-center justify-center animate-scale-in">
              <CheckCircle2 className="h-12 w-12 text-primary drop-shadow-[0_0_12px_hsl(var(--primary)/0.5)]" />
            </div>
          </div>

          <h2 className="text-xl font-black text-foreground relative">
            Transação Concluída com Sucesso!
          </h2>
          <p className="text-sm text-muted-foreground mt-1 relative">
            {isSubscription
              ? 'Seu plano já está ativo.'
              : isPPV
                ? 'Conteúdo liberado instantaneamente.'
                : 'Pagamento confirmado.'}
          </p>
        </div>

        {/* ── Details card ── */}
        <div className="px-6 pb-6 space-y-4">
          {/* Subscription card */}
          {isSubscription && (
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Crown className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-foreground text-base">
                    Plano {payment.planType === 'annual' ? 'Anual' : 'Mensal'}
                  </p>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs mt-0.5">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Ativo
                  </Badge>
                </div>
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(payment.amount)}
                </span>
              </div>

              {payment.expiresAt && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Válido até
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatDate(payment.expiresAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* PPV content card */}
          {isPPV && (
            <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                  <Play className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {payment.contentTitle && (
                    <p className="font-bold text-foreground truncate text-sm">
                      {payment.contentTitle}
                    </p>
                  )}
                  {payment.creatorName && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <User className="h-3 w-3" />
                      @{payment.creatorName}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Valor pago</span>
                <span className="text-base font-bold text-primary">
                  {formatCurrency(payment.amount)}
                </span>
              </div>
            </div>
          )}

          {/* Generic fallback */}
          {!isSubscription && !isPPV && (
            <div className="rounded-2xl bg-muted/30 p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor pago</span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(payment.amount)}
              </span>
            </div>
          )}

          {/* Action button */}
          <Button
            onClick={handleAction}
            className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold gap-2 shadow-lg shadow-primary/20"
            size="lg"
          >
            {isPPV ? (
              <>
                <Play className="h-5 w-5" />
                Acessar Conteúdo
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Explorar Agora
              </>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            Suas funcionalidades já foram liberadas automaticamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
