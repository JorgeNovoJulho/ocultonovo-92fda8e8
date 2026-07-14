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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountModal({ open, onOpenChange }: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { profile } = useProfile();

  const isLockedAccount =
    (authUser?.email?.toLowerCase() === 'testeapp2026@gmail.com') ||
    (profile?.username?.toLowerCase() === 'testeapp');

  const isConfirmed = !isLockedAccount && confirmText.toUpperCase() === 'EXCLUIR';

  const handleDeleteAccount = async () => {
    if (isLockedAccount) {
      toast({
        title: 'Exclusão bloqueada',
        description: 'Esta conta só pode ser removida pelo administrador master (@ocultomaster).',
        variant: 'destructive',
      });
      return;
    }
    if (!isConfirmed) return;

    setIsDeleting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Você precisa estar logado para excluir sua conta');
      }

      // Tenta via edge function; se falhar (rede/deploy), cai para RPC direta
      let ok = false;
      try {
        const response = await supabase.functions.invoke('delete-account');
        if (!response.error) ok = true;
      } catch {
        // ignora, tenta fallback
      }

      if (!ok) {
        const { error: rpcError } = await supabase.rpc('soft_delete_account', {
          p_user_id: user.id,
          p_reason: 'user_requested',
        });
        if (rpcError) throw new Error(rpcError.message || 'Erro ao excluir conta');
      }

      // Sign out locally
      await supabase.auth.signOut();

      toast({
        title: 'Conta excluída',
        description: 'Sua conta e todos os dados foram removidos permanentemente.',
      });

      navigate('/');
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir conta',
        description: error.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Excluir Conta Permanentemente
          </DialogTitle>
          <DialogDescription>
            Esta ação é <strong>irreversível</strong>. Todos os seus dados, posts, 
            mensagens, assinaturas e saldo serão permanentemente deletados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLockedAccount && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/40">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-500">Conta protegida</p>
                  <p className="mt-1 text-muted-foreground">
                    Esta conta de teste (<strong>@testeapp</strong>) não pode ser excluída por aqui.
                    Apenas o administrador master <strong>@ocultomaster</strong> tem permissão para
                    remover esta conta.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Aviso */}
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-start gap-3">
              <Trash2 className="h-5 w-5 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Você perderá:</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>• Todos os seus posts e mídia</li>
                  <li>• Histórico de mensagens</li>
                  <li>• Saldo disponível na carteira</li>
                  <li>• Assinaturas ativas</li>
                  <li>• Seguidores e quem você segue</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Campo de confirmação */}
          {!isLockedAccount && (
            <div className="space-y-2">
              <Label htmlFor="confirm-delete" className="text-muted-foreground">
                Digite <strong className="text-destructive">EXCLUIR</strong> para confirmar:
              </Label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="EXCLUIR"
                className="border-destructive/50 focus-visible:ring-destructive"
              />
            </div>
          )}
        </div>


        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={isLockedAccount || !isConfirmed || isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Excluir Permanentemente
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
