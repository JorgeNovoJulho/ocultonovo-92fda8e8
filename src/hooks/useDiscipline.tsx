import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useAudit } from './useAudit';
import { toast } from 'sonner';

export interface DisciplineAction {
  id: string;
  profile_id: string;
  action_type: 'freeze' | 'unfreeze' | 'ban' | 'restore' | 'warning' | 'grant_plan' | 'delete_data' | 'shadowban' | 'unshadowban';
  admin_id: string;
  reason: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface BannedUser {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  account_status: string;
  warning_count: number;
  banned_at: string | null;
  ban_reason: string | null;
  frozen_until: string | null;
  is_shadowbanned?: boolean;
  shadowbanned_at?: string | null;
  shadowban_reason?: string | null;
}

// Hook para buscar usuários banidos
export function useBannedUsers() {
  return useQuery({
    queryKey: ['banned-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, username, avatar_url, account_status, warning_count, banned_at, ban_reason, frozen_until')
        .eq('account_status', 'banned')
        .order('banned_at', { ascending: false });
      
      if (error) throw error;
      return data as BannedUser[];
    },
  });
}

// Hook para buscar usuários congelados
export function useFrozenUsers() {
  return useQuery({
    queryKey: ['frozen-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, username, avatar_url, account_status, warning_count, frozen_until')
        .eq('account_status', 'frozen')
        .order('frozen_until', { ascending: true });
      
      if (error) throw error;
      return data as BannedUser[];
    },
  });
}

// Hook para histórico disciplinar de um usuário
export function useDisciplineHistory(profileId: string | undefined) {
  return useQuery({
    queryKey: ['discipline-history', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      
      const { data, error } = await supabase
        .from('discipline_history')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as DisciplineAction[];
    },
    enabled: !!profileId,
  });
}

// Hook para congelar usuário
export function useFreezeUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ profileId, reason, days = 7 }: { profileId: string; reason: string; days?: number }) => {
      const frozenUntil = new Date();
      frozenUntil.setDate(frozenUntil.getDate() + days);

      // Buscar warning_count atual
      const { data: profile } = await supabase
        .from('profiles')
        .select('warning_count')
        .eq('id', profileId)
        .single();

      // Atualizar perfil com incremento
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          account_status: 'frozen',
          frozen_until: frozenUntil.toISOString(),
          warning_count: ((profile?.warning_count as number) || 0) + 1,
        })
        .eq('id', profileId);

      if (profileError) throw profileError;

      // Registrar no histórico disciplinar
      const { error: historyError } = await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'freeze',
          admin_id: user?.id,
          reason,
          details: { days, frozen_until: frozenUntil.toISOString() },
        });

      if (historyError) throw historyError;

      return { profileId, frozenUntil };
    },
    onSuccess: (data) => {
      logAction('user_banned', { targetResource: 'profiles', targetId: data.profileId, details: { action: 'freeze', frozen_until: data.frozenUntil } });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['frozen-users'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-history'] });
      toast.success('Usuário congelado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao congelar usuário: ' + error.message);
    },
  });
}

// Hook para descongelar usuário
export function useUnfreezeUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ profileId, reason }: { profileId: string; reason?: string }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          account_status: 'active',
          frozen_until: null,
        })
        .eq('id', profileId);

      if (profileError) throw profileError;

      const { error: historyError } = await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'unfreeze',
          admin_id: user?.id,
          reason: reason || 'Descongelamento manual',
        });

      if (historyError) throw historyError;

      return profileId;
    },
    onSuccess: (profileId) => {
      logAction('user_unbanned', { targetResource: 'profiles', targetId: profileId });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['frozen-users'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-history'] });
      toast.success('Usuário descongelado');
    },
    onError: (error) => {
      toast.error('Erro ao descongelar: ' + error.message);
    },
  });
}

// Hook para banir usuário manualmente
export function useBanUserDiscipline() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ profileId, reason }: { profileId: string; reason: string }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          account_status: 'banned',
          banned_at: new Date().toISOString(),
          banned_by: user?.id,
          ban_reason: reason,
        })
        .eq('id', profileId);

      if (profileError) throw profileError;

      const { error: historyError } = await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'ban',
          admin_id: user?.id,
          reason,
        });

      if (historyError) throw historyError;

      return profileId;
    },
    onSuccess: (profileId) => {
      logAction('user_banned', { targetResource: 'profiles', targetId: profileId });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['banned-users'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-history'] });
      toast.success('Usuário banido permanentemente');
    },
    onError: (error) => {
      toast.error('Erro ao banir: ' + error.message);
    },
  });
}

// Hook para restaurar acesso de usuário banido
export function useRestoreUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ profileId, reason }: { profileId: string; reason?: string }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          account_status: 'active',
          warning_count: 0,
          banned_at: null,
          banned_by: null,
          ban_reason: null,
          frozen_until: null,
        })
        .eq('id', profileId);

      if (profileError) throw profileError;

      const { error: historyError } = await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'restore',
          admin_id: user?.id,
          reason: reason || 'Restauração de acesso',
        });

      if (historyError) throw historyError;

      return profileId;
    },
    onSuccess: (profileId) => {
      logAction('user_unbanned', { targetResource: 'profiles', targetId: profileId });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['banned-users'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-history'] });
      toast.success('Acesso restaurado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao restaurar: ' + error.message);
    },
  });
}

