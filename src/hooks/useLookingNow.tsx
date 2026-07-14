import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from '@/hooks/use-toast';

export function useLookingNow() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const isLookingNow = (profile as any)?.is_looking_now ?? false;
  const lookingNowSince = (profile as any)?.looking_now_since ?? null;

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!user?.id) throw new Error('Not authenticated');

      const updates: any = {
        is_looking_now: enabled,
        looking_now_since: enabled ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      // If enabling and user has location, notify nearby users
      if (enabled && (profile as any)?.location_lat && (profile as any)?.location_lng) {
        try {
          await supabase.functions.invoke('notify-looking-now', {
            body: {
              profile_id: (profile as any).id,
              user_name: (profile as any).name || 'Alguém',
              lat: (profile as any).location_lat,
              lng: (profile as any).location_lng,
            },
          });
        } catch (notifyError) {
          // Don't fail the main operation if notification fails
          console.warn('Failed to notify nearby users:', notifyError);
        }
      }

      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['radar-users'] });
      
      toast({
        title: enabled ? '🔥 Buscando Agora ativado!' : 'Status desativado',
        description: enabled 
          ? 'Outros usuários podem ver que você está disponível.' 
          : 'Você não aparece mais como "Buscando Agora".',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggle = () => {
    toggleMutation.mutate(!isLookingNow);
  };

  const setLookingNow = (enabled: boolean) => {
    toggleMutation.mutate(enabled);
  };

  return {
    isLookingNow,
    lookingNowSince,
    isUpdating: toggleMutation.isPending,
    toggle,
    setLookingNow,
  };
}
