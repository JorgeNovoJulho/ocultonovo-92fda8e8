import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

// Hook para verificar status do Modo Fantasma do usuário
export function useGhostModeStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['ghost-mode-status', user?.id],
    queryFn: async () => {
      if (!user) return { hasGhostMode: false, isGhostActive: false };

      const { data, error } = await supabase
        .from('profiles')
        .select('has_ghost_mode, is_ghost_active')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[GhostMode] fetch error:', error.message);
        return { hasGhostMode: false, isGhostActive: false };
      }

      return {
        hasGhostMode: data?.has_ghost_mode || false,
        isGhostActive: data?.is_ghost_active || false,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    retry: 1,
  });
}

// Toggle do Modo Fantasma (ativar/desativar)
export function useToggleGhostActive() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('profiles')
        .update({ is_ghost_active: isActive } as any)
        .eq('id', user.id);

      if (error) throw error;
      return isActive;
    },
    onMutate: async (isActive) => {
      await queryClient.cancelQueries({ queryKey: ['ghost-mode-status', user?.id] });
      const prev = queryClient.getQueryData(['ghost-mode-status', user?.id]);
      queryClient.setQueryData(['ghost-mode-status', user?.id], (old: any) => ({
        ...old,
        isGhostActive: isActive,
      }));
      return { prev };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.prev) {
        queryClient.setQueryData(['ghost-mode-status', user?.id], context.prev);
      }
      toast({ title: 'Erro', description: 'Falha ao alterar modo fantasma.', variant: 'destructive' });
    },
    onSuccess: (isActive) => {
      toast({
        title: isActive ? '👻 Modo Fantasma Ativo' : 'Modo Fantasma Desativado',
        description: isActive ? 'Você está invisível.' : 'Visitas registradas normalmente.',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ghost-mode-status'] });
    },
  });
}

// Ativar o add-on Modo Fantasma para o usuário (após compra)
export function useActivateGhostMode() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('profiles')
        .update({ 
          has_ghost_mode: true,
          is_ghost_active: true,
        } as any)
        .eq('id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ghost-mode-status'] });
      toast({
        title: '👻 Modo Fantasma Desbloqueado!',
        description: 'Agora você pode navegar de forma invisível.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao ativar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Verificar se pode usar Ghost Mode (verificação completa)
export function useCanUseGhostMode() {
  const { data: status } = useGhostModeStatus();
  
  return {
    canToggle: status?.hasGhostMode || false,
    isActive: status?.isGhostActive || false,
  };
}
