import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAudit } from './useAudit';
import { toast } from '@/hooks/use-toast';

export interface AdminPost {
  id: string;
  content_text: string | null;
  media_url: string | null;
  privacy_level: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  is_seed: boolean;
  is_flash: boolean;
  is_locked: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  author: {
    id: string;
    name: string;
    avatar_url: string | null;
    username: string | null;
    is_seed: boolean;
    is_verified: boolean;
  } | null;
}

export interface UseAdminPostsOptions {
  showSeed?: boolean;
  privacyFilter?: 'all' | 'public' | 'friends' | 'vip';
  statusFilter?: 'all' | 'active' | 'hidden';
  searchQuery?: string;
  sortBy?: 'recent' | 'popular' | 'comments';
  page?: number;
  pageSize?: number;
}

export interface PaginatedPosts {
  posts: AdminPost[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

export function useAdminPosts(options: UseAdminPostsOptions = {}) {
  const {
    showSeed = true,
    privacyFilter = 'all',
    statusFilter = 'all',
    searchQuery = '',
    sortBy = 'recent',
    page = 1,
    pageSize = 25,
  } = options;

  return useQuery({
    queryKey: ['admin-posts', showSeed, privacyFilter, statusFilter, searchQuery, sortBy, page, pageSize],
    queryFn: async (): Promise<PaginatedPosts> => {
      let countQuery = supabase
        .from('posts')
        .select('id', { count: 'exact', head: true });

      if (!showSeed) countQuery = countQuery.eq('is_seed', false);
      if (privacyFilter !== 'all') countQuery = countQuery.eq('privacy_level', privacyFilter);
      if (statusFilter === 'active') countQuery = countQuery.eq('is_hidden', false);
      else if (statusFilter === 'hidden') countQuery = countQuery.eq('is_hidden', true);

      const { count } = await countQuery;
      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      let query = supabase.from('posts').select(`id, content_text, media_url, privacy_level, is_hidden, hidden_reason, hidden_at, hidden_by, is_seed, is_flash, is_locked, likes_count, comments_count, created_at, updated_at, user_id`);

      if (!showSeed) query = query.eq('is_seed', false);
      if (privacyFilter !== 'all') query = query.eq('privacy_level', privacyFilter);
      if (statusFilter === 'active') query = query.eq('is_hidden', false);
      else if (statusFilter === 'hidden') query = query.eq('is_hidden', true);

      if (sortBy === 'popular') query = query.order('likes_count', { ascending: false });
      else if (sortBy === 'comments') query = query.order('comments_count', { ascending: false });
      else query = query.order('created_at', { ascending: false });

      const from = (page - 1) * pageSize;
      query = query.range(from, from + pageSize - 1);

      const { data: postsData, error } = await query;
      if (error) throw error;

      const userIds = [...new Set(postsData?.map(p => p.user_id) || [])];
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase.from('profiles').select('id, name, username, avatar_url, is_seed, is_verified').in('id', userIds);
        profiles = profilesData || [];
      }
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      let posts: AdminPost[] = (postsData || []).map(post => ({
        ...post,
        privacy_level: post.privacy_level || 'public',
        is_hidden: post.is_hidden || false,
        is_seed: post.is_seed || false,
        is_flash: post.is_flash || false,
        is_locked: post.is_locked || false,
        likes_count: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        author: profileMap.get(post.user_id) || null,
      }));

      if (searchQuery.trim()) {
        const s = searchQuery.toLowerCase();
        posts = posts.filter(p => p.content_text?.toLowerCase().includes(s) || p.author?.name?.toLowerCase().includes(s) || p.author?.username?.toLowerCase().includes(s));
      }

      return { posts, totalCount, totalPages, currentPage: page };
    },
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });
}

export interface EngagementStats {
  total: number;
  real: { count: number; totalLikes: number; totalComments: number };
  seed: { count: number; totalLikes: number; totalComments: number };
  hidden: number;
}

export function useAdminPostStats(enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-post-stats'],
    enabled,
    staleTime: 60_000, // 1min — stats agregadas mudam pouco
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<EngagementStats> => {
      // ✅ RPC agregada no DB — sem limite de linhas, COUNT/SUM nativo.
      const { data, error } = await supabase.rpc('admin_post_stats_aggregated' as any);
      if (!error && data) {
        const d = data as any;
        return {
          total: Number(d.total || 0),
          hidden: Number(d.hidden || 0),
          real: {
            count: Number(d.real?.count || 0),
            totalLikes: Number(d.real?.totalLikes || 0),
            totalComments: Number(d.real?.totalComments || 0),
          },
          seed: {
            count: Number(d.seed?.count || 0),
            totalLikes: Number(d.seed?.totalLikes || 0),
            totalComments: Number(d.seed?.totalComments || 0),
          },
        };
      }

      // 🔁 Fallback (RPC ainda não aplicada no banco): mantém limite de 5000.
      const { data: posts, error: fbErr } = await supabase
        .from('posts')
        .select('id, is_seed, is_hidden, likes_count, comments_count')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (fbErr) throw fbErr;
      const arr = posts || [];
      const realPosts = arr.filter(p => !p.is_seed);
      const seedPosts = arr.filter(p => p.is_seed);
      return {
        total: arr.length,
        real: { count: realPosts.length, totalLikes: realPosts.reduce((s, p) => s + (p.likes_count || 0), 0), totalComments: realPosts.reduce((s, p) => s + (p.comments_count || 0), 0) },
        seed: { count: seedPosts.length, totalLikes: seedPosts.reduce((s, p) => s + (p.likes_count || 0), 0), totalComments: seedPosts.reduce((s, p) => s + (p.comments_count || 0), 0) },
        hidden: arr.filter(p => p.is_hidden).length,
      };
    },
  });
}

