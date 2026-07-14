import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { countFollowers, countFollowing, selectFollowMaybeSingle } from '@/lib/followsApi';
import { getResolvedAuthorScope } from '@/lib/postAuthorResolver';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const POST_OWNER_COLUMNS = ['creator_id', 'user_id', 'author_id'] as const;

type ProfileRow = Record<string, any>;
type ProfileSource = 'profiles' | 'profiles_public';
type PostOwnerColumn = typeof POST_OWNER_COLUMNS[number];

interface CreatorPost extends Record<string, any> {
  id: string;
  user_id?: string | null;
  author_id?: string | null;
  is_pinned?: boolean | null;
  pinned_at?: string | null;
  content_text?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  privacy_level?: string | null;
  post_type?: string | null;
  is_flash?: boolean | null;
  is_hidden?: boolean | null;
  is_paid?: boolean | null;
  paid_price?: number | null;
  likes_count?: number | null;
  dislikes_count?: number | null;
  comments_count?: number | null;
  created_at?: string | null;
  is_liked?: boolean;
  is_saved?: boolean;
  is_disliked?: boolean;
}

async function tryFetchProfile(source: ProfileSource, field: 'id' | 'user_id' | 'username', value: string) {
  const { data, error } = await (supabase as any)
    .from(source)
    .select('*')
    .eq(field, value)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching creator profile from ${source} by ${field}:`, error);
    return null;
  }

  return data as ProfileRow | null;
}

export async function resolveProfileByIdentifier(identifier: string): Promise<ProfileRow | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;

  const sources: ProfileSource[] = ['profiles', 'profiles_public'];

  if (UUID_REGEX.test(normalized)) {
    for (const source of sources) {
      const byId = await tryFetchProfile(source, 'id', normalized);
      if (byId) return byId;

      const byUserId = await tryFetchProfile(source, 'user_id', normalized);
      if (byUserId) return byUserId;
    }
  }

  for (const source of sources) {
    const byUsername = await tryFetchProfile(source, 'username', normalized);
    if (byUsername) return byUsername;
  }

  return null;
}

async function resolveProfileKeys(identifier: string): Promise<{ profileId: string | null; userId: string | null }> {
  const profile = await resolveProfileByIdentifier(identifier);
  return {
    profileId: profile?.id ?? null,
    userId: profile?.user_id ?? null,
  };
}

async function resolveAllOwnerIds(identifier: string): Promise<string[]> {
  const keys = await resolveProfileKeys(identifier);
  const ownerIds = new Set<string>(uniqueValues([keys.profileId, keys.userId]));

  if (keys.userId) {
    try {
      const scope = await getResolvedAuthorScope(keys.userId, {
        usernames: [typeof identifier === 'string' ? identifier : null].filter(Boolean) as string[],
      });
      for (const id of scope.allProfileIds) ownerIds.add(id);
      if (scope.creatorId) ownerIds.add(scope.creatorId);
    } catch (error) {
      console.warn('[resolveAllOwnerIds] fallback para ids básicos:', error);
    }
  }

  return Array.from(ownerIds);
}

async function getCurrentProfileId(authUserId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('v_public_profiles')
    .select('id')
    .eq('user_id', authUserId)
    .maybeSingle();

  if (error) {
    console.error('Error resolving current profile id:', error);
    return null;
  }

  return data?.id ?? null;
}

async function resolveProfileId(identifier: string): Promise<string | null> {
  const keys = await resolveProfileKeys(identifier);
  return keys.profileId;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function buildOwnerFilter(column: PostOwnerColumn, ownerIds: string[]) {
  return ownerIds.map((ownerId) => `${column}.eq.${ownerId}`).join(',');
}

async function fetchPostsForOwnerIds<T extends CreatorPost = CreatorPost>(
  ownerIds: string[],
  selectClause = '*'
): Promise<{ data: T[] | null; error: any }> {
  if (ownerIds.length === 0) {
    return { data: [] as T[], error: null };
  }

  let lastError: any = null;
  let emptySuccess: T[] | null = null;

  for (const column of POST_OWNER_COLUMNS) {
    const { data, error } = await (supabase as any)
      .from('posts')
      .select(selectClause)
      .or(buildOwnerFilter(column, ownerIds))
      .order('created_at', { ascending: false });

    if (!error) {
      if ((data || []).length === 0) {
        emptySuccess = (data || []) as T[];
        continue;
      }
      return { data: (data || []) as T[], error: null };
    }

    lastError = error;
  }

  if (emptySuccess) {
    return { data: emptySuccess, error: null };
  }

  return { data: null, error: lastError };
}

function filterCreatorFeedPosts<T extends CreatorPost>(posts: T[]) {
  return posts
    .filter((post) => post?.is_hidden !== true && post?.is_flash !== true && post?.post_type !== 'story')
    .slice()
    .sort((a, b) => {
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
}

export interface CreatorProfile {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  username: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  gender: string | null;
  is_verified: boolean;
  is_creator: boolean;
  plan_type: string;
  is_online: boolean;
  is_looking_now: boolean;
  looking_now_since: string | null;
  is_verified_couple: boolean;
  partner1_name: string | null;
  partner2_name: string | null;
  profile_type: string | null;
  created_at: string;
  updated_at: string;
  hide_age: boolean;
  hide_location: boolean;
  location_lat: number | null;
  location_lng: number | null;
  birth_date: string | null;
  show_online_status: boolean;
  is_ghost_active: boolean;
  tags_social: string[] | null;
  tags_adult: string[] | null;
  connection_mode: boolean | null;
  cover_image_url: string | null;
  is_private: boolean | null;
}

export interface CreatorStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
}

/**
 * Hook para buscar perfil de outro usuário (criador)
 * IMPORTANTE: Nunca expõe dados sensíveis como email, nome real, documentos
 */
export function useCreatorProfile(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-profile', creatorId],
    queryFn: async () => {
      if (!creatorId) return null;

      const profile = await resolveProfileByIdentifier(creatorId);
      if (!profile) return null;

      const result = profile as unknown as CreatorProfile;

      if (result.is_ghost_active || !result.show_online_status) {
        result.is_online = false;
      }

      return result;
    },
    enabled: !!creatorId,
    // Perfis de criadores raramente mudam: 5 min de cache evita refetch a
    // cada navegação entre /perfil/x → outra rota → /perfil/x.
    staleTime: 5 * 60_000,
  });
}

export function useCreatorAuthorScope(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-author-scope', creatorId],
    queryFn: async () => {
      if (!creatorId) return null;
      const keys = await resolveProfileKeys(creatorId);
      if (!keys.userId) return null;
      return getResolvedAuthorScope(keys.userId, {
        usernames: [creatorId].filter((value) => !UUID_REGEX.test(value)) as string[],
      });
    },
    enabled: !!creatorId,
    staleTime: 60_000,
  });
}

/**
 * Hook para buscar estatísticas do criador
 */
export function useCreatorStats(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-stats', creatorId],
    queryFn: async (): Promise<CreatorStats | null> => {
      if (!creatorId) return null;

      const keys = await resolveProfileKeys(creatorId);
      const ownerIds = await resolveAllOwnerIds(creatorId);
      const followKey = keys.profileId || keys.userId;

      if (ownerIds.length === 0) {
        return { postsCount: 0, followersCount: 0, followingCount: 0 };
      }

      const [postsResult, followersResult, followingResult] = await Promise.all([
        fetchPostsForOwnerIds(ownerIds, 'id, is_hidden, is_flash, post_type, created_at'),
        followKey ? countFollowers(followKey) : Promise.resolve({ count: 0 } as any),
        followKey ? countFollowing(followKey) : Promise.resolve({ count: 0 } as any),
      ]);

      if (postsResult.error) {
        console.error('Error fetching creator stats posts:', postsResult.error);
      }

      const visiblePosts = filterCreatorFeedPosts(postsResult.data || []);

      return {
        postsCount: visiblePosts.length,
        followersCount: followersResult.count || 0,
        followingCount: followingResult.count || 0,
      };
    },
    enabled: !!creatorId,
  });
}

/**
 * Hook para buscar posts de um criador específico
 */
export function useCreatorPosts(creatorId: string | undefined) {
  const { user } = useAuth();

  return useQuery<CreatorPost[]>({
    queryKey: ['creator-posts', creatorId],
    queryFn: async (): Promise<CreatorPost[]> => {
      if (!creatorId) return [];

      const ownerIds = await resolveAllOwnerIds(creatorId);
      if (ownerIds.length === 0) return [];

      const { data: postsRaw, error } = await fetchPostsForOwnerIds<CreatorPost>(ownerIds);
      if (error) {
        console.error('Error fetching creator posts:', error);
        return [];
      }

      const posts = filterCreatorFeedPosts(postsRaw || []);
      const postIds = posts.map((post) => post.id);
      const savedCounts = new Map<string, number>();

      if (postIds.length > 0) {
        const { data: allSaves } = await supabase
          .from('saved_posts')
          .select('post_id')
          .in('post_id', postIds);

        for (const save of allSaves || []) {
          const postId = save?.post_id;
          if (!postId) continue;
          savedCounts.set(postId, (savedCounts.get(postId) || 0) + 1);
        }
      }

      if (user?.id) {
        const actorId = await getCurrentProfileId(user.id);

        if (actorId) {
          if (postIds.length === 0) return posts;

          const [likesResult, savesResult, dislikesResult] = await Promise.all([
            supabase
              .from('post_likes')
              .select('post_id')
              .in('post_id', postIds)
              .eq('user_id', actorId),
            supabase
              .from('saved_posts')
              .select('post_id')
              .in('post_id', postIds)
              .eq('user_id', actorId),
            supabase
              .from('post_dislikes')
              .select('post_id')
              .in('post_id', postIds)
              .eq('user_id', actorId),
          ]);

          const likedIds = new Set((likesResult.data || []).map((like) => like.post_id));
          const savedIds = new Set((savesResult.data || []).map((save) => save.post_id));
          const dislikedIds = new Set((dislikesResult.data || []).map((dislike) => dislike.post_id));

          return posts.map((post): CreatorPost => ({
            ...post,
            saves_count: savedCounts.get(post.id) ?? post.saves_count ?? 0,
            is_liked: likedIds.has(post.id),
            is_saved: savedIds.has(post.id),
            is_disliked: dislikedIds.has(post.id),
          }));
        }
      }

      return posts.map((post): CreatorPost => ({
        ...post,
        saves_count: savedCounts.get(post.id) ?? post.saves_count ?? 0,
      }));
    },
    enabled: !!creatorId,
  });
}

/**
 * Hook para verificar se o usuário logado segue o criador
 */
export function useIsFollowing(creatorId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['is-following', creatorId, user?.id],
    queryFn: async () => {
      if (!creatorId || !user?.id) return false;

      const [targetKeys, myProfileId] = await Promise.all([
        resolveProfileKeys(creatorId),
        getCurrentProfileId(user.id),
      ]);

      const targetIds = uniqueValues([targetKeys.profileId, targetKeys.userId]);
      const myIds = uniqueValues([myProfileId, user.id]);

      if (targetIds.length === 0 || myIds.length === 0) return false;

      const { data, error } = await selectFollowMaybeSingle(myIds, targetIds);
      if (error) {
        console.error('Error checking follow state:', error);
        return false;
      }

      return !!data;
    },
    enabled: !!creatorId && !!user?.id,
  });
}

/**
 * Hook para verificar se o usuário logado está inscrito no criador
 */
export function useIsSubscribedTo(creatorId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['is-subscribed-to', creatorId, user?.id],
    queryFn: async () => {
      if (!creatorId || !user?.id) return false;

      const [targetProfileId, myProfileId] = await Promise.all([
        resolveProfileId(creatorId),
        getCurrentProfileId(user.id),
      ]);
      if (!targetProfileId || !myProfileId) return false;

      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from('subscriptions')
        .select('id, expires_at, status')
        .eq('subscriber_id', myProfileId)
        .eq('creator_id', targetProfileId)
        .in('status', ['active', 'trialing'])
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .maybeSingle();

      return !!data;
    },
    enabled: !!creatorId && !!user?.id,
  });
}
