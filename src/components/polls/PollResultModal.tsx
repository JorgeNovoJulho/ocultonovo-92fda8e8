import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PollCard } from './PollCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { usePollByPostId } from '@/hooks/usePolls';

interface PollResultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string | null;
}

/**
 * Mostra o PollCard completo (resultados + % + total de votos + status).
 * - Faz prefetch dos dados ao abrir.
 * - Exibe skeleton enquanto a enquete carrega.
 */
export function PollResultModal({ open, onOpenChange, postId }: PollResultModalProps) {
  const qc = useQueryClient();
  const { isLoading } = usePollByPostId(open && postId ? postId : undefined);

  // Prefetch ao abrir, garantindo dados frescos rapidamente.
  useEffect(() => {
    if (!open || !postId) return;
    qc.prefetchQuery({
      queryKey: ['poll', postId],
      queryFn: async () => {
        const { data } = await supabase
          .from('polls')
          .select('*, options:poll_options(*)')
          .eq('post_id', postId)
          .single();
        if (!data) return null;
        return {
          ...data,
          options: (data.options || []).sort(
            (a: any, b: any) => a.option_order - b.option_order
          ),
        };
      },
      staleTime: 1000 * 30,
    });
  }, [open, postId, qc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="sr-only">Resultado da enquete</DialogTitle>
        </DialogHeader>
        <div className="px-2 pb-4 max-h-[80vh] overflow-y-auto">
          {postId ? (
            isLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </div>
            ) : (
              <PollCard postId={postId} className="border-0 shadow-none" />
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
