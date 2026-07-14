import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { invalidateChatBlockCache } from '@/lib/chatIdentity';

export interface BlockedContact {
  id: string;
  user_id: string;
  blocked_user_id: string;
  block_type: 'blocked' | 'muted';
  created_at: string;
  blocked_user?: {
    id: string;
    user_id?: string | null;
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export function useBlockedContacts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['blocked-contacts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get profile id
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from('blocked_contacts')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) {
        // Tabela ainda não existe no DB externo — degrada silenciosamente
        if ((error as any).code === 'PGRST205' || (error as any).code === '42P01') {
          return [];
        }
        console.warn('[blocked_contacts] fetch error:', error.message);
        return [];
      }

      // Fetch blocked user profiles separately
      const contacts = data || [];
      if (contacts.length === 0) return [];
      const blockedUserIds = contacts.map(c => c.blocked_user_id);
      
      const { data: blockedUsers } = await (supabase as any)
        .from('v_public_profiles')
        .select('id, user_id, name, username, avatar_url')
        .in('id', blockedUserIds);

      const userMap = new Map(blockedUsers?.map(u => [u.id, u]) || []);

      return contacts.map(c => ({
        ...c,
        blocked_user: userMap.get(c.blocked_user_id) || undefined,
      })) as BlockedContact[];
    },
    enabled: !!user?.id,
  });
}

export function useIsBlocked(otherProfileId: string) {
  const { data: blockedContacts } = useBlockedContacts();

  const isBlocked = blockedContacts?.some(
    (c) => c.block_type === 'blocked' && (
      c.blocked_user_id === otherProfileId ||
      c.blocked_user?.user_id === otherProfileId
    )
  );
  
  const isMuted = blockedContacts?.some(
    (c) => c.block_type === 'muted' && (
      c.blocked_user_id === otherProfileId ||
      c.blocked_user?.user_id === otherProfileId
    )
  );

  return { isBlocked: !!isBlocked, isMuted: !!isMuted };
}

export function useBlockContact() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      blockedUserId,
      blockType = 'blocked',
    }: {
      blockedUserId: string;
      blockType?: 'blocked' | 'muted';
    }) => {
      if (!user?.id) throw new Error('Não autenticado');

      // Get profile id
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { error } = await supabase
        .from('blocked_contacts')
        .upsert({
          user_id: profile.id,
          blocked_user_id: blockedUserId,
          block_type: blockType,
        }, {
          onConflict: 'user_id,blocked_user_id',
        });

      if (error) throw error;
    },
    onSuccess: (_, { blockType }) => {
      invalidateChatBlockCache();
      const message = blockType === 'muted' 
        ? 'Usuário silenciado com sucesso' 
        : 'Usuário bloqueado com sucesso';
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ['blocked-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast.error('Erro ao processar solicitação');
    },
  });
}

export function useUnblockContact() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockedUserId: string) => {
      if (!user?.id) throw new Error('Não autenticado');

      // Get profile id
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { error } = await supabase
        .from('blocked_contacts')
        .delete()
        .eq('user_id', profile.id)
        .eq('blocked_user_id', blockedUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateChatBlockCache();
      toast.success('Usuário desbloqueado');
      queryClient.invalidateQueries({ queryKey: ['blocked-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast.error('Erro ao desbloquear usuário');
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      // Archive the conversation (soft delete)
      const { error } = await supabase
        .from('conversation_participants')
        .update({ is_archived: true })
        .eq('conversation_id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Conversa excluída');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast.error('Erro ao excluir conversa');
    },
  });
}
