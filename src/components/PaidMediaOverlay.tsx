import { useState, memo } from 'react';
import { Lock, ShoppingCart, Flame, Clock, AlertTriangle, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PaidContentCheckoutModal } from './PaidContentCheckoutModal';
import type { PurchaseMethod } from './PurchaseMethodChooserModal';
import { usePaidCheckoutState } from '@/hooks/usePaidCheckoutState';
import { attemptStatusLabel } from '@/lib/paidContentCheckoutStorage';
import { useBetaGuard } from '@/hooks/useBetaGuard';
import { BetaMonetizationBanner } from '@/components/beta/BetaMonetizationBanner';

interface PaidMediaOverlayProps {
  postId: string;
  price: number;
  sellerName?: string;
  creatorProfileId?: string;
  creatorUsername?: string;
  hasAccess: boolean;
  isOwner: boolean;
  children: React.ReactNode;
  useStaticFallback?: boolean;
  previewBlur?: 'light' | 'medium' | 'strong' | 'none' | null;
}

/**
 * Paid media paywall overlay with golden lock icon
 * Wraps media content and applies blur + purchase CTA when user hasn't paid
 */
export const PaidMediaOverlay = memo(function PaidMediaOverlay({
  postId,
  price,
  sellerName,
  creatorProfileId,
  creatorUsername,
  hasAccess,
  isOwner,
  children,
  useStaticFallback = false,
  previewBlur = 'strong',
}: PaidMediaOverlayProps) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [chosenMethod, setChosenMethod] = useState<PurchaseMethod>('pix');
  const navigate = useNavigate();
  const { latest } = usePaidCheckoutState(postId);
  const { isLocked: betaLocked, lockedLabel, guard } = useBetaGuard('paid_content');

  const openPurchase = () => {
    // Beta lock: nenhuma cobrança é disparada — toast informativo.
    if (betaLocked) {
      guard(() => undefined);
      return;
    }
    // Sempre abre o modal completo com TABS PIX/Cartão visíveis.
    // Se há PIX pendente, restaura PIX automaticamente.
    if (latest?.status === 'pending' && latest.method === 'pix') {
      setChosenMethod('pix');
    } else {
      setChosenMethod('pix');
    }
    setShowCheckout(true);
  };

  // Owner or has access: show content normally
  if (isOwner || hasAccess) {
    return <>{children}</>;
  }

  const handleSubscribeChannel = () => {
    // Prefer the VIP content channel (canal) when we know the username.
    if (creatorUsername) {
      navigate(`/canal/${creatorUsername}`);
      return;
    }
    if (creatorProfileId) navigate(`/creator/${creatorProfileId}?tab=plans`);
  };

  const formattedPrice = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Banner de status persistente (sobrevive a reload via localStorage)
  const statusBanner = latest && latest.status !== 'confirmed' ? (
    <div className={cn(
      "mb-2 rounded-md border px-2 py-1.5 text-[11px] flex items-center justify-between gap-2",
      latest.status === 'pending' && "border-yellow-500/40 bg-yellow-500/10 text-yellow-500",
      latest.status === 'failed' && "border-destructive/40 bg-destructive/10 text-destructive",
      latest.status === 'expired' && "border-muted-foreground/40 bg-muted/30 text-muted-foreground",
    )}>
      <span className="flex items-center gap-1 min-w-0 truncate">
        {latest.status === 'pending' ? <Clock className="h-3 w-3 animate-pulse shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
        <span className="truncate">
          {latest.method.toUpperCase()} · {attemptStatusLabel(latest.status)}
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[10px] px-2 gap-1"
        onClick={(e) => { e.stopPropagation(); openPurchase(); }}
      >
        <QrCode className="h-3 w-3" />
        {latest.status === 'pending' ? 'Ver PIX' : 'Tentar de novo'}
      </Button>
    </div>
  ) : null;

  return (
    <>
      <div className="relative select-none isolate">
        {/* Conteúdo borrado — pointer-events:none impede clique/seleção/drag */}
        <div
          className={cn(
            "pointer-events-none",
            useStaticFallback
              ? "opacity-30"
              : previewBlur === 'none'
                ? ""
                : previewBlur === 'light'
                  ? "blur-paywall-paid blur-paywall-light"
                  : previewBlur === 'medium'
                    ? "blur-paywall-paid blur-paywall-medium"
                    : "blur-paywall-paid blur-paywall-strong"
          )}
          aria-hidden="true"
        >
          {children}
        </div>

        {/* Camada cega: cobre 100% e intercepta TODO clique/contexto/arraste do conteúdo abaixo */}
        <div
          className="absolute inset-0 z-[5] cursor-not-allowed bg-background/35 backdrop-blur-[2px]"
          onClick={(e) => { e.stopPropagation(); openPurchase(); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragStart={(e) => e.preventDefault()}
          onPointerDownCapture={(e) => e.stopPropagation()}
          aria-label="Conteúdo bloqueado — toque para comprar"
          role="button"
        />

        {/* Cartão dourado com CTA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-transparent pointer-events-none">
          <div className="text-center p-4 max-w-[90%] rounded-xl bg-background/75 backdrop-blur-md border border-[hsl(45,93%,47%)]/30 shadow-[0_8px_30px_rgba(0,0,0,0.45)] pointer-events-auto">
            {statusBanner}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] flex items-center justify-center mx-auto mb-2 shadow-[0_0_30px_rgba(234,179,8,0.4)]">
              <Lock className="h-7 w-7 text-[hsl(45,93%,10%)]" />
            </div>

            <p className="text-sm font-semibold text-foreground">Conteúdo Exclusivo</p>
            {sellerName && (
              <p className="text-xs text-muted-foreground mb-1">por {sellerName}</p>
            )}

            <p className="text-3xl font-extrabold text-[hsl(45,93%,55%)] drop-shadow-[0_0_8px_rgba(234,179,8,0.4)] my-2">
              {formattedPrice}
            </p>

            <div className="flex flex-col gap-2 items-center">
              {betaLocked && (
                <BetaMonetizationBanner feature="paid_content" compact className="w-full text-left" />
              )}
              <Button
                size="sm"
                disabled={betaLocked}
                onClick={(e) => { e.stopPropagation(); openPurchase(); }}
                className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold hover:opacity-90 gap-1.5 shadow-[0_0_15px_rgba(234,179,8,0.3)] w-full sm:w-auto disabled:opacity-60"
              >
                {betaLocked ? <Lock className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                {betaLocked ? lockedLabel : <>Comprar mídia · {formattedPrice}</>}
              </Button>
              {creatorProfileId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); handleSubscribeChannel(); }}
                  className="border-[hsl(45,93%,47%)]/40 text-[hsl(45,93%,55%)] hover:bg-[hsl(45,93%,47%)]/10 gap-1.5"
                >
                  <Flame className="h-3.5 w-3.5" />
                  Assinar canal de {sellerName || 'criador'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <PaidContentCheckoutModal
        open={showCheckout}
        onOpenChange={setShowCheckout}
        postId={postId}
        price={price}
        sellerName={sellerName}
        defaultMethod={chosenMethod}
        /* TABS sempre visíveis — usuário escolhe PIX (gera QR) ou Cartão (preenche dados) dentro do modal */
      />
    </>
  );
});
