import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from '@/hooks/use-toast';

export interface NotificationPreferences {
  likes: boolean;
  follows: boolean;
  messages: boolean;
  subscriptions: boolean;
  visits: boolean;
  story_replies: boolean;
  unlocks: boolean;
  push_enabled: boolean;
  looking_now: boolean;
  match_sound: boolean;
  match_vibration: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  likes: true,
  follows: true,
  messages: true,
  subscriptions: true,
  visits: true,
  story_replies: true,
  unlocks: true,
  push_enabled: true,
  looking_now: true,
  match_sound: true,
  match_vibration: true,
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const { profile, isLoading } = useProfile();
  const queryClient = useQueryClient();

  const preferences: NotificationPreferences = {
    ...DEFAULT_PREFERENCES,
    ...((profile as any)?.notification_preferences || {}),
  };

  const updatePreferenceMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const newPreferences = { ...preferences, ...updates };

      const { error } = await supabase
        .from('profiles')
        .update({ notification_preferences: newPreferences } as any)
        .eq('user_id', user.id);

      if (error) throw error;
      return newPreferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao salvar preferências',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updatePreference = (key: keyof NotificationPreferences, value: boolean) => {
    updatePreferenceMutation.mutate({ [key]: value });
  };

  const toggleAll = (enabled: boolean) => {
    updatePreferenceMutation.mutate({
      likes: enabled,
      follows: enabled,
      messages: enabled,
      subscriptions: enabled,
      visits: enabled,
      story_replies: enabled,
      unlocks: enabled,
      push_enabled: enabled,
    });
  };

  const resetToDefaults = () => {
    updatePreferenceMutation.mutate(DEFAULT_PREFERENCES);
    toast({
      title: 'Preferências restauradas',
      description: 'Todas as notificações foram reativadas.',
    });
  };

  return {
    preferences,
    isLoading,
    isUpdating: updatePreferenceMutation.isPending,
    updatePreference,
    toggleAll,
    resetToDefaults,
  };
}
