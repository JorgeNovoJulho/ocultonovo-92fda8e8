/**
 * Hook para Media Vault - Armazenamento seguro de mídia sensível
 * Gerencia upload, acesso e logs do vault pessoal do usuário
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface VaultItem {
  id: string;
  user_id: string;
  file_name: string;
  file_type: 'image' | 'video' | 'document';
  storage_path: string;
  file_size_bytes: number | null;
  is_encrypted: boolean;
  is_locked: boolean;
  last_accessed_at: string | null;
  access_count: number;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface VaultAccessLog {
  id: string;
  vault_item_id: string;
  user_id: string;
  action: 'view' | 'download' | 'unlock' | 'lock' | 'delete';
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

// Hook para listar itens do vault
export function useVaultItems() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['vault-items', user?.id],
    queryFn: async (): Promise<VaultItem[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('media_vault')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as VaultItem[];
    },
    enabled: !!user,
  });
}

// Hook para adicionar item ao vault
export function useAddVaultItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      file: File;
      notes?: string;
      tags?: string[];
    }) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { file, notes, tags } = params;
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${user.id}/${fileName}`;

      // Upload para storage
      const { error: uploadError } = await supabase.storage
        .from('media-vault')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Determinar tipo de arquivo
      let fileType: 'image' | 'video' | 'document' = 'document';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';

      // Inserir registro no banco
      const { data, error } = await supabase
        .from('media_vault')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_type: fileType,
          storage_path: storagePath,
          file_size_bytes: file.size,
          notes,
          tags,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      toast({
        title: '🔐 Arquivo Adicionado',
        description: 'Arquivo salvo no seu cofre seguro.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao adicionar arquivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para deletar item do vault
export function useDeleteVaultItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: VaultItem) => {
      if (!user) throw new Error('Usuário não autenticado');

      // Deletar do storage
      const { error: storageError } = await supabase.storage
        .from('media-vault')
        .remove([item.storage_path]);

      if (storageError) throw storageError;

      // Deletar registro
      const { error } = await supabase
        .from('media_vault')
        .delete()
        .eq('id', item.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      toast({
        title: 'Arquivo Removido',
        description: 'Arquivo removido permanentemente do cofre.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover arquivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para acessar/visualizar item do vault
export function useAccessVaultItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      // Buscar item
      const { data: item, error: fetchError } = await supabase
        .from('media_vault')
        .select('*')
        .eq('id', itemId)
        .single();

      if (fetchError) throw fetchError;

      // Gerar URL assinada
      const { data: urlData, error: urlError } = await supabase.storage
        .from('media-vault')
        .createSignedUrl(item.storage_path, 3600); // 1 hora

      if (urlError) throw urlError;

      // Atualizar contagem de acessos
      await supabase
        .from('media_vault')
        .update({
          last_accessed_at: new Date().toISOString(),
          access_count: (item.access_count || 0) + 1,
        })
        .eq('id', itemId);

      // Registrar log de acesso
      await supabase.from('vault_access_logs').insert({
        vault_item_id: itemId,
        user_id: user.id,
        action: 'view',
        user_agent: navigator.userAgent,
      });

      return { item, signedUrl: urlData.signedUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
    },
  });
}

// Hook para logs de acesso
export function useVaultAccessLogs(itemId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['vault-access-logs', itemId],
    queryFn: async (): Promise<VaultAccessLog[]> => {
      if (!user) return [];

      let query = supabase
        .from('vault_access_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (itemId) {
        query = query.eq('vault_item_id', itemId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as VaultAccessLog[];
    },
    enabled: !!user,
  });
}

// Hook para estatísticas do vault
export function useVaultStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['vault-stats', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('media_vault')
        .select('file_type, file_size_bytes')
        .eq('user_id', user.id);

      if (error) throw error;

      const items = data || [];
      const totalSize = items.reduce((acc, item) => acc + (item.file_size_bytes || 0), 0);
      const imageCount = items.filter(i => i.file_type === 'image').length;
      const videoCount = items.filter(i => i.file_type === 'video').length;
      const documentCount = items.filter(i => i.file_type === 'document').length;

      return {
        totalItems: items.length,
        totalSize,
        imageCount,
        videoCount,
        documentCount,
        formattedSize: formatBytes(totalSize),
      };
    },
    enabled: !!user,
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
