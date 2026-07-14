import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface PollOption {
  id: string;
  poll_id: string;
  option_text: string;
  option_order: number;
  votes_count: number;
  image_url?: string | null;
  created_at: string;
}

export interface Poll {
  id: string;
  post_id: string;
  creator_id: string;
  question: string;
  entry_cost: number;
  allow_multiple_votes: boolean;
  show_results_before_vote: boolean;
  closes_at: string | null;
  total_votes: number;
  total_revenue: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  options: PollOption[];
}

export interface PollWithVote extends Poll {
  my_vote?: {
    option_id: string;
    amount_paid: number;
  } | null;
}

async function getProfileId(userId: string): Promise<string | null> {
  // Cobre perfis novos (user_id = auth.uid()) e legados (id = auth.uid()).
  const { data } = await supabase
    .from('profiles')
    .select('id, user_id')
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  return (data as any)?.id || null;
}

export function usePollByPostId(postId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['poll', postId],
    queryFn: async () => {
      if (!postId) return null;

      // Fetch poll with options
      const { data: poll, error } = await supabase
        .from('polls')
        .select(`
          *,
          options:poll_options(*)
        `)
        .eq('post_id', postId)
        .single();

      if (error || !poll) return null;

      // Sort options by order
      const sortedPoll = {
        ...poll,
        options: (poll.options || []).sort((a: PollOption, b: PollOption) => a.option_order - b.option_order)
      } as PollWithVote;

      // Check if current user has voted
      if (user?.id) {
        const profileId = await getProfileId(user.id);
        if (profileId) {
          const { data: vote } = await supabase
            .from('poll_votes')
            .select('option_id, amount_paid')
            .eq('poll_id', poll.id)
            .eq('voter_id', profileId)
            .maybeSingle();

          sortedPoll.my_vote = vote;
        }
      }

      return sortedPoll;
    },
    enabled: !!postId,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!postId) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['poll', postId] });
    const unsubOptions = subscribeTable('poll_options', invalidate);
    const unsubPolls = subscribeTable('polls', invalidate);
    return () => {
      unsubOptions();
      unsubPolls();
    };
  }, [postId, queryClient]);

  return query;
}

export function useVoteOnPoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pollId, optionId }: { pollId: string; optionId: string }) => {
      const { data, error } = await supabase.rpc('vote_on_poll', {
        p_poll_id: pollId,
        p_option_id: optionId,
      });

      if (error) throw error;
      
      const result = data as { 
        success: boolean; 
        error?: string; 
        code?: string;
        required?: number;
        available?: number;
        vote_id?: string;
        amount_paid?: number;
        message?: string;
      };

      if (!result.success) {
        // Special handling for insufficient credits
        if (result.code === 'INSUFFICIENT_CREDITS') {
          throw { 
            message: result.error, 
            code: 'INSUFFICIENT_CREDITS',
            required: result.required,
            available: result.available
          };
        }
        throw new Error(result.error || 'Erro ao votar');
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['poll'] });
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      void import('@/lib/auraQuests').then(({ progressAuraQuest }) =>
        progressAuraQuest('vote_poll', 1, { bypassLock: true, reason: 'voto em enquete registrado' })
      ).catch(() => {});
      
      if (data.amount_paid && data.amount_paid > 0) {
        toast.success(`Voto registrado! ${data.amount_paid} créditos debitados.`);
      } else {
        toast.success('Voto registrado com sucesso!');
      }
    },
    onError: (error: any) => {
      if (error.code === 'INSUFFICIENT_CREDITS') {
        // Don't show toast here - let the component handle it
        return;
      }
      toast.error(error.message || 'Erro ao votar na enquete');
    },
  });
}

