/**
 * useOcultoReturnHooks — lado do usuário do "Volte para Ver".
 * Lista, marca como vista e dispensa hooks personalizados.
 *
 * Não dispara nada se OCULTO PLAY estiver desligado para o usuário atual.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayEnabled } from '@/hooks/useOcultoPlayEnabled';
import { useAuth } from '@/hooks/useAuth';

export type OcultoReturnHookType =
  | 'comment_reply'
  | 'content_liked'
  | 'content_saved'
  | 'new_from_following'
  | 'continue_watching'
  | 'continue_listening'
  | 'topic_hot'
  | 'challenge_pending';

export interface OcultoReturnHook {
  id: string;
  user_id: string;
  hook_type: OcultoReturnHookType | string;
  title: string;
  description: string | null;
  link: string | null;
  item_id: string | null;
  status: 'pending' | 'seen' | 'completed' | 'dismissed' | 'expired';
  priority: number;
  metadata: Record<string, unknown> | null;
  expires_at: string | null;
  created_at: string;
}

export function useOcultoReturnHooks(limit = 8) {
  const { user } = useAuth();
  const { isEnabledForCurrentUser } = useOcultoPlayEnabled();
  return useQuery<OcultoReturnHook[]>({
    queryKey: ['oculto-return-hooks', user?.id, limit],
    enabled: !!user?.id && isEnabledForCurrentUser,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_return_hooks_list', { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as OcultoReturnHook[];
    },
  });
}

export function useOcultoReturnHookActions() {
  const qc = useQueryClient();

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('oculto_return_hooks_dismiss', { p_id: id });
      if (error) throw error;
      return true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oculto-return-hooks'] }),
  });

  const markSeen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('oculto_return_hooks_mark_seen', { p_id: id });
      if (error) throw error;
      return true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oculto-return-hooks'] }),
  });

  return { dismiss, markSeen };
}
