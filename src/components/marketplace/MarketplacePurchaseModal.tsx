import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ShoppingCart, 
  Wallet, 
  CreditCard, 
  QrCode,
  Loader2,
  CheckCircle2,
  Package,
  AlertCircle
} from 'lucide-react';
import { MarketplaceItem, usePurchaseItem, useHasPurchased } from '@/hooks/useMarketplace';
import { useProfile } from '@/hooks/useProfile';
import confetti from 'canvas-confetti';

interface MarketplacePurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MarketplaceItem | null;
}

export function MarketplacePurchaseModal({ open, onOpenChange, item }: MarketplacePurchaseModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'pix' | 'card'>('balance');
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const purchaseLockRef = useRef(false);
  
  const { profile } = useProfile();
  const { data: hasPurchased } = useHasPurchased(item?.id || null);
  const purchaseItem = usePurchaseItem();

  const userBalance = profile?.balance || 0;
  const canAfford = item ? userBalance >= item.price : false;
  const hasDiscount = item?.original_price && item.original_price > item.price;

  const handlePurchase = async () => {
    if (!item) return;
    // Idempotency guard
    if (purchaseLockRef.current) return;
    purchaseLockRef.current = true;
    try {
      await purchaseItem.mutateAsync({
        itemId: item.id,
        paymentMethod,
      });

      setPurchaseSuccess(true);
      
      // Celebração
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      setTimeout(() => {
        setPurchaseSuccess(false);
        onOpenChange(false);
      }, 3000);
    } catch (error) {
      // Error handled by hook
    } finally {
      purchaseLockRef.current = false;
    }
  };

  const handleClose = () => {
    setPurchaseSuccess(false);
    onOpenChange(false);
  };

  if (!item) return null;

  if (purchaseSuccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="py-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold">Compra Realizada!</h2>
            <p className="text-muted-foreground">
              {item.title} foi adicionado à sua biblioteca.
            </p>
            <Button onClick={handleClose} className="mt-4">
              Acessar Conteúdo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (hasPurchased) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conteúdo já adquirido</DialogTitle>
            <DialogDescription>
              Você já comprou "{item.title}". Acesse na sua biblioteca.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose}>Ver na Biblioteca</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto scrollbar-hide">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Finalizar Compra
          </DialogTitle>
        </DialogHeader>

        {/* Item info */}
        <div className="flex gap-4 p-4 bg-muted/50 rounded-lg">
          {item.thumbnail_url ? (
            <img loading="lazy" decoding="async"
              src={item.thumbnail_url}
              alt={item.title}
              className="w-20 h-20 rounded-lg object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{item.title}</h3>
            {item.creator && (
              <p className="text-sm text-muted-foreground">
                por {item.creator.name}
              </p>
            )}
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-xl font-bold text-primary">
                R$ {item.price.toFixed(2).replace('.', ',')}
              </span>
              {hasDiscount && (
                <span className="text-sm text-muted-foreground line-through">
                  R$ {item.original_price!.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Payment method selection */}
        <div className="space-y-4">
          <h4 className="font-medium">Forma de Pagamento</h4>
          
          <Tabs value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="balance" className="gap-2">
                <Wallet className="h-4 w-4" />
                Saldo
              </TabsTrigger>
              <TabsTrigger value="pix" className="gap-2">
                <QrCode className="h-4 w-4" />
                PIX
              </TabsTrigger>
              <TabsTrigger value="card" className="gap-2">
                <CreditCard className="h-4 w-4" />
                Cartão
              </TabsTrigger>
            </TabsList>

            <TabsContent value="balance" className="mt-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Seu saldo:</span>
                  <span className={`font-bold ${canAfford ? 'text-green-500' : 'text-destructive'}`}>
                    R$ {userBalance.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                {!canAfford && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    Saldo insuficiente. Adicione créditos ou escolha outro método.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="pix" className="mt-4">
              <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>Será gerado um QR Code PIX para pagamento imediato.</p>
                <p className="mt-2">O conteúdo é liberado assim que o pagamento for confirmado.</p>
              </div>
            </TabsContent>

            <TabsContent value="card" className="mt-4">
              <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>Pague com cartão de crédito ou débito.</p>
                <p className="mt-2">Aceitamos Visa, Mastercard, Elo e Amex.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <Separator />

        {/* Summary */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>R$ {item.price.toFixed(2).replace('.', ',')}</span>
          </div>
          {hasDiscount && (
            <div className="flex justify-between text-sm text-green-500">
              <span>Desconto</span>
              <span>-R$ {(item.original_price! - item.price).toFixed(2).replace('.', ',')}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="text-primary">
              R$ {item.price.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handlePurchase}
            disabled={
              purchaseItem.isPending || 
              (paymentMethod === 'balance' && !canAfford)
            }
            className="min-w-[140px]"
          >
            {purchaseItem.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Comprar Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