// Hook para conceder plano gratuitamente
export function useGrantPlan() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ 
      profileId, 
      planType, 
      reason 
    }: { 
      profileId: string; 
      planType: 'premium' | 'vip'; 
      reason?: string;
    }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ plan_type: planType })
        .eq('id', profileId);

      if (profileError) throw profileError;

      const { error: historyError } = await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'grant_plan',
          admin_id: user?.id,
          reason: reason || `Plano ${planType} concedido gratuitamente`,
          details: { plan_type: planType },
        });

      if (historyError) throw historyError;

      return { profileId, planType };
    },
    onSuccess: (data) => {
      logAction('setting_changed', { targetResource: 'profiles', targetId: data.profileId, details: { plan_type: data.planType } });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-history'] });
      toast.success(`Plano ${data.planType} concedido com sucesso`);
    },
    onError: (error) => {
      toast.error('Erro ao conceder plano: ' + error.message);
    },
  });
}

// Hook para apagar dados do usuário definitivamente
export function useDeleteUserData() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ profileId, reason }: { profileId: string; reason?: string }) => {
      // Apagar posts do usuário
      await supabase.from('posts').delete().eq('user_id', profileId);
      
      // Apagar comentários
      await supabase.from('post_comments').delete().eq('user_id', profileId);
      
      // Apagar likes
      await supabase.from('post_likes').delete().eq('user_id', profileId);
      
      // Apagar mensagens
      const { data: conversations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', profileId);
      
      if (conversations) {
        for (const conv of conversations) {
          await supabase.from('messages').delete().eq('conversation_id', conv.conversation_id);
        }
      }
      
      // Registrar antes de apagar o perfil
      await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'ban',
          admin_id: user?.id,
          reason: reason || 'Dados apagados definitivamente',
          details: { action: 'permanent_deletion' },
        });

      // Apagar perfil
      const { error } = await supabase.from('profiles').delete().eq('id', profileId);
      if (error) throw error;

      return profileId;
    },
    onSuccess: (profileId) => {
      logAction('user_banned', { targetResource: 'profiles', targetId: profileId, details: { action: 'permanent_deletion' } });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['banned-users'] });
      toast.success('Dados apagados definitivamente');
    },
    onError: (error) => {
      toast.error('Erro ao apagar dados: ' + error.message);
    },
  });
}

// Hook para buscar usuários shadowbanned
export function useShadowbannedUsers() {
  return useQuery({
    queryKey: ['shadowbanned-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, username, avatar_url, account_status, warning_count, is_shadowbanned, shadowbanned_at, shadowban_reason')
        .eq('is_shadowbanned', true)
        .order('shadowbanned_at', { ascending: false });
      
      if (error) throw error;
      return data as BannedUser[];
    },
  });
}

// Hook para aplicar shadowban em usuário
export function useShadowbanUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ profileId, reason }: { profileId: string; reason: string }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          is_shadowbanned: true,
          shadowbanned_at: new Date().toISOString(),
          shadowbanned_by: user?.id,
          shadowban_reason: reason,
        })
        .eq('id', profileId);

      if (profileError) throw profileError;

      // Registrar no histórico disciplinar
      const { error: historyError } = await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'shadowban',
          admin_id: user?.id,
          reason,
          details: { shadowbanned_at: new Date().toISOString() },
        });

      if (historyError) throw historyError;

      return profileId;
    },
    onSuccess: (profileId) => {
      logAction('user_banned', { targetResource: 'profiles', targetId: profileId, details: { action: 'shadowban' } });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['shadowbanned-users'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-history'] });
      toast.success('Shadowban aplicado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao aplicar shadowban: ' + error.message);
    },
  });
}

// Hook para remover shadowban de usuário
export function useUnshadowbanUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ profileId, reason }: { profileId: string; reason?: string }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          is_shadowbanned: false,
          shadowbanned_at: null,
          shadowbanned_by: null,
          shadowban_reason: null,
        })
        .eq('id', profileId);

      if (profileError) throw profileError;

      const { error: historyError } = await supabase
        .from('discipline_history')
        .insert({
          profile_id: profileId,
          action_type: 'unshadowban',
          admin_id: user?.id,
          reason: reason || 'Shadowban removido',
        });

      if (historyError) throw historyError;

      return profileId;
    },
    onSuccess: (profileId) => {
      logAction('user_unbanned', { targetResource: 'profiles', targetId: profileId, details: { action: 'unshadowban' } });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['shadowbanned-users'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-history'] });
      toast.success('Shadowban removido com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover shadowban: ' + error.message);
    },
  });
}

// Hook para verificar status de congelamento do usuário atual
export function useCurrentUserFreezeStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['freeze-status', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('account_status, frozen_until, warning_count, is_shadowbanned')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}
