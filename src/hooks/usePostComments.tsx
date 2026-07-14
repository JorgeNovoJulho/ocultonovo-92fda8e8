import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useCanPerformActions } from './useCanPerformActions';
import { toast } from '@/hooks/use-toast';
import { useShadowbanInterceptor } from './useShadowbanInterceptor';
import { resolveActorId } from '@/lib/ensureProfile';

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  is_seed: boolean;
  is_hidden: boolean;
  spam_reason: string | null;
  parent_id: string | null;
  mentioned_users: string[];
  depth: number;
  likes_count: number;
  replies?: PostComment[];
  author: {
    id: string;
    name: string;
    avatar_url: string | null;
    username: string | null;
    is_verified?: boolean;
    plan_type?: string;
    is_seed?: boolean;
  };
}

// ── Organiza comentários em árvore, priorizando verificados/VIP no topo ─
export function buildCommentTree(comments: PostComment[]): PostComment[] {
  const map = new Map<string, PostComment>();
  const roots: PostComment[] = [];

  comments.forEach(c => map.set(c.id, { ...c, replies: [] }));

  comments.forEach(c => {
    const comment = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies!.push(comment);
    } else {
      roots.push(comment);
    }
  });

  const priority = (c: PostComment) => {
    if (c.author?.plan_type === 'vip') return 3;
    if (c.author?.plan_type === 'premium') return 2;
    if (c.author?.is_verified) return 1;
    return 0;
  };
  roots.sort((a, b) => priority(b) - priority(a));

  return roots;
}

export function getSpamWarning(reason: string | null): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'rate_limit':
      return 'Aguarde 30 segundos entre comentários.';
    case 'repetitive_content':
      return 'Comentário muito similar ao anterior foi bloqueado.';
    default:
      return null;
  }
}

const mapProfile = (p: any) => ({
  id: p.id,
  name: p.display_name || p.name || p.full_name || p.username || 'Usuário',
  avatar_url: p.avatar_url || null,
  username: p.username || null,
  is_verified: p.is_verified ?? false,
  plan_type: p.plan_type || 'free',
  is_seed: p.is_seed ?? false,
});

const fallbackAuthor = (userId: string) => ({
  id: userId,
  name: 'Usuário',
  avatar_url: null,
  username: null,
  is_verified: false,
  plan_type: 'free',
  is_seed: false,
});

const resolveCommentProfileId = (comment: Record<string, any>) =>
  comment.user_id || comment.profile_id || comment.author_id || null;

const normalizeCommentRow = (comment: Record<string, any>): Record<string, any> => ({
  ...comment,
  user_id: resolveCommentProfileId(comment),
});

export function usePostComments(postId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!postId) return;
    const unsub = subscribeTable('post_comments', (payload: any) => {
      const row = payload.new || payload.old;
      if (!row || row.post_id !== postId) return;
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    });
    return unsub;
  }, [postId, queryClient]);

  return useQuery({
    queryKey: ['post-comments', postId],
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<PostComment[]> => {
      // Fetch comments WITHOUT FK join and without optional hidden column filter
      const { data, error } = await (supabase as any)
        .from('post_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[Comments] Error fetching comments:', error.message);
        throw error;
      }

      if (!data || data.length === 0) return [];

      // Fetch profiles separately (decoupled)
      const normalizedRows = (data as any[]).map(normalizeCommentRow);
      const userIds = [...new Set(normalizedRows.map(c => c.user_id).filter(Boolean))];
      const profileMap = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id,user_id,display_name,name,full_name,username,avatar_url,is_verified,plan_type')
          .in('id', userIds);

        if (profiles) {
          for (const p of profiles) {
            const mapped = mapProfile(p);
            if (p.id) profileMap.set(p.id, mapped);
          }
        }
      }

      return normalizedRows.map(comment => ({
        id: comment.id,
        post_id: comment.post_id,
        user_id: comment.user_id,
        content: comment.content,
        created_at: comment.created_at,
        updated_at: comment.updated_at || null,
        is_seed: comment.is_seed ?? false,
        is_hidden: comment.is_hidden ?? false,
        spam_reason: comment.spam_reason ?? null,
        parent_id: comment.parent_id || null,
        mentioned_users: comment.mentioned_users || [],
        depth: comment.depth || 0,
        likes_count: comment.likes_count || 0,
        author: profileMap.get(comment.user_id) || fallbackAuthor(comment.user_id),
      })) as PostComment[];
    },
    enabled: !!postId,
  });
}

