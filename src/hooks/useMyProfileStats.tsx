import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { selectFollowers, selectFollowing } from '@/lib/followsApi';
import { getResolvedAuthorScope, getResolvedOwnerIds } from '@/lib/postAuthorResolver';
import { readSidebarStats, writeSidebarStats } from '@/lib/sidebarStatsCache';

async function resolveMyOwnerIds(profileId: string | undefined, authUserId: string | undefined) {
  return getResolvedOwnerIds(profileId, authUserId);
}

export function useResolvedProfileAuthorScope(profileId: string | undefined, username?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['resolved-profile-author-scope', profileId, user?.id, username],
    queryFn: async () => {
      if (!user?.id) return null;
      return getResolvedAuthorScope(user.id, { usernames: [username].filter(Boolean) as string[] });
    },
    enabled: !!user?.id && !!profileId,
    staleTime: 60_000,
  });
}

const OWNER_FILTER_VARIANTS = [
  ['author_id', 'creator_id', 'user_id'],
  ['author_id', 'creator_id'],
  ['author_id', 'user_id'],
  ['user_id'],
  ['creator_id'],
  ['author_id'],
] as const;

const OWNER_FALLBACK_COLUMNS = ['creator_id', 'user_id', 'author_id'] as const;

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42703' || code === 'PGRST204' || message.includes('does not exist') || message.includes('schema cache');
};

const buildOwnerPostsOrFilter = (ownerIds: string[], columns: readonly string[]) =>
  ownerIds.flatMap((id) => columns.map((column) => `${column}.eq.${id}`)).join(',');

const PROFILE_STATS_SELECT_VARIANTS = [
  ['id', 'is_flash', 'post_type'],
  ['id', 'post_type'],
  ['id', 'is_flash'],
  ['id'],
  ['*'],
] as const;

const PROFILE_POST_SELECT_VARIANTS = [
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_urls', 'preview_url', 'video_master_url', 'video_preview_url', 'media_type', 'thumbnail_url', 'media_duration_seconds', 'video_duration_seconds', 'privacy_level', 'likes_count', 'comments_count', 'created_at', 'is_paid', 'paid_price', 'post_type', 'is_flash'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_urls', 'preview_url', 'video_master_url', 'video_preview_url', 'media_type', 'thumbnail_url', 'video_duration_seconds', 'privacy_level', 'likes_count', 'comments_count', 'created_at', 'is_paid', 'paid_price', 'post_type', 'is_flash'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_type', 'thumbnail_url', 'video_duration_seconds', 'privacy_level', 'likes_count', 'comments_count', 'created_at', 'is_paid', 'paid_price', 'post_type', 'is_flash'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_type', 'thumbnail_url', 'privacy_level', 'likes_count', 'comments_count', 'created_at', 'is_paid', 'paid_price', 'post_type', 'is_flash'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_type', 'thumbnail_url', 'privacy_level', 'likes_count', 'comments_count', 'created_at', 'post_type', 'is_flash'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_type', 'thumbnail_url', 'likes_count', 'comments_count', 'created_at', 'post_type', 'is_flash'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_type', 'thumbnail_url', 'likes_count', 'comments_count', 'created_at', 'privacy_level'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'media_type', 'thumbnail_url', 'created_at'],
  ['id', 'is_pinned', 'pinned_at', 'content_text', 'media_url', 'created_at'],
  ['*'],
] as const;

const buildPostSelectColumns = (columns: readonly string[], baseColumns: readonly string[]) => {
  if (baseColumns.includes('*')) return '*';
  const selectColumns = new Set(baseColumns);

  if (columns.includes('author_id')) selectColumns.add('author_id');
  if (columns.includes('creator_id')) selectColumns.add('creator_id');
  if (columns.includes('user_id')) selectColumns.add('user_id');

  return Array.from(selectColumns).join(',');
};

