/**
 * Gerenciar membros pendentes — owner/moderator/master.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Check, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { triggerPush } from '@/lib/pushTrigger';


export function ManageMembersModal({
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
    queryKey: ['oculto_community_pending_members', communityId],
    enabled: open && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_pending_members', { _community: communityId });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 10_000,
  });

  const approve = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('community_approve_member', { _community: communityId, _user: userId });
      if (error) throw error;
      return userId;
    },
    onSuccess: async (userId) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_pending_members', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
      toast.success('Membro aprovado!');
      // Push real (best-effort)
      try {
        const { data: c } = await supabase
          .from('oculto_communities')
          .select('slug,title')
          .eq('id', communityId)
          .maybeSingle();
        triggerPush({
          user_id: userId,
          title: 'Entrada aprovada',
          body: `Você agora faz parte de ${c?.title || 'uma comunidade'}.`,
          url: c?.slug ? `/comunidades/${c.slug}` : '/comunidades',
          type: 'community_member_approved',
          tag: `community_approved_${communityId}`,
        });
      } catch { /* push é best-effort */ }
    },
    onError: () => toast.error('Não foi possível aprovar.'),
  });


  const reject = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('community_reject_member', { _community: communityId, _user: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_pending_members', communityId] });
      toast.success('Solicitação rejeitada.');
    },
    onError: () => toast.error('Não foi possível rejeitar.'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Solicitações pendentes
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {isLoading && <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>}
          {!isLoading && pending.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhuma solicitação pendente.</p>
          )}
          {pending.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <Avatar className="h-9 w-9">
                <AvatarImage src={m.avatar_url || undefined} />
                <AvatarFallback>{(m.username || '?').slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                {/* Privacidade: exibir apenas @username. */}
                <p className="text-sm font-semibold truncate">{m.username ? `@${m.username}` : 'Usuário'}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={() => approve.mutate(m.user_id)} disabled={approve.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => reject.mutate(m.user_id)} disabled={reject.isPending}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
