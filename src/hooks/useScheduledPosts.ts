import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface ScheduledPost {
  id: string;
  scheduled_for: string;
  status: 'pending' | 'failed';
  payload: Record<string, any>;
  last_error: string | null;
  created_at: string;
}

export function useScheduledPosts(enabled = true) {
  return useQuery({
    queryKey: ['scheduled-posts'],
    enabled,
    queryFn: async (): Promise<ScheduledPost[]> => {
      const { data, error } = await (supabase as any).rpc('list_my_scheduled_posts');
      if (error) throw error;
      return (data ?? []) as ScheduledPost[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useSchedulePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { payload: Record<string, any>; scheduled_for: Date }) => {
      const { data, error } = await (supabase as any).rpc('schedule_post', {
        p_payload: args.payload,
        p_scheduled_for: args.scheduled_for.toISOString(),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-posts'] }),
  });
}

export function useCancelScheduledPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc('cancel_scheduled_post', { p_id: id });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-posts'] }),
  });
}
