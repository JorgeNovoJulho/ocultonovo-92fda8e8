import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useCancelSubscription, MySubscription } from '@/hooks/useMySubscriptions';

interface CancelSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: MySubscription | null;
}

export function CancelSubscriptionModal({ 
  open, 
  onOpenChange, 
  subscription 
}: CancelSubscriptionModalProps) {
  const cancelMutation = useCancelSubscription();

  const handleCancel = async () => {
    if (!subscription) return;
    
    await cancelMutation.mutateAsync(subscription.id);
    onOpenChange(false);
  };

  if (!subscription) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cancelar Assinatura
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja cancelar sua assinatura?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Criador */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/30">
            <Avatar className="h-12 w-12">
              <AvatarImage 
                src={subscription.creator?.avatar_url || ''} 
                alt={subscription.creator?.name || ''} 
              />
              <AvatarFallback>
                {subscription.creator?.name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-semibold">{subscription.creator?.name}</p>
              <p className="text-sm text-muted-foreground">
                @{subscription.creator?.username || 'usuario'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold">
                R$ {subscription.price?.toFixed(2)}
                <span className="text-xs text-muted-foreground font-normal">/mês</span>
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Você perderá acesso ao conteúdo exclusivo deste criador imediatamente após o cancelamento.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cancelMutation.isPending}
          >
            Manter Assinatura
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
            className="gap-2"
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelando...
              </>
            ) : (
              'Cancelar Assinatura'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
