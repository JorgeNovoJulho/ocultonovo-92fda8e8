import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface CreatorPoll {
  id: string;
  post_id: string;
  question: string;
  entry_cost: number;
  total_votes: number;
  total_revenue: number;
  is_active: boolean;
  closes_at: string | null;
  created_at: string;
  content_text?: string;
  media_url?: string;
  options: {
    id: string;
    option_text: string;
    votes_count: number;
  }[];
}

export interface CreatorPollStats {
  total_polls: number;
  total_votes_received: number;
  total_revenue: number;
  average_votes_per_poll: number;
}

export function useCreatorPolls(creatorId: string | undefined) {
  return useQuery({
    queryKey: ["creator-polls", creatorId],
    queryFn: async (): Promise<CreatorPoll[]> => {
      if (!creatorId) return [];

      // Fetch polls (decoupled from posts)
      const { data: polls, error: pollsError } = await supabase
        .from("polls")
        .select(`
          id,
          post_id,
          question,
          entry_cost,
          total_votes,
          total_revenue,
          is_active,
          closes_at,
          created_at
        `)
        .eq("creator_id", creatorId)
        .order("total_revenue", { ascending: false });

      if (pollsError) throw pollsError;
      if (!polls || polls.length === 0) return [];

      // Fetch related posts in batch
      const postIds = [...new Set(polls.map((p: any) => p.post_id).filter(Boolean))];
      const { data: postsData } = postIds.length
        ? await (supabase as any).from("posts").select("id, content_text, media_url").in("id", postIds)
        : { data: [] as any[] };
      const postMap = new Map<string, any>((postsData || []).map((p: any) => [p.id, p]));

      // Fetch options for all polls
      const pollIds = polls.map((p) => p.id);
      const { data: options, error: optionsError } = await supabase
        .from("poll_options")
        .select("id, poll_id, option_text, votes_count")
        .in("poll_id", pollIds)
        .order("display_order", { ascending: true });

      if (optionsError) throw optionsError;

      // Combine polls with their options
      return polls.map((poll) => ({
        id: poll.id,
        post_id: poll.post_id,
        question: poll.question,
        entry_cost: poll.entry_cost,
        total_votes: poll.total_votes,
        total_revenue: poll.total_revenue,
        is_active: poll.is_active,
        closes_at: poll.closes_at,
        created_at: poll.created_at,
        content_text: postMap.get(poll.post_id)?.content_text,
        media_url: postMap.get(poll.post_id)?.media_url,
        options: (options || [])
          .filter((o) => o.poll_id === poll.id)
          .map((o) => ({
            id: o.id,
            option_text: o.option_text,
            votes_count: o.votes_count,
          })),
      }));
    },
    enabled: !!creatorId,
  });
}

export function useCreatorPollStats(creatorId: string | undefined) {
  return useQuery({
    queryKey: ["creator-poll-stats", creatorId],
    queryFn: async (): Promise<CreatorPollStats> => {
      if (!creatorId) {
        return {
          total_polls: 0,
          total_votes_received: 0,
          total_revenue: 0,
          average_votes_per_poll: 0,
        };
      }

      const { data, error } = await supabase
        .from("polls")
        .select("total_votes, total_revenue")
        .eq("creator_id", creatorId);

      if (error) throw error;

      const total_polls = data?.length || 0;
      const total_votes_received = data?.reduce((sum, p) => sum + (p.total_votes || 0), 0) || 0;
      const total_revenue = data?.reduce((sum, p) => sum + (p.total_revenue || 0), 0) || 0;
      const average_votes_per_poll = total_polls > 0 ? total_votes_received / total_polls : 0;

      return {
        total_polls,
        total_votes_received,
        total_revenue,
        average_votes_per_poll,
      };
    },
    enabled: !!creatorId,
  });
}
