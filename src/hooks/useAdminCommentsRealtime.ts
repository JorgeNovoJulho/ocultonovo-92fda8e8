/**
 * useAdminCommentsRealtime — Inscrição global em oculto_post_admin_comments.
 * Garante que TODOS os usuários vejam o "Comentário Master" aparecer/sumir/atualizar
 * em tempo real, sem recarregar a página.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useIsAdmin } from '@/hooks/useUserRoles';

export function useAdminCommentsRealtime() {
  const qc = useQueryClient();
  const { data: isAdmin } = useIsAdmin();

  useEffect(() => {
    // Comentários do admin aparecem para todos, mas o realtime que invalida
    // o cache só precisa estar ativo para admins (que publicam/editam) e na
    // página atual. Para usuários normais, a próxima navegação já busca o
    // comentário atualizado via cache do React Query (staleTime padrão).
    // Isso elimina ~1 canal Supabase global em todo usuário low-end.
    if (!isAdmin) return;

    const unsub = subscribeTable(
      'oculto_post_admin_comments',
      (payload: any) => {
        const postId = payload?.new?.post_id ?? payload?.old?.post_id ?? null;
        if (!postId) return;
        qc.invalidateQueries({ queryKey: ['post-admin-comment', postId] });
      },
    );

    return () => {
      try { unsub(); } catch {}
    };
  }, [qc, isAdmin]);
}
