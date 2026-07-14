import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  selectFollowMaybeSingle,
  insertFollow,
  deleteFollow,
  selectFollowingIds,
  selectFollowers,
  selectFollowing,
  countFollowers,
  countFollowing,
} from '@/lib/followsApi';

interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

interface FollowProfile {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_verified_couple?: boolean;
  is_creator: boolean;
  plan_type: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(isUuid))];
}

async function getProfileId(userId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('v_public_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data?.id || null;
}

async function getProfileIdentifiersByUserId(userId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('v_public_profiles')
    .select('id, user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return uniqueIds([userId]);
  return uniqueIds([userId, data?.user_id, data?.id]);
}

async function getTargetFollowIdentifiers(targetId: string): Promise<string[]> {
  // Accept either a UUID (profile.id / user_id) or a username slug.
  const lookup = isUuid(targetId)
    ? (supabase as any).from('v_public_profiles').select('id, user_id').or(`id.eq.${targetId},user_id.eq.${targetId}`).maybeSingle()
    : (supabase as any).from('v_public_profiles').select('id, user_id').eq('username', targetId).maybeSingle();

  const { data, error } = await lookup;
  if (error) return uniqueIds([targetId]);
  return uniqueIds([data?.user_id, data?.id, targetId]);
}

// Hook para verificar se está seguindo alguém
export function useIsFollowing(targetProfileId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['is-following', targetProfileId, user?.id],
    queryFn: async () => {
      if (!user?.id || !targetProfileId) return false;

      // Caminho preferido: RPC robusta (resolve user_id/profile.id, ignora RLS)
      const rpc = await (supabase as any).rpc('is_following_v2', { p_target: targetProfileId });
      if (!rpc.error) return !!rpc.data;

      // Fallback (caso a RPC ainda não esteja deployada)
      const [myIds, targetIds] = await Promise.all([
        getProfileIdentifiersByUserId(user.id),
        getTargetFollowIdentifiers(targetProfileId),
      ]);
      if (myIds.length === 0 || targetIds.length === 0) return false;
      const { data, error } = await selectFollowMaybeSingle(myIds, targetIds);
      if (error) return false;
      return !!data;
    },
    enabled: !!user?.id && !!targetProfileId,
  });
}

// Hook para seguir/deixar de seguir
export function useToggleFollow() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ targetProfileId, isFollowing }: { targetProfileId: string; isFollowing: boolean }) => {
      if (!user?.id) throw new Error('Não autenticado');

      // Caminho preferido: RPC SECURITY DEFINER (resolve identidades + bypass RLS)
      const rpc = await (supabase as any).rpc('toggle_follow_v2', { p_target: targetProfileId });
      if (!rpc.error) return;

      const msg = String(rpc.error?.message || '');
      // Erros de negócio explícitos vindos da RPC
      if (/cannot_follow_self/i.test(msg)) throw new Error('Você não pode seguir a si mesmo');
      if (/not_authenticated/i.test(msg)) throw new Error('Faça login para seguir');
      if (/target_profile_not_found/i.test(msg)) throw new Error('Perfil de destino não encontrado');

      // Fallback: caminho legado (caso a RPC ainda não esteja deployada)
      const [myIds, targetIds] = await Promise.all([
        getProfileIdentifiersByUserId(user.id),
        getTargetFollowIdentifiers(targetProfileId),
      ]);
      if (myIds.length === 0) throw new Error('Perfil não encontrado');
      if (targetIds.length === 0) throw new Error('Perfil de destino não encontrado');
      if (myIds.some((id) => targetIds.includes(id))) {
        throw new Error('Você não pode seguir a si mesmo');
      }

      if (isFollowing) {
        const { error } = await deleteFollow(myIds, targetIds);
        if (error) { console.error('[useToggleFollow] unfollow error:', error); throw error; }
      } else {
        const { error } = await insertFollow(myIds, targetIds);
        if (error) { console.error('[useToggleFollow] follow error:', error); throw error; }
      }
    },
    onMutate: async ({ targetProfileId, isFollowing }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['is-following', targetProfileId] });
      
      // Snapshot previous value
      const previousIsFollowing = queryClient.getQueryData(['is-following', targetProfileId, user?.id]);
      
      // Optimistic update
      queryClient.setQueryData(['is-following', targetProfileId, user?.id], !isFollowing);
      
      return { previousIsFollowing };
    },
    onError: (err: any, { targetProfileId }, context) => {
      // Rollback
      if (context?.previousIsFollowing !== undefined) {
        queryClient.setQueryData(['is-following', targetProfileId, user?.id], context.previousIsFollowing);
      }
      toast.error(err?.message || 'Erro ao atualizar seguidor');
    },
    onSuccess: (_, { targetProfileId, isFollowing }) => {
      queryClient.invalidateQueries({ queryKey: ['is-following', targetProfileId] });
      queryClient.invalidateQueries({ queryKey: ['follows-me'] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
      queryClient.invalidateQueries({ queryKey: ['following-ids'] });
      queryClient.invalidateQueries({ queryKey: ['follow-counts'] });
      queryClient.invalidateQueries({ queryKey: ['creator-stats'] });
      if (!isFollowing) {
        void import('@/lib/auraQuests').then(({ progressAuraQuest }) =>
          progressAuraQuest('follow_profile', 1, { bypassLock: true, reason: 'novo perfil seguido' })
        ).catch(() => {});
      }
      toast.success(isFollowing ? 'Deixou de seguir' : 'Seguindo!');
    },
  });
}

