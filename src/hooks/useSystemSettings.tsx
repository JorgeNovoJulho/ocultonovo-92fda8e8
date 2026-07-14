import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { useAudit } from './useAudit';

// Use external Supabase client for system_settings
import { supabase as externalClient } from '@/lib/supabaseExternal';

export interface SystemSetting {
  id: string;
  key: string;
  value: string | number | boolean;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

// Fetch all system settings from external DB
export function useSystemSettings() {
  return useQuery({
    queryKey: ['system-settings'],
    queryFn: async (): Promise<Record<string, SystemSetting>> => {
      try {
        const { data, error } = await externalClient
          .from('system_settings')
          .select('*');

        if (error) {
          console.warn('[Oculto] system_settings not available:', error.message);
          return {};
        }

        const settings: Record<string, SystemSetting> = {};
        (data || []).forEach((setting: SystemSetting) => {
          settings[setting.key] = setting;
        });

        return settings;
      } catch {
        return {};
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

// Get a specific setting value
export function useSettingValue<T = string>(key: string, defaultValue: T): T {
  const { data: settings } = useSystemSettings();

  if (!settings || !settings[key]) {
    return defaultValue;
  }

  const value = settings[key].value;

  // Parse JSON value
  if (typeof value === 'string') {
    if (value === 'true') return true as T;
    if (value === 'false') return false as T;
    const num = parseFloat(value);
    if (!isNaN(num)) return num as T;
  }

  return value as T;
}

// Update a system setting (uses external DB)
export function useUpdateSetting() {
  const { user } = useAuth();
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: string;
      value: string | number | boolean;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const stringValue = typeof value === 'boolean' ? value.toString() : String(value);

      const { error } = await externalClient
        .from('system_settings')
        .upsert({
          key,
          value: stringValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

      if (error) throw error;

      await logAction('setting_changed', {
        targetResource: 'system_settings',
        details: { key, new_value: stringValue },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Configuração salva',
        description: 'A alteração foi aplicada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Batch update multiple settings
export function useBatchUpdateSettings() {
  const { user } = useAuth();
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Record<string, string | number | boolean>) => {
      if (!user) throw new Error('User not authenticated');

      const updates = Object.entries(settings).map(async ([key, value]) => {
        const stringValue = typeof value === 'boolean' ? value.toString() : String(value);

        const { error } = await externalClient
          .from('system_settings')
          .upsert({
            key,
            value: stringValue,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });

        if (error) throw error;
      });

      await Promise.all(updates);

      await logAction('setting_changed', {
        targetResource: 'system_settings',
        details: { keys: Object.keys(settings), count: Object.keys(settings).length },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Configurações salvas',
        description: 'Todas as alterações foram aplicadas.',
      });
    },
  });
}
