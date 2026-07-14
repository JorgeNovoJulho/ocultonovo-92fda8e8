/**
 * OcultoPlayDeleteConfirmDialog — modal de confirmação para exclusão.
 */
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
import { Loader2, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  title?: string;
  description?: string;
}

export function OcultoPlayDeleteConfirmDialog({
  open, onOpenChange, onConfirm, pending,
  title = 'Excluir este conteúdo?',
  description = 'Essa ação é permanente. O conteúdo será removido do OCULTO PLAY e não poderá ser recuperado.',
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={pending}
            className="bg-rose-600 hover:bg-rose-500 text-white"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