// Hook para obter IDs de quem o usuário segue
export function useFollowingIds(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEnabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: ['following-ids', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      const { data, error } = await selectFollowingIds(profileId);

      if (error) return [];
      return (data || []).map(f => f.following_id);
    },
    enabled: !!user?.id && isEnabled,
  });

  // Realtime subscription — atualiza contadores e listas em tempo real
  useEffect(() => {
    if (!user?.id || !isEnabled) return;

    const unsub = subscribeTable('followers', () => {
      queryClient.invalidateQueries({ queryKey: ['following-ids'] });
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
      queryClient.invalidateQueries({ queryKey: ['follow-counts'] });
      queryClient.invalidateQueries({ queryKey: ['follows-me'] });
      queryClient.invalidateQueries({ queryKey: ['creator-stats'] });
    });

    return unsub;
  }, [user?.id, queryClient, isEnabled]);

  return query;
}

const PROFILE_COLS = 'id, user_id, name, username, avatar_url, is_verified, is_verified_couple, is_creator, plan_type, gender, profile_type';

// Resolve perfis aceitando ids que podem corresponder a profile.id OU profile.user_id
// (compatibilidade com dados legados em followers).
async function fetchProfilesByAnyId(ids: string[]): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const inList = unique.map((v) => `"${v}"`).join(',');
  const { data } = await (supabase as any)
    .from('v_public_profiles')
    .select(PROFILE_COLS)
    .or(`id.in.(${inList}),user_id.in.(${inList})`);

  return data || [];
}

// Hook para listar seguidores de um perfil
export function useFollowers(profileId: string | undefined) {
  return useQuery({
    queryKey: ['followers', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await selectFollowers(profileId);
      if (error) return [];

      const followerIds = (data || []).map((f) => f.follower_id);
      if (followerIds.length === 0) return [];

      const profiles = await fetchProfilesByAnyId(followerIds);
      // Dedup por profile.id
      const seen = new Set<string>();
      const out: FollowProfile[] = [];
      for (const p of profiles) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p as FollowProfile);
      }
      return out;
    },
    enabled: !!profileId,
    // Realtime de `followers` invalida quando muda. 60s evita refetch a cada mount.
    staleTime: 60_000,
  });
}

// Hook para listar quem um perfil segue
export function useFollowing(profileId: string | undefined) {
  return useQuery({
    queryKey: ['following', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await selectFollowing(profileId);
      if (error) return [];

      const followingIds = (data || []).map((f) => f.following_id);
      if (followingIds.length === 0) return [];

      const profiles = await fetchProfilesByAnyId(followingIds);
      const followMap = new Map<string, string | null | undefined>();
      for (const f of data || []) {
        followMap.set(f.following_id, f.created_at);
      }

      const seen = new Set<string>();
      const out: (FollowProfile & { followed_at?: string })[] = [];
      for (const p of profiles) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        const followed_at =
          followMap.get(p.id) ?? followMap.get((p as any).user_id) ?? undefined;
        out.push({ ...(p as FollowProfile), followed_at: followed_at as any });
      }
      return out;
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

// Hook para contagem de seguidores/seguindo (com realtime)
export function useFollowCounts(profileId: string | undefined) {
  const queryClient = useQueryClient();

  // Realtime via bus — filtra following_id/follower_id no handler.
  useEffect(() => {
    if (!profileId) return;
    const unsub = subscribeTable('followers', (payload: any) => {
      const row = payload.new || payload.old;
      if (!row) return;
      if (row.following_id === profileId) {
        queryClient.invalidateQueries({ queryKey: ['follow-counts', profileId] });
        queryClient.invalidateQueries({ queryKey: ['followers', profileId] });
      }
      if (row.follower_id === profileId) {
        queryClient.invalidateQueries({ queryKey: ['follow-counts', profileId] });
        queryClient.invalidateQueries({ queryKey: ['following', profileId] });
      }
    });
    return unsub;
  }, [profileId, queryClient]);

  return useQuery({
    queryKey: ['follow-counts', profileId],
    queryFn: async () => {
      if (!profileId) return { followers: 0, following: 0 };

      const [followersResult, followingResult] = await Promise.all([
        countFollowers(profileId),
        countFollowing(profileId),
      ]);

      return {
        followers: (followersResult as any).count || 0,
        following: (followingResult as any).count || 0,
      };
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}