export function useCreateComment() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const { isSimulatingAsBannedUser } = useShadowbanInterceptor();

  return useMutation({
    mutationFn: async ({
      postId,
      content,
      parentId,
      mentionedUsers,
    }: {
      postId: string;
      content: string;
      parentId?: string;
      mentionedUsers?: string[];
    }) => {
      if (!user) throw new Error('Você precisa estar logado para comentar');
      const commentActorId = await resolveActorId(profile?.id);
      if (!commentActorId) throw new Error('Perfil não encontrado');

      // Rate limit backend-enforced (plan_permissions + usage_limits)
      // Durante o BETA: comentários liberados para todos, sem limites.
      let isBetaMode = false;
      try {
        const { data: phase } = await (supabase as any)
          .from('platform_runtime_settings')
          .select('platform_mode')
          .maybeSingle();
        isBetaMode = (phase as any)?.platform_mode === 'beta';
      } catch { /* segue sem bloquear */ }

      if (!isBetaMode) {
        try {
          const { data: rl } = await (supabase as any).rpc('check_and_increment_usage', { _feature: 'comment' });
          if (rl && rl.allowed === false) {
            const { dispatchRateLimit } = await import('@/components/RateLimitProvider');
            dispatchRateLimit({
              feature: 'comment',
              reason: rl.reason,
              count: rl.count,
              limit: rl.limit,
              resetAt: rl.reset_at,
              plan: rl.plan,
            });
            throw new Error(
              rl.reason === 'feature_disabled'
                ? 'Comentários não disponíveis no seu plano.'
                : `Limite de comentários atingido (${rl.count}/${rl.limit}).`
            );
          }
        } catch (e: any) {
          if (e?.message?.startsWith('Limite') || e?.message?.startsWith('Comentários')) throw e;
          // erro de RPC (rede): não bloqueia — DB ainda é fonte da verdade
        }
      }

      if (isSimulatingAsBannedUser) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return { blocked: false, reason: null, postId };
      }

      // Minimal payload — table only has: id, post_id, user_id, content, created_at
      const basePayload = {
        post_id: postId,
        content,
        ...(parentId ? { parent_id: parentId } : {}),
        ...(mentionedUsers?.length ? { mentioned_users: mentionedUsers } : {}),
      } as Record<string, any>;

      // External DB schema confirmed: post_comments has only `user_id` as actor column.
      // Do NOT attempt profile_id / author_id (they don't exist and cause PGRST204).
      const lastTriedColumn = 'user_id';
      const attempt = await (supabase as any)
        .from('post_comments')
        .insert({ ...basePayload, user_id: commentActorId })
        .select('id')
        .maybeSingle();

      const inserted: any = attempt.data;
      const error: any = attempt.error;

      if (error) {
        const isRLS = error.code === '42501' || error.message?.includes('row-level security');
        const isColumn = error.code === '42703';
        const isUserIdSchemaDrift = isColumn && /\buser_id\b/i.test(error.message || '');
        const isCheck = error.code === '23514';
        const isFK = error.code === '23503';
        console.error(
          `[Comments] Insert FAILED\n` +
          `  Code: ${error.code}\n` +
          `  Message: ${error.message}\n` +
          `  Details: ${error.details}\n` +
          `  Hint: ${error.hint}\n` +
          `  actor id sent: ${commentActorId}\n` +
          `  actor column tried: ${lastTriedColumn}\n` +
          (isRLS
            ? '  ⚠️ RLS POLICY MISSING — Run this SQL on external DB:\n' +
              '  CREATE POLICY "Users can insert own comments" ON public.post_comments\n' +
              '    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());\n'
            : '') +
          (isColumn
            ? isUserIdSchemaDrift
              ? '  ⚠️ DB SCHEMA/POLICY DRIFT — `post_comments.user_id` existe no app, mas alguma policy/trigger/schema do banco externo ainda está desatualizada.\n'
              : '  ⚠️ COLUMN MISMATCH — payload column does not exist.\n'
            : '') +
          (isFK ? '  ⚠️ FK violation — post_id or user_id reference invalid.\n' : '')
        );
        throw new Error(
          isRLS
            ? 'Permissão negada. Faça login novamente.'
            : isUserIdSchemaDrift
            ? 'Estrutura de comentários desatualizada no banco. Aplique a correção SQL.'
            : isColumn
            ? 'Erro de estrutura. Contate o suporte.'
            : isCheck
            ? 'Conteúdo inválido para comentário.'
            : isFK
            ? 'Publicação ou perfil não encontrado.'
            : (error.message || 'Erro ao enviar comentário. Tente novamente.')
        );
      }

      try {
        const { data: post } = await supabase
          .from('posts' as any)
          .select('author_id,user_id')
          .eq('id', postId)
          .maybeSingle();

        const authorId = (post as any)?.author_id || null;
        const ownerProfileId = (post as any)?.user_id || null;

        let recipientAuthId: string | null = authorId;
        if (!recipientAuthId && ownerProfileId) {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('id', ownerProfileId)
            .maybeSingle();
          recipientAuthId = (ownerProfile as any)?.user_id || null;
        }

        if (recipientAuthId && recipientAuthId !== user.id && ownerProfileId !== profile.id) {
          const displayName = profile?.username || profile?.name || 'Alguém';
          await supabase.from('notifications' as any).insert({
            user_id: recipientAuthId,
            type: parentId ? 'reply' : 'comment',
            title: parentId
              ? `@${displayName} respondeu seu comentário`
              : `@${displayName} comentou na sua publicação`,
            body: content,
            data: { actor_id: profile.id, actor_user_id: user.id, post_id: postId },
          });
        }
      } catch {}

      return {
        blocked: false,
        reason: null,
        postId,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', result?.postId] });
      if (!result?.blocked) {
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
        queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
        toast({ title: 'Comentário enviado', description: 'Seu comentário foi publicado com sucesso.' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao comentar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      if (!user) throw new Error('Você precisa estar logado');

      const { error } = await (supabase as any)
        .from('post_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      return { postId, commentId };
    },
    onMutate: async ({ commentId, postId }) => {
      await queryClient.cancelQueries({ queryKey: ['post-comments', postId] });
      const previous = queryClient.getQueryData<PostComment[]>(['post-comments', postId]);
      queryClient.setQueryData<PostComment[]>(['post-comments', postId], old =>
        (old || []).filter(c => c.id !== commentId)
      );
      return { previous, postId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['post-comments', ctx.postId], ctx.previous);
      }
      toast({ title: 'Erro ao excluir', description: 'Não foi possível remover o comentário.', variant: 'destructive' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      toast({ title: 'Comentário removido', description: 'Seu comentário foi excluído.' });
    },
  });
}

export function useEditComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      postId,
      content,
      createdAt,
    }: {
      commentId: string;
      postId: string;
      content: string;
      createdAt: string;
    }) => {
      if (!user) throw new Error('Você precisa estar logado');

      const diffMinutes = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60);
      if (diffMinutes > 5) throw new Error('O tempo para edição expirou (máximo 5 minutos)');

      const { error } = await (supabase as any)
        .from('post_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId);

      if (error) throw error;
      return { postId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', result.postId] });
      toast({ title: 'Comentário editado', description: 'Seu comentário foi atualizado.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao editar', description: error.message, variant: 'destructive' });
    },
  });
}
