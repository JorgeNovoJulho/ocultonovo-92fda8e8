import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteConfirmationProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  undoTimeSeconds?: number;
}

export function DeleteConfirmation({ 
  isOpen,
  onConfirm, 
  onCancel,
  undoTimeSeconds = 5 
}: DeleteConfirmationProps) {
  const [stage, setStage] = useState<'confirm' | 'undo'>('confirm');
  const [undoProgress, setUndoProgress] = useState(100);
  const [undoRemaining, setUndoRemaining] = useState(undoTimeSeconds);
  
  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStage('confirm');
      setUndoProgress(100);
      setUndoRemaining(undoTimeSeconds);
    }
  }, [isOpen, undoTimeSeconds]);

  const handleUndo = useCallback(() => {
    setStage('confirm');
    onCancel();
  }, [onCancel]);

  const handleConfirmClick = useCallback(() => {
    setStage('undo');
  }, []);
  
  useEffect(() => {
    if (stage !== 'undo') return;
    
    const startTime = Date.now();
    const totalMs = undoTimeSeconds * 1000;
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingMs = totalMs - elapsed;
      const remainingSec = remainingMs / 1000;
      
      setUndoRemaining(remainingSec);
      setUndoProgress((remainingMs / totalMs) * 100);
      
      if (remainingMs <= 0) {
        clearInterval(interval);
        onConfirm();
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [stage, undoTimeSeconds, onConfirm]);
  
  if (!isOpen) return null;

  if (stage === 'undo') {
    return (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4">
        <div className="bg-card border shadow-lg rounded-lg p-4 flex items-center gap-4 min-w-[300px]">
          <div className="flex-1">
            <p className="text-sm font-medium">Comentário excluído</p>
            <Progress value={undoProgress} className="h-1 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.ceil(undoRemaining)}s para desfazer
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleUndo}
            className="gap-1"
          >
            <Undo2 className="h-4 w-4" />
            Desfazer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Excluir comentário?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação pode ser desfeita nos próximos {undoTimeSeconds} segundos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirmClick}>
            Excluir
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
