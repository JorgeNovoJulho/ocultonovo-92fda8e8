import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useAudit } from './useAudit';
import { toast } from '@/hooks/use-toast';
import { Json } from '@/integrations/supabase/types';

export type StaffRole = 'admin_master' | 'admin_regional' | 'moderator';

export interface StaffPermissions {
  financialAccess: boolean;
  contentModeration: boolean;
  supportAccess: boolean;
  systemSettings: boolean;
}

export interface StaffMember {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: StaffRole;
  permissions: StaffPermissions;
  region: string | null;
  is_active: boolean;
  created_at: string;
  last_active: string;
}

export interface CreateStaffData {
  name: string;
  email: string;
  role: StaffRole;
  permissions: StaffPermissions;
  region?: string;
}

export interface UpdateStaffData {
  id: string;
  name?: string;
  email?: string;
  role?: StaffRole;
  permissions?: StaffPermissions;
  region?: string;
  is_active?: boolean;
}

const DEFAULT_PERMISSIONS: StaffPermissions = {
  financialAccess: false,
  contentModeration: true,
  supportAccess: true,
  systemSettings: false
};

function parsePermissions(json: Json | null): StaffPermissions {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return DEFAULT_PERMISSIONS;
  }
  
  const obj = json as Record<string, unknown>;
  return {
    financialAccess: typeof obj.financialAccess === 'boolean' ? obj.financialAccess : false,
    contentModeration: typeof obj.contentModeration === 'boolean' ? obj.contentModeration : true,
    supportAccess: typeof obj.supportAccess === 'boolean' ? obj.supportAccess : true,
    systemSettings: typeof obj.systemSettings === 'boolean' ? obj.systemSettings : false
  };
}

function parseRole(role: string): StaffRole {
  if (role === 'admin_master' || role === 'admin_regional' || role === 'moderator') {
    return role;
  }
  return 'moderator';
}

export function useAdminStaff() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['admin-staff'],
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await supabase
        .from('admin_staff')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        id: item.id,
        user_id: item.user_id,
        name: item.name,
        email: item.email,
        role: parseRole(item.role),
        permissions: parsePermissions(item.permissions),
        region: item.region,
        is_active: item.is_active ?? true,
        created_at: item.created_at ?? new Date().toISOString(),
        last_active: item.last_active ?? new Date().toISOString()
      }));
    },
    enabled: !!user
  });
}

export function useCreateStaffMember() {
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateStaffData) => {
      const { error } = await supabase
        .from('admin_staff')
        .insert({
          name: data.name,
          email: data.email,
          role: data.role,
          permissions: data.permissions as unknown as Json,
          region: data.region || null
        });

      if (error) throw error;

      await logAction('staff_created', {
        targetResource: 'admin_staff',
        details: { name: data.name, role: data.role, email: data.email }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      toast({
        title: 'Administrador criado',
        description: 'O novo membro da equipe foi adicionado com sucesso.'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar administrador',
        description: error.message,
        variant: 'destructive'
      });
    }
  });
}

export function useUpdateStaffMember() {
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateStaffData) => {
      const { id, permissions, ...rest } = data;
      
      const updateData: Record<string, unknown> = {
        ...rest,
        last_active: new Date().toISOString()
      };
      
      if (permissions) {
        updateData.permissions = permissions as unknown as Json;
      }
      
      const { error } = await supabase
        .from('admin_staff')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await logAction('staff_updated', {
        targetResource: 'admin_staff',
        targetId: id,
        details: rest
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      toast({
        title: 'Administrador atualizado',
        description: 'As informações foram atualizadas com sucesso.'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive'
      });
    }
  });
}

export function useToggleStaffStatus() {
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('admin_staff')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;

      await logAction(is_active ? 'staff_activated' : 'staff_deactivated', {
        targetResource: 'admin_staff',
        targetId: id
      });
    },
    onSuccess: (_, { is_active }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      toast({
        title: is_active ? 'Administrador ativado' : 'Administrador desativado',
        description: `O status foi alterado com sucesso.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao alterar status',
        description: error.message,
        variant: 'destructive'
      });
    }
  });
}

export function useRemoveStaffMember() {
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Primeiro buscar dados para log
      const { data: staffData } = await supabase
        .from('admin_staff')
        .select('name, email')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('admin_staff')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await logAction('staff_removed', {
        targetResource: 'admin_staff',
        targetId: id,
        details: staffData || {}
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      toast({
        title: 'Administrador removido',
        description: 'O membro foi removido da equipe.'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive'
      });
    }
  });
}

// Hook para contagem de staff por role
export function useStaffStats() {
  const { data: staff } = useAdminStaff();

  const stats = {
    total: staff?.length || 0,
    masters: staff?.filter(s => s.role === 'admin_master').length || 0,
    regionals: staff?.filter(s => s.role === 'admin_regional').length || 0,
    moderators: staff?.filter(s => s.role === 'moderator').length || 0,
    active: staff?.filter(s => s.is_active).length || 0
  };

  return stats;
}
