import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Ban, Loader2, ShieldOff } from 'lucide-react';
import { useBlockContact, useUnblockContact, useIsBlocked } from '@/hooks/useBlockedContacts';
import { useQueryClient } from '@tanstack/react-query';

interface BlockUserButtonProps {
  targetProfileId: string;
  targetName: string;
}

export function BlockUserButton({ targetProfileId, targetName }: BlockUserButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { isBlocked } = useIsBlocked(targetProfileId);
  const blockContact = useBlockContact();
  const unblockContact = useUnblockContact();
  const queryClient = useQueryClient();
  const isLoading = blockContact.isPending || unblockContact.isPending;

  const handleAction = async () => {
    if (isBlocked) {
      await unblockContact.mutateAsync(targetProfileId);
    } else {
      await blockContact.mutateAsync({ blockedUserId: targetProfileId, blockType: 'blocked' });
      // Optimistic: clear feed and messages cache so blocked user disappears
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
    }
    setShowConfirm(false);
  };

  return (
    <>
      <Button
        variant={isBlocked ? 'outline' : 'ghost'}
        size="sm"
        className={isBlocked
          ? 'gap-2 border-destructive/50 text-destructive hover:bg-destructive/10'
          : 'gap-2 text-muted-foreground hover:text-destructive'
        }
        onClick={() => setShowConfirm(true)}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isBlocked ? (
          <ShieldOff className="h-4 w-4" />
        ) : (
          <Ban className="h-4 w-4" />
        )}
        {isBlocked ? 'Desbloquear' : 'Bloquear'}
      </Button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked ? 'Desbloquear' : 'Bloquear'} {targetName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? `${targetName} poderá ver seu perfil, enviar mensagens e te seguir novamente.`
                : `${targetName} não poderá ver seu perfil, enviar mensagens ou te seguir. Você também deixará de ver o conteúdo dele.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              className={isBlocked ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {isBlocked ? 'Desbloquear' : 'Bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