export function useCreatePoll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (pollData: {
      content_text?: string;
      media_url?: string;
      privacy_level?: 'public' | 'friends' | 'vip';
      question: string;
      options: { text: string; image_url?: string | null }[];
      entry_cost: number;
      allow_multiple_votes: boolean;
      show_results_before_vote: boolean;
      closes_at?: string | null;
    }) => {
      if (!user?.id) throw new Error('Não autenticado');

      const profileId = await getProfileId(user.id);
      if (!profileId) throw new Error('Perfil não encontrado');

      // 1. Create the post (coluna correta no banco externo é author_id)
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: profileId,
          content_text: pollData.content_text,
          media_url: pollData.media_url,
          privacy_level: pollData.privacy_level || 'public',
          post_type: 'poll',
        })
        .select()
        .single();

      if (postError) throw postError;

      // 2. Create the poll
      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert({
          post_id: post.id,
          creator_id: profileId,
          question: pollData.question,
          entry_cost: pollData.entry_cost,
          allow_multiple_votes: pollData.allow_multiple_votes,
          show_results_before_vote: pollData.show_results_before_vote,
          closes_at: pollData.closes_at,
        })
        .select()
        .single();

      if (pollError) {
        // Rollback: delete the post
        await supabase.from('posts').delete().eq('id', post.id);
        throw pollError;
      }

      // 3. Create poll options (com suporte opcional a image_url)
      const optionsToInsert = pollData.options.map((opt, index) => ({
        poll_id: poll.id,
        option_text: opt.text,
        option_order: index,
        image_url: opt.image_url ?? null,
      }));

      const { error: optionsError } = await supabase
        .from('poll_options')
        .insert(optionsToInsert);

      if (optionsError) {
        // Rollback: delete poll and post
        await supabase.from('polls').delete().eq('id', poll.id);
        await supabase.from('posts').delete().eq('id', post.id);
        throw optionsError;
      }

      return { post, poll };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Enquete criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar enquete');
    },
  });
}

export function useMyPollVote(pollId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['poll-vote', pollId, user?.id],
    queryFn: async () => {
      if (!pollId || !user?.id) return null;

      const profileId = await getProfileId(user.id);
      if (!profileId) return null;

      const { data } = await supabase
        .from('poll_votes')
        .select('*')
        .eq('poll_id', pollId)
        .eq('voter_id', profileId);

      return data || [];
    },
    enabled: !!pollId && !!user?.id,
  });
}

export function useUpdatePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      pollId: string;
      postId: string;
      question?: string;
      closes_at?: string | null;
      allow_multiple_votes?: boolean;
      show_results_before_vote?: boolean;
      content_text?: string | null;
      options?: { id?: string; text: string; image_url?: string | null }[];
      /** Quando true, atualiza `posts.created_at = now()` para reabrir a enquete no topo do feed. */
      bumpToTop?: boolean;
    }) => {
      const pollPatch: any = {};
      if (params.question !== undefined) pollPatch.question = params.question;
      if (params.closes_at !== undefined) pollPatch.closes_at = params.closes_at;
      if (params.allow_multiple_votes !== undefined) pollPatch.allow_multiple_votes = params.allow_multiple_votes;
      if (params.show_results_before_vote !== undefined) pollPatch.show_results_before_vote = params.show_results_before_vote;

      if (Object.keys(pollPatch).length > 0) {
        const { error } = await supabase.from('polls').update(pollPatch).eq('id', params.pollId);
        if (error) throw error;
      }

      const postPatch: any = {};
      if (params.content_text !== undefined) postPatch.content_text = params.content_text;
      if (params.bumpToTop) postPatch.created_at = new Date().toISOString();

      if (Object.keys(postPatch).length > 0) {
        const { error } = await supabase
          .from('posts')
          .update(postPatch)
          .eq('id', params.postId);
        if (error) throw error;
      }

      if (params.options) {
        for (const opt of params.options) {
          if (opt.id) {
            const { error } = await supabase
              .from('poll_options')
              .update({ option_text: opt.text, image_url: opt.image_url ?? null })
              .eq('id', opt.id);
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['poll', vars.postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      // Força refetch imediato para o reorder do feed acontecer na hora
      queryClient.refetchQueries({ queryKey: ['posts'], type: 'active' });
      queryClient.refetchQueries({ queryKey: ['posts-infinite'], type: 'active' });
      toast.success(vars.bumpToTop ? 'Enquete reaberta e movida ao topo' : 'Enquete atualizada');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar enquete'),
  });
}

export function useDeletePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pollId, postId }: { pollId: string; postId: string }) => {
      // Apaga o post (cascata remove poll/options/votes se FK ON DELETE CASCADE)
      const { error: postErr } = await supabase.from('posts').delete().eq('id', postId);
      if (postErr) {
        // Fallback: tenta apagar a enquete diretamente
        await supabase.from('poll_votes').delete().eq('poll_id', pollId);
        await supabase.from('poll_options').delete().eq('poll_id', pollId);
        const { error } = await supabase.from('polls').delete().eq('id', pollId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['poll', vars.postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Enquete excluída');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao excluir enquete'),
  });
}