async function runPostsQueryWithSelectFallback<T>(
  ownerIds: string[],
  selectVariants: readonly (readonly string[])[],
  build: (params: { ownerColumns: readonly string[]; selectClause: string }) => Promise<T>
): Promise<T> {
  let lastError: any = null;

  for (const baseColumns of selectVariants) {
    for (const ownerColumns of OWNER_FILTER_VARIANTS) {
      try {
        return await build({
          ownerColumns,
          selectClause: buildPostSelectColumns(ownerColumns, baseColumns),
        });
      } catch (error: any) {
        if (!isMissingColumnError(error)) throw error;
        lastError = error;
      }
    }
  }

  throw lastError;
}

async function fetchPostsByOwnerFallback(
  ownerIds: string[],
  options?: {
    limit?: number;
    privacyLevel?: string;
    orderByCreatedAt?: boolean;
  }
) {
  let lastError: any = null;

  for (const ownerColumn of OWNER_FALLBACK_COLUMNS) {
    let query = (supabase as any)
      .from('posts')
      .select('*')
      .or(buildOwnerPostsOrFilter(ownerIds, [ownerColumn]));

    if (options?.privacyLevel) {
      query = query.eq('privacy_level', options.privacyLevel);
    }

    if (options?.orderByCreatedAt !== false) {
      query = query.order('created_at', { ascending: false });
    }

    if (typeof options?.limit === 'number') {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (!error) return (data || []) as any[];
    if (!isMissingColumnError(error)) throw error;
    lastError = error;
  }

  if (lastError) throw lastError;
  return [] as any[];
}

const isVisibleProfilePost = (post: any) => post?.is_flash !== true && post?.post_type !== 'story';

const sortPinnedPostsFirst = <T extends Record<string, any>>(posts: T[]) =>
  posts.slice().sort((a, b) => {
    const ap = a?.is_pinned ? 1 : 0;
    const bp = b?.is_pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;

    const pinnedAtA = a?.pinned_at ? new Date(a.pinned_at).getTime() : 0;
    const pinnedAtB = b?.pinned_at ? new Date(b.pinned_at).getTime() : 0;
    if (pinnedAtA !== pinnedAtB) return pinnedAtB - pinnedAtA;

    const createdAtA = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const createdAtB = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return createdAtB - createdAtA;
  });

interface ProfileStats {
  totalPosts: number;
  totalFollowers: number;
  totalFollowing: number;
  totalViews: number;
}

export function useMyProfileStats(profileId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-profile-stats', profileId, user?.id],
    placeholderData: () => {
      const cached = readSidebarStats(profileId);
      if (!cached) return undefined;
      return {
        totalPosts: cached.totalPosts ?? 0,
        totalFollowers: cached.totalFollowers ?? 0,
        totalFollowing: cached.totalFollowing ?? 0,
        totalViews: cached.totalViews ?? 0,
      } satisfies ProfileStats;
    },
    queryFn: async (): Promise<ProfileStats> => {
      if (!profileId) return { totalPosts: 0, totalFollowers: 0, totalFollowing: 0, totalViews: 0 };
      const ownerIds = await resolveMyOwnerIds(profileId, user?.id);

      // Busca posts + visitas + linhas de follows em paralelo.
      // Para os contadores de seguidores/seguindo, NÃO usamos COUNT(*) na tabela
      // de follows porque ela pode conter linhas órfãs (perfis deletados).
      // Em vez disso, listamos os ids e validamos contra `profiles` — é
      // exatamente o que o modal faz, então os números batem sempre.
      const [postsRes, viewsRes, followersRowsRes, followingRowsRes] = await Promise.all([
        runPostsQueryWithSelectFallback(ownerIds, PROFILE_STATS_SELECT_VARIANTS, async ({ ownerColumns, selectClause }) => {
          const { data, error } = await (supabase as any)
            .from('posts')
            .select(selectClause)
            .or(buildOwnerPostsOrFilter(ownerIds, ownerColumns));
          if (error) throw error;
          const visibleCount = (data || []).filter(isVisibleProfilePost).length;
          if (visibleCount > 0) return { count: visibleCount };

          const fallbackRows = await fetchPostsByOwnerFallback(ownerIds, { orderByCreatedAt: false });
          return { count: fallbackRows.filter(isVisibleProfilePost).length };
        }),
        (supabase as any)
          .from('profile_visits')
          .select('id', { count: 'exact', head: true })
          .eq('visited_id', profileId),
        selectFollowers(profileId),
        selectFollowing(profileId),
      ]);

      const followerIds = ((followersRowsRes.data as any[]) || [])
        .map((r: any) => r.follower_id)
        .filter(Boolean) as string[];
      const followingIds = ((followingRowsRes.data as any[]) || [])
        .map((r: any) => r.following_id)
        .filter(Boolean) as string[];

      // Resolve perfis válidos (uma única chamada com union dos ids).
      const allIds = Array.from(new Set([...followerIds, ...followingIds]));
      let validIds = new Set<string>();
      if (allIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id')
          .in('id', allIds);
        validIds = new Set(((profs as any[]) || []).map((p) => p.id));
      }

      const totalFollowers = new Set(
        followerIds.filter((id) => validIds.has(id))
      ).size;
      const totalFollowing = new Set(
        followingIds.filter((id) => validIds.has(id))
      ).size;

      const result = {
        totalPosts: (postsRes as any).count || 0,
        totalFollowers,
        totalFollowing,
        totalViews: (viewsRes as any).count || 0,
      } satisfies ProfileStats;

      writeSidebarStats(profileId, result);
      return result;
    },
    enabled: !!profileId,
    staleTime: 60_000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}


export function useMyPosts(profileId: string | undefined, limit: number = 12) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-posts', profileId, limit],
    queryFn: async () => {
      if (!profileId) return [];
      const ownerIds = await resolveMyOwnerIds(profileId, user?.id);
      if (ownerIds.length === 0) return [];

      try {
        const data = await runPostsQueryWithSelectFallback(ownerIds, PROFILE_POST_SELECT_VARIANTS, async ({ ownerColumns, selectClause }) => {
          const { data, error } = await (supabase as any)
            .from('posts')
            .select(selectClause)
            .or(buildOwnerPostsOrFilter(ownerIds, ownerColumns))
            .order('created_at', { ascending: false })
            .limit(Math.max(limit * 5, 60));

          if (error) throw error;
          const visiblePosts = sortPinnedPostsFirst((data || []).filter((post: any) => isVisibleProfilePost(post) && post?.privacy_level !== 'hidden'));
          if (visiblePosts.length > 0) return visiblePosts.slice(0, limit);

          const fallbackRows = await fetchPostsByOwnerFallback(ownerIds, { limit: Math.max(limit * 5, 60) });
          const fallbackVisiblePosts = sortPinnedPostsFirst(fallbackRows.filter((post: any) => isVisibleProfilePost(post) && post?.privacy_level !== 'hidden'));
          return fallbackVisiblePosts.slice(0, limit);
        });

        return data;
      } catch (error: any) {
        console.error('[useMyPosts] Error:', error.message);
        return [];
      }
    },
    enabled: !!profileId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * useMyVaultPosts — Cofre paginado.
 * - 500 itens por página (PAGE_SIZE).
 * - Até 10 páginas (MAX_PAGES) → teto de 5000 mídias.
 * - Quando `total >= MAX_TOTAL`, retorna `limitReached=true` para a UI
 *   exibir alerta + ferramenta de limpeza/backup ZIP.
 */
export const VAULT_PAGE_SIZE = 500;
export const VAULT_MAX_PAGES = 10;
export const VAULT_MAX_TOTAL = VAULT_PAGE_SIZE * VAULT_MAX_PAGES; // 5000

export function useMyVaultPosts(profileId: string | undefined, page: number = 1) {
  const { user } = useAuth();
  const safePage = Math.min(Math.max(1, page), VAULT_MAX_PAGES);
  return useQuery({
    queryKey: ['my-vault-posts', profileId, safePage],
    queryFn: async () => {
      if (!profileId) return { items: [] as any[], total: 0, page: safePage, totalPages: 0, limitReached: false };
      const ownerIds = await resolveMyOwnerIds(profileId, user?.id);
      if (ownerIds.length === 0) return { items: [] as any[], total: 0, page: safePage, totalPages: 0, limitReached: false };
      const from = (safePage - 1) * VAULT_PAGE_SIZE;
      const to = from + VAULT_PAGE_SIZE - 1;
      try {
        const result = await runPostsQueryWithSelectFallback(ownerIds, PROFILE_POST_SELECT_VARIANTS, async ({ ownerColumns, selectClause }) => {
          const { data, error, count } = await (supabase as any)
            .from('posts')
            .select(selectClause, { count: 'exact' })
            .or(buildOwnerPostsOrFilter(ownerIds, ownerColumns))
            .eq('privacy_level', 'hidden')
            .order('created_at', { ascending: false })
            .range(from, to);

          if (error) throw error;
          const items = (data || []).filter(isVisibleProfilePost);
          if (items.length > 0) return { data: items, count: count ?? items.length };

          const fallbackRows = await fetchPostsByOwnerFallback(ownerIds, {
            privacyLevel: 'hidden',
            limit: VAULT_PAGE_SIZE,
          });
          const fallbackItems = fallbackRows.filter(isVisibleProfilePost);
          return { data: fallbackItems, count: fallbackItems.length };
        });

        const total = result.count ?? (result.data?.length ?? 0);
        const totalPages = Math.min(VAULT_MAX_PAGES, Math.max(1, Math.ceil(total / VAULT_PAGE_SIZE)));
        return {
          items: result.data || [],
          total,
          page: safePage,
          totalPages,
          limitReached: total >= VAULT_MAX_TOTAL,
        };
      } catch (error: any) {
        console.error('[useMyVaultPosts] Error:', error.message);
        return { items: [] as any[], total: 0, page: safePage, totalPages: 0, limitReached: false };
      }
    },
    enabled: !!profileId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useLikedPosts(profileId: string | undefined, limit: number = 24) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['liked-posts', profileId, user?.id, limit],
    queryFn: async () => {
      if (!profileId) return [];
      const actorIds = await resolveMyOwnerIds(profileId, user?.id);
      if (actorIds.length === 0) return [];

      // 1. Get liked post IDs
      const { data: likes, error: likesErr } = await supabase
        .from('post_likes')
        .select('post_id')
        .in('user_id', actorIds)
        .order('created_at', { ascending: false })
        .limit(limit * Math.max(actorIds.length, 1));

      if (likesErr || !likes?.length) {
        if (likesErr) console.error('[useLikedPosts] likes error:', likesErr.message);
        return [];
      }

      const postIds = Array.from(new Set(likes.map((l) => l.post_id).filter(Boolean))).slice(0, limit);
      if (postIds.length === 0) return [];

      // 2. Fetch actual posts
      const posts = await runPostsQueryWithSelectFallback(actorIds, PROFILE_POST_SELECT_VARIANTS, async ({ selectClause }) => {
        const { data, error } = await (supabase as any)
          .from('posts')
          .select(selectClause)
          .in('id', postIds);

        if (error) throw error;
        return data || [];
      });

      // Preserve like order
      const visiblePosts = (posts || []).filter((post: any) => isVisibleProfilePost(post) && post?.privacy_level !== 'hidden');
      const postsMap = new Map(visiblePosts.map((p: any) => [p.id, p]));
      return postIds.map(id => postsMap.get(id)).filter(Boolean);
    },
    enabled: !!profileId && !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
