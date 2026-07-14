import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';

export interface PlatformAddon {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  icon: string;
  is_active: boolean;
  compatible_plans: string[];
  created_at: string;
  updated_at: string;
}

// Buscar todos os add-ons
export function usePlatformAddons() {
  return useQuery({
    queryKey: ['platform-addons'],
    queryFn: async (): Promise<PlatformAddon[]> => {
      const { data, error } = await supabase
        .from('platform_addons')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as PlatformAddon[];
    },
  });
}

// Buscar apenas add-ons ativos
export function useActiveAddons() {
  return useQuery({
    queryKey: ['platform-addons', 'active'],
    queryFn: async (): Promise<PlatformAddon[]> => {
      const { data, error } = await supabase
        .from('platform_addons')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as PlatformAddon[];
    },
  });
}

// Criar novo add-on
export function useCreateAddon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (addon: Omit<PlatformAddon, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('platform_addons')
        .insert(addon)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-addons'] });
      toast({
        title: 'Add-on criado',
        description: 'O novo add-on foi adicionado com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Atualizar add-on
export function useUpdateAddon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<PlatformAddon, 'id' | 'created_at' | 'updated_at'>>;
    }) => {
      const { error } = await supabase
        .from('platform_addons')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-addons'] });
      toast({
        title: 'Add-on atualizado',
        description: 'As alterações foram salvas com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Toggle status do add-on
export function useToggleAddonStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('platform_addons')
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['platform-addons'] });
      toast({
        title: isActive ? 'Add-on ativado' : 'Add-on desativado',
        description: `O add-on foi ${isActive ? 'ativado' : 'desativado'} com sucesso.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Deletar add-on
export function useDeleteAddon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_addons')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-addons'] });
      toast({
        title: 'Add-on removido',
        description: 'O add-on foi deletado com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}