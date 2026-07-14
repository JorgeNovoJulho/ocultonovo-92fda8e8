import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from 'sonner';

// Schema externo: profile_likes(sender_id, receiver_id, ...)
export function useIsProfileLiked(targetProfileId: string | undefined) {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['profile-liked', profile?.id, targetProfileId],
    queryFn: async () => {
      if (!profile?.id || !targetProfileId) return false;

      const { data, error } = await (supabase as any)
        .from('profile_likes')
        .select('id')
        .eq('sender_id', profile.id)
        .eq('receiver_id', targetProfileId)
        .maybeSingle();

      if (error) {
        console.warn('[profile-liked] select error', error);
      }
      return !!data;
    },
    enabled: !!profile?.id && !!targetProfileId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useToggleProfileLike() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetProfileId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data: existing, error: selErr } = await (supabase as any)
        .from('profile_likes')
        .select('id')
        .eq('sender_id', profile.id)
        .eq('receiver_id', targetProfileId)
        .maybeSingle();

      if (selErr) throw selErr;

      if (existing) {
        const { error: delErr } = await (supabase as any)
          .from('profile_likes')
          .delete()
          .eq('id', existing.id);
        if (delErr) throw delErr;
        return { liked: false };
      } else {
        const { error: insErr } = await (supabase as any)
          .from('profile_likes')
          .insert({ sender_id: profile.id, receiver_id: targetProfileId });
        if (insErr) throw insErr;
        return { liked: true };
      }
    },
    onMutate: async (targetProfileId: string) => {
      const key = ['profile-liked', profile?.id, targetProfileId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData(key, !previous);
      return { previous, key };
    },
    onSuccess: (result, targetProfileId) => {
      // Authoritative server result — overrides optimistic value.
      // Do NOT invalidate here: a refetch right after insert can occasionally
      // race and return empty (RLS replica lag), causing the button to flip
      // back to "Curtir". The setQueryData below is authoritative.
      queryClient.setQueryData(['profile-liked', profile?.id, targetProfileId], result.liked);
      queryClient.invalidateQueries({ queryKey: ['received-profile-likes'] });
      queryClient.invalidateQueries({ queryKey: ['received-profile-likes-count'] });
      queryClient.invalidateQueries({ queryKey: ['pair-matches'] });
      toast.success(result.liked ? '❤️ Curtiu!' : 'Descurtiu');
    },
    onError: (err: any, _vars, context) => {
      if (context?.key && context.previous !== undefined) {
        queryClient.setQueryData(context.key, context.previous);
      }
      console.error('[toggle-profile-like] failed', err);
      toast.error(err?.message ? `Erro: ${err.message}` : 'Erro ao curtir perfil');
    },
  });
}