export function useHidePost() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();
  return useMutation({
    mutationFn: async ({ postId, reason }: { postId: string; reason: string }) => {
      const { error } = await supabase.from('posts').update({ is_hidden: true, hidden_reason: reason, hidden_at: new Date().toISOString() }).eq('id', postId);
      if (error) throw error;
      await logAction('setting_changed' as any, { targetResource: 'posts', targetId: postId, details: { action: 'post_hidden', reason } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-posts'] }); queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] }); toast({ title: 'Post ocultado' }); },
    onError: (e: Error) => { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); },
  });
}

export function useUnhidePost() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from('posts').update({ is_hidden: false, hidden_reason: null, hidden_at: null, hidden_by: null }).eq('id', postId);
      if (error) throw error;
      await logAction('setting_changed' as any, { targetResource: 'posts', targetId: postId, details: { action: 'post_unhidden' } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-posts'] }); queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] }); toast({ title: 'Post reativado' }); },
    onError: (e: Error) => { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { data: post } = await supabase.from('posts').select('content_text, is_seed').eq('id', postId).single();
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      await logAction('setting_changed' as any, { targetResource: 'posts', targetId: postId, details: { action: 'post_deleted', content_preview: post?.content_text?.substring(0, 100), was_seed: post?.is_seed } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-posts'] }); queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] }); queryClient.invalidateQueries({ queryKey: ['posts'] }); toast({ title: 'Post excluído' }); },
    onError: (e: Error) => { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); },
  });
}

export function useBatchHidePosts() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();
  return useMutation({
    mutationFn: async ({ postIds, reason }: { postIds: string[]; reason: string }) => {
      const { error } = await supabase.from('posts').update({ is_hidden: true, hidden_reason: reason, hidden_at: new Date().toISOString() }).in('id', postIds);
      if (error) throw error;
      await logAction('setting_changed' as any, { targetResource: 'posts', details: { action: 'batch_posts_hidden', count: postIds.length, reason } });
    },
    onSuccess: (_, v) => { queryClient.invalidateQueries({ queryKey: ['admin-posts'] }); queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] }); toast({ title: `${v.postIds.length} posts ocultados` }); },
    onError: (e: Error) => { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); },
  });
}

export function useBatchUnhidePosts() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();
  return useMutation({
    mutationFn: async (postIds: string[]) => {
      const { error } = await supabase.from('posts').update({ is_hidden: false, hidden_reason: null, hidden_at: null, hidden_by: null }).in('id', postIds);
      if (error) throw error;
      await logAction('setting_changed' as any, { targetResource: 'posts', details: { action: 'batch_posts_unhidden', count: postIds.length } });
    },
    onSuccess: (_, ids) => { queryClient.invalidateQueries({ queryKey: ['admin-posts'] }); queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] }); toast({ title: `${ids.length} posts aprovados` }); },
    onError: (e: Error) => { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); },
  });
}

export function useBatchDeletePosts() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();
  return useMutation({
    mutationFn: async (postIds: string[]) => {
      const { error } = await supabase.from('posts').delete().in('id', postIds);
      if (error) throw error;
      await logAction('setting_changed' as any, { targetResource: 'posts', details: { action: 'batch_posts_deleted', count: postIds.length } });
    },
    onSuccess: (_, ids) => { queryClient.invalidateQueries({ queryKey: ['admin-posts'] }); queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] }); queryClient.invalidateQueries({ queryKey: ['posts'] }); toast({ title: `${ids.length} posts excluídos` }); },
    onError: (e: Error) => { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); },
  });
}
