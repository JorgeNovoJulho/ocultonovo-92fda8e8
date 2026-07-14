import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface CommentEditRecord {
  id: string;
  comment_id: string;
  previous_content: string;
  edited_at: string;
  edited_by: string;
}

export function useCommentEditHistory(commentId: string) {
  return useQuery({
    queryKey: ['comment-edit-history', commentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comment_edit_history')
        .select('id, comment_id, previous_content, edited_at, edited_by')
        .eq('comment_id', commentId)
        .order('edited_at', { ascending: false });
        
      if (error) throw error;
      return data as CommentEditRecord[];
    },
    enabled: !!commentId
  });
}
