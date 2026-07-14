/**
 * Modal de tópicos pendentes — owner/mod aprovam ou rejeitam.
 * Disponível quando require_post_approval=true.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Check, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function PendingTopicsModal({
  open,
  onOpenChange,
  communityId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
}) {
  const qc = useQueryClient();
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['oculto_community_pending_topics', communityId],
    enabled: open && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_pending_topics', { _community: communityId });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 10_000,
  });

  const act = useMutation({
    mutationFn: async ({ topicId, approve }: { topicId: string; approve: boolean }) => {
      const { error } = await supabase.rpc('community_topic_approve', { _topic: topicId, _approve: approve });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_pending_topics', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_pending_topics_count', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_topics', communityId] });
      toast.success(vars.approve ? 'Tópico aprovado' : 'Tópico rejeitado');
    },
    onError: () => toast.error('Erro ao processar tópico.'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Tópicos pendentes
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto">
          {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {!isLoading && pending.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum tópico aguardando aprovação.</p>
          )}
          {pending.map((t: any) => (
            <div key={t.id} className="rounded-lg border border-border p-2.5">
              <p className="text-sm font-semibold leading-snug">{t.title}</p>
              {t.body && <p className="text-xs text-muted-foreground line-clamp-3 mt-1 whitespace-pre-wrap">{t.body}</p>}
              <p className="text-[10px] text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ptBR })}
              </p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" className="flex-1 h-8 gap-1"
                  onClick={() => act.mutate({ topicId: t.id, approve: false })} disabled={act.isPending}>
                  <X className="h-3.5 w-3.5" /> Rejeitar
                </Button>
                <Button size="sm" className="flex-1 h-8 gap-1"
                  onClick={() => act.mutate({ topicId: t.id, approve: true })} disabled={act.isPending}>
                  <Check className="h-3.5 w-3.5" /> Aprovar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function usePendingTopicsCount(communityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['oculto_community_pending_topics_count', communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('oculto_community_topics')
        .select('id', { head: true, count: 'exact' })
        .eq('community_id', communityId as string)
        .eq('status', 'pending_review');
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
}
