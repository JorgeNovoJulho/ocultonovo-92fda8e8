import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { useAudit } from './useAudit';
import { isMasterUsernameVariant, MASTER_EMAIL_CANONICAL, MASTER_USERNAME_CANONICAL } from '@/lib/masterUsername';

export type UserRole = 'admin_master' | 'admin_regional' | 'moderator';
const MASTER_ROLES: UserRole[] = ['admin_master', 'admin_regional', 'moderator'];

export interface UserRoleEntry {
  id: string;
  user_id: string;
  role: UserRole;
  granted_by: string | null;
  granted_at: string;
  user_profile?: {
    name: string;
    avatar_url: string | null;
    email?: string;
  };
}

// Check if current user has a specific role (via has_role RPC)
export function useHasRole(role: UserRole) {
  const { user } = useAuth();
  const isMasterEmail = (user?.email || '').trim().toLowerCase() === 'ocultomaster@ocultoswing.com.br';

  return useQuery({
    queryKey: ['user-role', user?.id, role],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;
      if (isMasterEmail) return true;

      const { data, error } = await (supabase as any)
        .rpc('has_role', { _user_id: user.id, _role: role as string });

      if (error) {
        console.warn('[Oculto] has_role check failed:', error.message);
        return false;
      }
      return data === true;
    },
    enabled: !!user && !isMasterEmail,
    initialData: isMasterEmail ? true : undefined,
    retry: false,
    staleTime: 60_000,
  });
}

// Check if current user is any type of admin (via has_role RPC)
export function useIsAdmin() {
  const { user } = useAuth();
  const isMasterEmail = (user?.email || '').trim().toLowerCase() === 'ocultomaster@ocultoswing.com.br';

  return useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;
      if (isMasterEmail) return true;

      // Check each role via has_role (no recursion)
      for (const role of ['admin_master', 'admin_regional', 'moderator'] as const) {
        const { data } = await (supabase as any)
          .rpc('has_role', { _user_id: user.id, _role: role as string });
        if (data === true) return true;
      }
      // Fallback email check
      return (user.email || '').trim().toLowerCase() === 'ocultomaster@ocultoswing.com.br';
    },
    enabled: !!user && !isMasterEmail,
    initialData: isMasterEmail ? true : undefined,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

// Check if current user is master admin (via has_role RPC + username/email fallback)
const MASTER_USERNAME = MASTER_USERNAME_CANONICAL;
const MASTER_EMAIL = MASTER_EMAIL_CANONICAL;

/** Normaliza removendo espaços, separadores (_,-,.), NFKD, zero-width, lower-case. */
function norm(v: unknown): string {
  return String(v ?? '')
    .normalize('NFKD')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s_\-.]+/g, '')
    .toLowerCase();
}

function matchesMasterUsername(v: unknown): boolean {
  return isMasterUsernameVariant(v);
}

function matchesMasterEmail(v: unknown): boolean {
  return norm(v) === norm(MASTER_EMAIL);
}

