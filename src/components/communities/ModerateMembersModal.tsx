/**
 * Moderar membros — owner/moderator/master.
 * Abas: Pendentes · Ativos · Banidos.
 * Ações: aprovar/rejeitar, promover/rebaixar, banir/desbanir.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import {
  useCommunityActiveMembers,
  useCommunityBannedMembers,
  useSetMemberRole,
  useBanMember,
  useUnbanMember,
} from '@/hooks/useCommunities';
import { Check, X, Crown, Shield, UserMinus, ShieldOff, ShieldPlus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { triggerPush } from '@/lib/pushTrigger';

type Tab = 'pending' | 'active' | 'banned';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  isOwner: boolean;
}

export function ModerateMembersModal({ open, onOpenChange, communityId, isOwner }: Props) {
  const [tab, setTab] = useState<Tab>('pending');
  const qc = useQueryClient();

  // PENDENTES
  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ['oculto_community_pending_members', communityId],
    enabled: open && tab === 'pending' && !!communityId,
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
      qc.invalidateQueries({ queryKey: ['oculto_community_active_members', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
      toast.success('Membro aprovado!');
      try {
        const { data: c } = await supabase.from('oculto_communities').select('slug,title').eq('id', communityId).maybeSingle();
        triggerPush({
          user_id: userId,
          title: 'Entrada aprovada',
          body: `Você agora faz parte de ${c?.title || 'uma comunidade'}.`,
          url: c?.slug ? `/comunidades/${c.slug}` : '/comunidades',
          type: 'community_member_approved',
          tag: `community_approved_${communityId}`,
        });
      } catch { /* push best-effort */ }
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

  // ATIVOS
  const { data: active = [], isLoading: loadingActive } = useCommunityActiveMembers(
    open && tab === 'active' ? communityId : undefined,
    200,
  );
  const setRole = useSetMemberRole(communityId);
  const ban = useBanMember(communityId);

  // BANIDOS
  const { data: banned = [], isLoading: loadingBanned } = useCommunityBannedMembers(
    communityId,
    open && tab === 'banned',
  );
  const unban = useUnbanMember(communityId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Moderar membros</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b border-border mt-2">
          {([
            { k: 'pending', label: 'Pendentes' },
            { k: 'active', label: 'Ativos' },
            { k: 'banned', label: 'Banidos' },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.k ? 'border-fuchsia-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 mt-3">
          {tab === 'pending' && (
            <>
              {loadingPending && <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>}
              {!loadingPending && pending.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhuma solicitação pendente.</p>
              )}
              {pending.map((m: any) => (
                <Row
                  key={m.user_id}
                  avatarUrl={m.avatar_url}
                  name={m.username ? `@${m.username}` : 'Usuário'}
                  username={m.username}
                >
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={() => approve.mutate(m.user_id)} disabled={approve.isPending}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => reject.mutate(m.user_id)} disabled={reject.isPending}>
                    <X className="h-4 w-4" />
                  </Button>
                </Row>
              ))}
            </>
          )}

          {tab === 'active' && (
            <>
              {loadingActive && <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>}
              {!loadingActive && active.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum membro ativo.</p>
              )}
              {active.map((m) => {
                const p = m.profile;
                const isOwnerRow = m.role === 'owner';
                const isMod = m.role === 'moderator';
                return (
                  <Row
                    key={m.user_id}
                    avatarUrl={p?.avatar_url ?? null}
                    name={p?.username ? `@${p.username}` : 'Usuário'}
                    username={p?.username ?? null}
                    badge={
                      isOwnerRow ? (
                        <Badge className="bg-amber-600/30 text-amber-200 text-[9px] h-4 px-1.5 gap-0.5">
                          <Crown className="h-2.5 w-2.5" /> Dono
                        </Badge>
                      ) : isMod ? (
                        <Badge className="bg-blue-600/30 text-blue-200 text-[9px] h-4 px-1.5 gap-0.5">
                          <Shield className="h-2.5 w-2.5" /> Mod
                        </Badge>
                      ) : null
                    }
                  >
                    {!isOwnerRow && isOwner && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={isMod ? 'Rebaixar a membro' : 'Promover a moderador'}
                        onClick={() => setRole.mutate({ user_id: m.user_id, role: isMod ? 'member' : 'moderator' })}
                        disabled={setRole.isPending}
                      >
                        {isMod ? <ShieldOff className="h-4 w-4 text-amber-500" /> : <ShieldPlus className="h-4 w-4 text-blue-500" />}
                      </Button>
                    )}
                    {!isOwnerRow && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-rose-500"
                        title="Banir"
                        onClick={() => {
                          if (window.confirm(`Banir ${p?.username ? `@${p.username}` : 'este membro'} desta comunidade?`)) {
                            ban.mutate({ user_id: m.user_id });
                          }
                        }}
                        disabled={ban.isPending}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </Row>
                );
              })}
            </>
          )}

          {tab === 'banned' && (
            <>
              {loadingBanned && <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>}
              {!loadingBanned && banned.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum membro banido.</p>
              )}
              {banned.map((m: any) => (
                <Row
                  key={m.user_id}
                  avatarUrl={m.avatar_url}
                  name={m.username ? `@${m.username}` : 'Usuário'}
                  username={m.username}
                  badge={<Badge className="bg-rose-700/30 text-rose-200 text-[9px] h-4 px-1.5">Banido</Badge>}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-emerald-500"
                    title="Desbanir"
                    onClick={() => unban.mutate(m.user_id)}
                    disabled={unban.isPending}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </Row>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  avatarUrl,
  name,
  username,
  badge,
  children,
}: {
  avatarUrl: string | null;
  name: string;
  username: string | null;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2">
      <Avatar className="h-9 w-9">
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback>{(name || '?').slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold truncate">{name}</p>
          {badge}
        </div>
        {username && <p className="text-[10px] text-muted-foreground truncate">@{username}</p>}
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
