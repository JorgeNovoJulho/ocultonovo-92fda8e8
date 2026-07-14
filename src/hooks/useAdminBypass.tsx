/**
 * Hook centralizado para bypass de Admin Master
 * Regra de Ouro: Admin Master tem acesso total a todas as telas
 * Usa has_role() RPC no Supabase Externo
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

/**
 * Verifica se o usuário atual é Admin Master
 * usando a função RPC has_role() no banco externo
 */
export function useAdminBypass() {
  const { user } = useAuth();
  const isMasterEmail = user?.email === 'ocultomaster@ocultoswing.com.br';

  const { data: isMasterAdmin, isLoading } = useQuery({
    queryKey: ['admin-master-check', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      if (isMasterEmail) return true;
      
      // Try has_role RPC first (SECURITY DEFINER, no recursion)
      const { data, error } = await (supabase as any)
        .rpc('has_role', { _user_id: user.id, _role: 'admin_master' });
      
      if (error) {
        // Fallback: direct email check for master
        console.warn('[Oculto] has_role RPC failed, using email fallback:', error.message);
        return user.email === 'ocultomaster@ocultoswing.com.br';
      }
      
      return data === true;
    },
    enabled: !!user?.id && !isMasterEmail,
    initialData: isMasterEmail ? true : undefined,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min cache — low RAM friendly
    gcTime: 10 * 60 * 1000,
  });

  return {
    shouldBypass: isMasterAdmin === true,
    isLoading,
    isMasterAdmin,
  };
}

/**
 * Hook para verificar se é admin (qualquer nível)
 * Tenta has_role para cada tipo, com fallback de email
 */
export function useIsAnyAdmin() {
  const { user } = useAuth();
  const isMasterEmail = user?.email === 'ocultomaster@ocultoswing.com.br';

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ['admin-any-check', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      if (isMasterEmail) return true;
      
      // Check admin_master first
      const { data: isMaster, error: e1 } = await (supabase as any)
        .rpc('has_role', { _user_id: user.id, _role: 'admin_master' });
      
      if (!e1 && isMaster) return true;
      
      // Check admin_regional
      const { data: isRegional } = await (supabase as any)
        .rpc('has_role', { _user_id: user.id, _role: 'admin_regional' });
      
      if (isRegional) return true;
      
      // Check moderator
      const { data: isMod } = await (supabase as any)
        .rpc('has_role', { _user_id: user.id, _role: 'moderator' });
      
      if (isMod) return true;
      
      // Final fallback: email check
      return user.email === 'ocultomaster@ocultoswing.com.br';
    },
    enabled: !!user?.id && !isMasterEmail,
    initialData: isMasterEmail ? true : undefined,
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return { isAdmin, isLoading };
}
