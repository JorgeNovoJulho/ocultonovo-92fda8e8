import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export function useInvisibleModeStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['invisible-mode-status', user?.id],
    queryFn: async () => {
      if (!user) return { isInvisible: false };

      const { data, error } = await supabase
        .from('profiles')
        .select('is_invisible, plan_type')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      return {
        isInvisible: (data as any)?.is_invisible || false,
        planType: data?.plan_type || 'free',
        isVip: data?.plan_type === 'vip',
      };
    },
    enabled: !!user,
  });
}

export function useToggleInvisibleMode() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isInvisible: boolean) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('profiles')
        .update({ is_invisible: isInvisible } as any)
        .eq('user_id', user.id);

      if (error) throw error;
      return isInvisible;
    },
    onMutate: async (isInvisible) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['invisible-mode-status', user?.id] });
      const prev = queryClient.getQueryData(['invisible-mode-status', user?.id]);
      queryClient.setQueryData(['invisible-mode-status', user?.id], (old: any) => ({
        ...old,
        isInvisible,
      }));
      return { prev };
    },
    onSuccess: (isInvisible) => {
      queryClient.invalidateQueries({ queryKey: ['invisible-mode-status'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: isInvisible ? '🕶️ Modo Invisível Ativo' : 'Modo Invisível Desativado',
        description: isInvisible
          ? 'Você está invisível no radar e offline para todos.'
          : 'Você está visível novamente.',
      });
    },
    onError: (error: Error, _, context: any) => {
      if (context?.prev) {
        queryClient.setQueryData(['invisible-mode-status', user?.id], context.prev);
      }
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