export function useIsMasterAdmin() {
  const { user } = useAuth();
  const meta = (user?.user_metadata || {}) as any;
  const candidates: unknown[] = [
    user?.email,
    meta?.email,
    meta?.username,
    meta?.user_name,
    meta?.preferred_username,
    meta?.name,
    meta?.full_name,
  ];
  const fastTrack =
    candidates.some(matchesMasterEmail) || candidates.some(matchesMasterUsername);

  return useQuery({
    queryKey: ['is-master-admin', user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;
      if (fastTrack) return true;

      // Hard timeout: redes instáveis NUNCA podem prender a checagem master.
      // Em caso de timeout/erro retornamos FALSE (default-deny).
      const withTimeout = <T,>(p: PromiseLike<T>, ms = 4000): Promise<T | null> =>
        Promise.race<T | null>([
          Promise.resolve(p) as Promise<T>,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
        ]);

      // 1) has_role RPC
      try {
        const res: any = await withTimeout(
          (supabase as any).rpc('has_role', { _user_id: user.id, _role: 'admin_master' as string })
        );
        if (res && res.data === true) return true;
      } catch { /* segue fallback */ }

      // 2) profiles: username/email/name normalizados
      try {
        const res: any = await withTimeout(
          (supabase as any)
            .from('profiles')
            .select('username,email,name')
            .eq('user_id', user.id)
            .maybeSingle()
        );
        const prof = res?.data;
        if (prof) {
          if (matchesMasterUsername(prof.username)) return true;
          if (matchesMasterEmail(prof.email)) return true;
          if (matchesMasterUsername(prof.name)) return true;
        }
      } catch { /* segue fallback */ }

      return candidates.some(matchesMasterEmail);
    },
    enabled: !!user && !fastTrack,
    initialData: fastTrack ? true : undefined,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

// Get current user's roles
export function useMyRoles() {
  const { user } = useAuth();
  const isMasterEmail = (user?.email || '').trim().toLowerCase() === 'ocultomaster@ocultoswing.com.br';

  return useQuery({
    queryKey: ['my-roles', user?.id],
    queryFn: async (): Promise<UserRole[]> => {
      if (!user) return [];
      if (isMasterEmail) return MASTER_ROLES;

      // Hard timeout default-deny: array vazio quando a rede travar.
      const res: any = await Promise.race([
        (supabase as any).from('user_roles').select('role').eq('user_id', user.id),
        new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 4000)),
      ]);

      if (res?.error || !res?.data) return [];
      return (res.data as { role: UserRole }[]).map((r) => r.role);
    },
    enabled: !!user && !isMasterEmail,
    initialData: isMasterEmail ? MASTER_ROLES : undefined,
    retry: false,
    staleTime: 60_000,
  });
}

// Fetch all user roles (admin only)
export function useAllUserRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async (): Promise<UserRoleEntry[]> => {
      if (!user) return [];

      const { data: roles, error } = await (supabase as any)
        .from('user_roles')
        .select('*')
        .order('granted_at', { ascending: false });

      if (error) throw error;
      const list = (roles || []) as any[];
      if (list.length === 0) return [] as UserRoleEntry[];

      const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))];
      // user_roles.user_id maps to auth.users.id, so resolve via profiles.user_id
      const { data: profiles } = userIds.length
        ? await (supabase as any).from('profiles').select('user_id, name, avatar_url').in('user_id', userIds)
        : { data: [] as any[] };
      const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]));
      return list.map((r) => ({ ...r, user_profile: profileMap.get(r.user_id) || null })) as UserRoleEntry[];
    },
    enabled: !!user,
  });
}

// Assign a role to a user
export function useAssignRole() {
  const { user } = useAuth();
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: UserRole;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await (supabase as any)
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          granted_by: user.id,
        });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Usuário já possui esta permissão');
        }
        throw error;
      }

      // Log the action
      await logAction('role_assigned', {
        targetResource: 'user_roles',
        targetId: userId,
        details: { role },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast({
        title: 'Permissão concedida',
        description: 'O usuário agora tem a nova permissão.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atribuir permissão',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Remove a role from a user
export function useRemoveRole() {
  const { user } = useAuth();
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: UserRole;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await (supabase as any)
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);

      if (error) throw error;

      // Log the action
      await logAction('role_removed', {
        targetResource: 'user_roles',
        targetId: userId,
        details: { role },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast({
        title: 'Permissão removida',
        description: 'A permissão foi revogada com sucesso.',
      });
    },
  });
}

// Role display names
export const roleDisplayNames: Record<UserRole, string> = {
  admin_master: 'Admin Master',
  admin_regional: 'Admin Regional',
  moderator: 'Moderador',
};

// Role colors
export const roleColors: Record<UserRole, string> = {
  admin_master: 'bg-destructive/10 text-destructive border-destructive/30',
  admin_regional: 'bg-primary/10 text-primary border-primary/30',
  moderator: 'bg-secondary/10 text-secondary border-secondary/30',
};
