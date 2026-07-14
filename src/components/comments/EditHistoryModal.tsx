import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useCommentEditHistory } from '@/hooks/useCommentEditHistory';

interface EditHistoryModalProps {
  commentId: string | null;
  currentContent: string;
  onClose: () => void;
}

export function EditHistoryModal({ commentId, currentContent, onClose }: EditHistoryModalProps) {
  const { data: history, isLoading } = useCommentEditHistory(commentId || '');
  
  return (
    <Dialog open={!!commentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Edições
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {/* Versão atual */}
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-primary">Versão atual</span>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{currentContent}</p>
            </div>
            
            {/* Versões anteriores */}
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : history && history.length > 0 ? (
              history.map((record, index) => (
                <div key={record.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      Versão anterior #{history.length - index}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(record.edited_at), {
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {record.previous_content}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum histórico de edição encontrado
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
