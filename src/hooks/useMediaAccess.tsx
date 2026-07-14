import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

/**
 * Check if current user has access to a paid post.
 * Combina: compra real (check_media_access) OR acesso beta (has_beta_post_access).
 */
export function useHasMediaAccess(postId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['media-access', postId, user?.id],
    queryFn: async () => {
      if (!user || !postId) return false;

      const [{ data: realData }, { data: betaData }] = await Promise.all([
        supabase.rpc('check_media_access', { p_user_id: user.id, p_post_id: postId }),
        (supabase as any).rpc('has_beta_post_access', { p_user: user.id, p_post: postId }),
      ]);

      return !!realData || !!betaData;
    },
    enabled: !!user && !!postId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Batch check media access for multiple posts (real + beta).
 */
export function useBatchMediaAccess(postIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['media-access-batch', postIds.join(','), user?.id],
    queryFn: async (): Promise<Record<string, boolean>> => {
      if (!user || postIds.length === 0) return {};

      const [real, beta] = await Promise.all([
        (supabase as any)
          .from('media_access').select('post_id')
          .eq('user_id', user.id).in('post_id', postIds),
        (supabase as any)
          .from('beta_access_grants').select('post_id')
          .eq('user_id', user.id).eq('status', 'active')
          .in('post_id', postIds),
      ]);

      const accessMap: Record<string, boolean> = {};
      postIds.forEach((id) => { accessMap[id] = false; });
      (real.data || []).forEach((row: { post_id: string }) => { accessMap[row.post_id] = true; });
      (beta.data || []).forEach((row: { post_id: string | null }) => {
        if (row.post_id) accessMap[row.post_id] = true;
      });
      return accessMap;
    },
    enabled: !!user && postIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Purchase media access (real — checkout completo via ASAAS).
 */
export function usePurchaseMedia() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId }: { postId: string }) => {
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase.rpc('purchase_media', {
        p_buyer_id: user.id,
        p_post_id: postId,
      });

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Erro ao processar compra');
      }
      return result;
    },
    onSuccess: (data, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['media-access', postId] });
      queryClient.invalidateQueries({ queryKey: ['media-access-batch'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });

      if (!data.already_purchased) {
        toast({
          title: '🎉 Conteúdo desbloqueado!',
          description: `Compra realizada com sucesso.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro na compra',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
