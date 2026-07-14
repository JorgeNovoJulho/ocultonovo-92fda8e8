import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAudit } from './useAudit';
import { toast } from './use-toast';
import { getCachedData, cacheData } from '@/lib/resilience';

export interface AdminUser {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  username: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_creator: boolean;
  is_verified: boolean;
  is_seed: boolean;
  created_at: string;
  balance: number;
  plan_type: string | null;
  bio: string | null;
  document_url: string | null;
  document_verified: boolean;
  warning_count: number;
  account_status: 'active' | 'frozen' | 'banned';
  frozen_until: string | null;
  status: 'active' | 'banned' | 'pending' | 'frozen';
  gender?: string | null;
  profile_type?: string | null;
  last_seen?: string | null;
  login_count: number;
  last_login_at: string | null;
}


interface UseAdminUsersOptions {
  showSeed?: boolean;
  statusFilter?: string;
  roleFilter?: string;
  searchQuery?: string;
}

export function useAdminUsers(options: UseAdminUsersOptions = {}) {
  const { showSeed = false, statusFilter = 'all', roleFilter = 'all', searchQuery = '' } = options;

  return useQuery({
    queryKey: ['admin-users', { showSeed, statusFilter, roleFilter, searchQuery }],
    queryFn: async (): Promise<AdminUser[]> => {
      // Núcleo mínimo (sempre existe em profiles).
      const coreCols = [
        'id','user_id','name','username','avatar_url',
        'is_creator','is_verified','is_seed','created_at','updated_at','plan_type','bio',
      ];
      // Colunas opcionais — se qualquer uma faltar no schema, removemos a
      // ofensora e tentamos de novo até o select passar.
      const optionalCols = [
        'kyc_document_url','is_oculto_verified','warning_count','account_status','frozen_until',
        'gender','profile_type','last_seen','balance','login_count','last_login_at',
      ];

      const runSelect = async (cols: string[]) => {
        let q = (supabase as any)
          .from('profiles')
          .select(cols.join(','))
          .order('created_at', { ascending: false })
          .limit(500);
        if (roleFilter === 'creator') q = q.eq('is_creator', true);
        else if (roleFilter === 'user') q = q.eq('is_creator', false);
        return q;
      };

      // Tenta com tudo; em caso de "column X does not exist", remove X e
      // refaz, até no máximo N rodadas. Garante que o painel nunca quebre
      // por causa de uma única coluna ausente.
      let activeOptional = [...optionalCols];
      let { data, error } = await runSelect([...coreCols, ...activeOptional]);
      let safety = optionalCols.length + 2;
      while (error && safety > 0) {
        const msg = String(error.message || '');
        const m = msg.match(/column\s+(?:profiles\.)?"?([a-z0-9_]+)"?\s+does not exist/i);
        if (!m) break;
        const bad = m[1];
        const before = activeOptional.length;
        activeOptional = activeOptional.filter((c) => c !== bad);
        if (activeOptional.length === before) break; // não estava na lista, sai
        console.warn('[useAdminUsers] removendo coluna ausente:', bad);
        const retry = await runSelect([...coreCols, ...activeOptional]);
        data = retry.data;
        error = retry.error;
        safety -= 1;
      }



      if (error) {
        // Fallback: return cached data if available
        const cached = getCachedData<AdminUser[]>('admin-users');
        if (cached) return cached;
        throw error;
      }

      // Map profiles to AdminUser format and apply client-side filters
      let users: AdminUser[] = (data || []).map((profile) => {
        // Determine status from account_status
        const accountStatus = (profile.account_status as 'active' | 'frozen' | 'banned') || 'active';
        let status: 'active' | 'banned' | 'pending' | 'frozen' = 'active';
        if (accountStatus === 'banned') {
          status = 'banned';
        } else if (accountStatus === 'frozen') {
          status = 'frozen';
        } else if (!profile.is_verified) {
          status = 'pending';
        }

        const displayName = profile.name || profile.username || 'Usuário';

        return {
          id: profile.id,
          user_id: profile.user_id || profile.id,
          name: displayName,
          display_name: null,
          email: null,
          role: null,
          username: profile.username,
          avatar_url: profile.avatar_url,
          banner_url: null,
          is_creator: profile.is_creator || false,
          is_verified: profile.is_verified || false,
          is_seed: profile.is_seed || false,
          created_at: profile.updated_at || profile.created_at || new Date().toISOString(),
          balance: profile.balance || 0,
          plan_type: profile.plan_type,
          bio: profile.bio,
          document_url: profile.kyc_document_url ?? null,
          document_verified: Boolean(profile.is_oculto_verified ?? false),
          warning_count: profile.warning_count || 0,
          account_status: accountStatus,
          frozen_until: profile.frozen_until,
          status,
          gender: profile.gender ?? null,
          profile_type: profile.profile_type ?? null,
          last_seen: profile.last_seen ?? null,
          login_count: Number(profile.login_count ?? 0),
          last_login_at: profile.last_login_at ?? null,
        } as AdminUser;
      });


      // Apply search filter
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        users = users.filter(
          (user) =>
            user.name?.toLowerCase().includes(lowerQuery) ||
            user.display_name?.toLowerCase().includes(lowerQuery) ||
            user.username?.toLowerCase().includes(lowerQuery) ||
            user.email?.toLowerCase().includes(lowerQuery)
        );
      }

      // Apply status filter
      if (statusFilter !== 'all') {
        users = users.filter((user) => user.status === statusFilter);
      }

      // Cache for offline resilience
      cacheData('admin-users', users);
      return users;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    staleTime: 30_000,
    placeholderData: (prev: AdminUser[] | undefined) => prev,
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({
          account_status: 'banned',
          banned_at: new Date().toISOString(),
          ban_reason: reason,
        })
        .eq('id', userId);

      if (error) throw error;

      await logAction('user_banned', {
        targetResource: 'profiles',
        targetId: userId,
        details: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Usuário banido',
        description: 'O usuário foi banido da plataforma.',
        variant: 'destructive',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao banir usuário',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUnbanUser() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({
          account_status: 'active',
          banned_at: null,
          ban_reason: null,
        })
        .eq('id', userId);

      if (error) throw error;

      await logAction('user_unbanned', {
        targetResource: 'profiles',
        targetId: userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Ban removido',
        description: 'O usuário pode acessar a plataforma novamente.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover ban',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useVerifyUser() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', userId);

      if (error) throw error;

      await logAction('user_verified', {
        targetResource: 'profiles',
        targetId: userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Usuário verificado',
        description: 'O usuário foi verificado manualmente.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao verificar usuário',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useAdminUserStats() {
  return useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: async () => {
      try {
        const [totalResult, seedResult, creatorsResult, verifiedResult] = await Promise.all([
          (supabase as any).from('profiles').select('*', { count: 'exact', head: true }),
          (supabase as any).from('profiles').select('*', { count: 'exact', head: true }).eq('is_seed', true),
          (supabase as any).from('profiles').select('*', { count: 'exact', head: true }).eq('is_creator', true).or('is_seed.eq.false,is_seed.is.null'),
          (supabase as any).from('profiles').select('*', { count: 'exact', head: true }).eq('is_verified', true).or('is_seed.eq.false,is_seed.is.null'),
        ]);

        if (totalResult.error) throw totalResult.error;

        const stats = {
          totalUsers: totalResult.count || 0,
          seedUsers: seedResult.count || 0,
          creators: creatorsResult.count || 0,
          verified: verifiedResult.count || 0,
        };
        cacheData('admin-user-stats', stats);
        return stats;
      } catch {
        return getCachedData<{ totalUsers: number; seedUsers: number; creators: number; verified: number }>('admin-user-stats') || 
          { totalUsers: 0, seedUsers: 0, creators: 0, verified: 0 };
      }
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    staleTime: 30_000,
  });
}
