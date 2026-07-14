/**
 * Comunidades Ocultas — hooks centralizados.
 * Usa exclusivamente o Supabase EXTERNO via @/lib/supabaseExternal.
 *
 * Tabelas: oculto_communities, oculto_community_categories,
 * oculto_community_members, oculto_community_topics, oculto_community_replies,
 * oculto_community_reactions, oculto_community_reports, oculto_community_settings.
 *
 * RPCs: community_can_create, community_create, community_join, community_leave,
 *       community_toggle_reaction.
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { toast } from 'sonner';
import { communityCreateFeedback } from '@/lib/communityCreationFeedback';

export interface CommunityCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

export interface Community {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  avatar_url: string | null;
  category_id: string | null;
  visibility: 'public' | 'private' | 'premium_only' | 'vip_only' | 'creator_exclusive';
  status: 'active' | 'pending_review' | 'paused' | 'banned' | 'archived';
  is_adult: boolean;
  is_official: boolean;
  is_featured: boolean;
  require_join_approval: boolean;
  require_post_approval: boolean;
  members_count: number;
  topics_count: number;
  replies_count: number;
  last_activity_at: string | null;
  rules: string | null;
  accent_color: string | null;
  cover_position_x?: number | null;
  cover_position_y?: number | null;
  avatar_position_x?: number | null;
  avatar_position_y?: number | null;
  created_at: string;
}


export interface CommunityTopic {
  id: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string | null;
  status: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_adult: boolean;
  replies_count: number;
  reactions_count: number;
  last_reply_at: string | null;
  created_at: string;
}

export interface CommunityReply {
  id: string;
  topic_id: string;
  community_id: string;
  author_id: string;
  parent_reply_id: string | null;
  body: string | null;
  status: string;
  reactions_count: number;
  created_at: string;
}

export interface CommunityTopicMedia {
  id: string;
  topic_id: string;
  community_id: string;
  author_id: string;
  kind: 'image' | 'video' | 'audio';
  url: string;
  cover_url?: string | null;
  view_count?: number | null;
  trim_start_seconds?: number | null;
  trim_end_seconds?: number | null;
  outro_url?: string | null;
  created_at: string;
}

export interface CommunitySettings {
  enabled: boolean;
  allow_free_join: boolean;
  allow_free_create: boolean;
  allow_premium_create: boolean;
  allow_vip_create: boolean;
  premium_max_communities: number;
  vip_max_communities: number;
  require_admin_approval_for_new_communities: boolean;
  allow_private_communities: boolean;
  allow_premium_only_communities: boolean;
  allow_vip_only_communities: boolean;
  allow_creator_exclusive_communities: boolean;
  allow_images: boolean;
  allow_videos: boolean;
  allow_audio: boolean;
  max_topics_per_day: number;
  max_replies_per_day: number;
  show_featured_on_home: boolean;
  show_hot_topics_on_feed: boolean;
  moderation_enabled: boolean;
}

// ───────── settings ─────────
export function useCommunitySettings() {
  return useQuery({
    queryKey: ['oculto_community_settings'],
    queryFn: async (): Promise<CommunitySettings | null> => {
      const { data, error } = await supabase
        .from('oculto_community_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
    staleTime: 60_000,
  });
}

// ───────── categorias ─────────
export function useCommunityCategories() {
  return useQuery({
    queryKey: ['oculto_community_categories'],
    queryFn: async (): Promise<CommunityCategory[]> => {
      const { data, error } = await supabase
        .from('oculto_community_categories')
        .select('id,name,slug,description,icon,sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

// ───────── lista de comunidades ─────────
export function useCommunities(opts: { search?: string; categoryId?: string | null; featuredOnly?: boolean } = {}) {
  const { search, categoryId, featuredOnly } = opts;
  return useQuery({
    queryKey: ['oculto_communities_list', { search, categoryId, featuredOnly }],
    queryFn: async (): Promise<Community[]> => {
      let q = supabase
        .from('oculto_communities')
        .select('*')
        .eq('status', 'active')
        .order('is_featured', { ascending: false })
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .limit(60);
      if (categoryId) q = q.eq('category_id', categoryId);
      if (featuredOnly) q = q.eq('is_featured', true);
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`title.ilike.${term},description.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 30_000,
  });
}

// ───────── minhas comunidades (membro ou dono) ─────────
export function useMyCommunities() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto_my_communities', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Community[]> => {
      const { data: memberships, error: mErr } = await supabase
        .from('oculto_community_members')
        .select('community_id,role,status')
        .eq('user_id', user!.id)
        .eq('status', 'active');
      if (mErr) throw mErr;
      const ids = (memberships ?? []).map((m: any) => m.community_id).filter(Boolean);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('oculto_communities')
        .select('*')
        .in('id', ids)
        .order('last_activity_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 30_000,
  });
}

// ───────── lista paginada (infinite scroll) ─────────
const COMMUNITIES_PAGE_SIZE = 24;

export function useCommunitiesInfinite(opts: {
  search?: string;
  categoryId?: string | null;
  adultOnly?: boolean;
} = {}) {
  const { search, categoryId, adultOnly } = opts;
  return useInfiniteQuery({
    queryKey: ['oculto_communities_infinite', { search, categoryId, adultOnly }],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<{ items: Community[]; nextPage: number | null }> => {
      const from = (pageParam as number) * COMMUNITIES_PAGE_SIZE;
      const to = from + COMMUNITIES_PAGE_SIZE - 1;
      let q = supabase
        .from('oculto_communities')
        .select('*')
        .eq('status', 'active')
        .order('is_featured', { ascending: false })
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .range(from, to);
      if (categoryId) q = q.eq('category_id', categoryId);
      if (adultOnly) q = q.eq('is_adult', true);
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`title.ilike.${term},description.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      const items = (data as any) ?? [];
      const nextPage = items.length === COMMUNITIES_PAGE_SIZE ? (pageParam as number) + 1 : null;
      return { items, nextPage };
    },
    getNextPageParam: (last) => last.nextPage,
    staleTime: 30_000,
  });
}

// ───────── previews de membros recentes (batch) ─────────
export function useCommunityMemberPreviews(communityIds: string[]) {
  const ids = useMemo(() => Array.from(new Set(communityIds)).filter(Boolean).sort(), [communityIds]);
  return useQuery({
    queryKey: ['oculto_community_member_previews', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, Array<{ user_id: string; avatar_url: string | null; username: string | null }>>> => {
      if (ids.length === 0) return {};
      // Buscar até 200 memberships ativos das comunidades visíveis ordenados por mais recentes
      const { data: members, error } = await supabase
        .from('oculto_community_members')
        .select('community_id,user_id,joined_at')
        .in('community_id', ids)
        .eq('status', 'active')
        .order('joined_at', { ascending: false })
        .limit(ids.length * 8);
      if (error) throw error;

      // Agrupar até 3 por comunidade
      const grouped: Record<string, string[]> = {};
      for (const m of (members ?? []) as any[]) {
        if (!grouped[m.community_id]) grouped[m.community_id] = [];
        if (grouped[m.community_id].length < 3) grouped[m.community_id].push(m.user_id);
      }

      const allUserIds = Array.from(new Set(Object.values(grouped).flat()));
      let profilesMap: Record<string, { avatar_url: string | null; username: string | null }> = {};
      if (allUserIds.length) {
        const { data: profs } = await (supabase as any)
          .from('v_public_profiles')
          .select('user_id,avatar_url,username')
          .in('user_id', allUserIds);
        for (const p of (profs ?? []) as any[]) {
          profilesMap[p.user_id] = { avatar_url: p.avatar_url, username: p.username };
        }
      }

      const result: Record<string, Array<{ user_id: string; avatar_url: string | null; username: string | null }>> = {};
      for (const cid of Object.keys(grouped)) {
        result[cid] = grouped[cid].map((uid) => ({
          user_id: uid,
          avatar_url: profilesMap[uid]?.avatar_url ?? null,
          username: profilesMap[uid]?.username ?? null,
        }));
      }
      return result;
    },
    staleTime: 60_000,
  });
}





// ───────── comunidade por slug ─────────
export function useCommunityBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['oculto_community', slug],
    enabled: !!slug,
    queryFn: async (): Promise<Community | null> => {
      const { data, error } = await supabase
        .from('oculto_communities')
        .select('*')
        .eq('slug', slug as string)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
    staleTime: 30_000,
  });
}

// ───────── membership do usuário atual ─────────
export function useMyMembership(communityId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto_community_membership', communityId, user?.id],
    enabled: !!communityId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_community_members')
        .select('role,status,notify_level')
        .eq('community_id', communityId as string)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as { role: string; status: string; notify_level?: 'all'|'mentions'|'mute' } | null;
    },
    staleTime: 15_000,
  });
}

// ───────── ajustar nível de notificação da comunidade ─────────
export function useSetCommunityNotifyLevel(communityId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (level: 'all' | 'mentions' | 'mute') => {
      if (!communityId) throw new Error('no_community');
      const { error } = await supabase.rpc('community_set_notify_level', {
        _community: communityId,
        _level: level,
      });
      if (error) throw error;
      return level;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_membership', communityId, user?.id] });
    },
  });
}

// ───────── canais (sub-fóruns) ─────────
export interface CommunityChannel {
  id: string;
  community_id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_archived: boolean;
  created_at: string;
}

export function useCommunityChannels(communityId: string | undefined) {
  return useQuery({
    queryKey: ['oculto_community_channels', communityId],
    enabled: !!communityId,
    queryFn: async (): Promise<CommunityChannel[]> => {
      const { data, error } = await supabase
        .from('oculto_community_channels')
        .select('*')
        .eq('community_id', communityId as string)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 60_000,
  });
}

export function useUpsertCommunityChannel(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string | null;
      name: string;
      slug?: string | null;
      description?: string | null;
      position?: number | null;
      is_archived?: boolean | null;
    }) => {
      if (!communityId) throw new Error('not_ready');
      const { data, error } = await (supabase as any).rpc('community_channel_upsert', {
        _community: communityId,
        _id: input.id ?? null,
        _name: input.name,
        _slug: input.slug ?? null,
        _description: input.description ?? null,
        _position: input.position ?? null,
        _is_archived: input.is_archived ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_channels', communityId] });
      toast.success('Canal salvo.');
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('forbidden')) toast.error('Apenas owner/moderador podem gerenciar canais.');
      else toast.error('Erro ao salvar canal.');
    },
  });
}

export function useDeleteCommunityChannel(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc('community_channel_delete', { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_channels', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_topics', communityId] });
      toast.success('Canal removido.');
    },
    onError: () => toast.error('Erro ao remover canal.'),
  });
}

// ───────── tópicos ─────────
export function useCommunityTopics(communityId: string | undefined, channelId?: string | null) {
  return useQuery({
    queryKey: ['oculto_community_topics', communityId, channelId ?? '__all__'],
    enabled: !!communityId,
    queryFn: async (): Promise<CommunityTopic[]> => {
      let q = supabase
        .from('oculto_community_topics')
        .select('*')
        .eq('community_id', communityId as string)
        .in('status', ['published']);
      if (channelId) q = q.eq('channel_id', channelId);
      const { data, error } = await q
        .order('is_pinned', { ascending: false })
        .order('last_reply_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 20_000,
  });
}

export function useCommunityTopic(topicId: string | undefined) {
  return useQuery({
    queryKey: ['oculto_community_topic', topicId],
    enabled: !!topicId,
    queryFn: async (): Promise<CommunityTopic | null> => {
      const { data, error } = await supabase
        .from('oculto_community_topics')
        .select('*')
        .eq('id', topicId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
    staleTime: 15_000,
  });
}

export function useCommunityTopicMedia(topicId: string | undefined) {
  return useQuery({
    queryKey: ['oculto_community_topic_media', topicId],
    enabled: !!topicId,
    queryFn: async (): Promise<CommunityTopicMedia[]> => {
      const { data, error } = await supabase
        .from('oculto_community_media')
        .select('id,topic_id,community_id,author_id,kind,url,cover_url,view_count,trim_start_seconds,trim_end_seconds,outro_url,created_at')
        .eq('topic_id', topicId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 15_000,
  });
}

export function useCommunityReplies(topicId: string | undefined) {
  return useQuery({
    queryKey: ['oculto_community_replies', topicId],
    enabled: !!topicId,
    queryFn: async (): Promise<CommunityReply[]> => {
      const { data, error } = await supabase
        .from('oculto_community_replies')
        .select('*')
        .eq('topic_id', topicId as string)
        .in('status', ['published'])
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 15_000,
  });
}

// ───────── batch profiles (autores) ─────────
export interface AuthorLite {
  id: string;
  username: string | null;
  display_name: string | null;
  name: string | null;
  avatar_url: string | null;
  is_vip: boolean | null;
  plan_type: string | null;
}

export function useAuthorsBatch(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  return useQuery({
    queryKey: ['oculto_community_authors', uniqueIds.sort().join(',')],
    enabled: uniqueIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_public_profiles')
        .select('id,user_id,username,name,avatar_url,is_vip,plan_type')
        .or(`id.in.(${uniqueIds.join(',')}),user_id.in.(${uniqueIds.join(',')})`);
      if (error) throw error;
      const map = new Map<string, AuthorLite>();
      (data ?? []).forEach((p: any) => {
        map.set(p.id, p);
        if (p.user_id) map.set(p.user_id, p);
      });
      return map;
    },
    staleTime: 60_000,
  });
}

/** Profile do dono — busca por user_id (auth.users) com fallback em id (profiles.id). */
export function useCommunityOwnerProfile(ownerId: string | undefined | null) {
  return useQuery({
    queryKey: ['oculto_community_owner_profile', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      // tenta primeiro user_id (mapeamento mais comum)
      const byUser = await (supabase as any)
        .from('v_public_profiles')
        .select('id,user_id,username,name,avatar_url,is_vip,plan_type')
        .eq('user_id', ownerId!)
        .maybeSingle();
      if (byUser.data) return byUser.data as AuthorLite;
      // fallback: profiles.id
      const byId = await (supabase as any)
        .from('v_public_profiles')
        .select('id,user_id,username,name,avatar_url,is_vip,plan_type')
        .eq('id', ownerId!)
        .maybeSingle();
      return (byId.data ?? null) as AuthorLite | null;
    },
    staleTime: 5 * 60_000,
  });
}

function extractCommunityMediaFromBody(body: string): Array<{ kind: 'image' | 'video' | 'audio'; url: string }> {
  const out: Array<{ kind: 'image' | 'video' | 'audio'; url: string }> = [];
  const patterns: Array<{ kind: 'image' | 'video' | 'audio'; re: RegExp }> = [
    { kind: 'image', re: /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g },
    { kind: 'video', re: /\[(?:vídeo|video)\]\((https?:\/\/[^\s)]+)\)/gi },
    { kind: 'audio', re: /\[(?:áudio|audio)\]\((https?:\/\/[^\s)]+)\)/gi },
  ];
  for (const { kind, re } of patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      out.push({ kind, url: match[1] });
    }
  }
  return out;
}

// ───────── mutations ─────────
export function useCanCreateCommunity() {
  const { user } = useAuth();
  const { data: isMaster } = useIsMasterAdmin();
  return useQuery({
    queryKey: ['oculto_community_can_create', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Master admin bypass — ilimitado
      if (isMaster) {
        return { allowed: true, limit: 9999, current: 0, master: true } as { allowed: boolean; reason?: string; limit?: number; current?: number };
      }
      const { data, error } = await supabase.rpc('community_can_create', { _user: user!.id });
      if (error) throw error;
      return data as { allowed: boolean; reason?: string; limit?: number; current?: number };
    },
    staleTime: 10_000,
  });
}

export function useCreateCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      slug: string;
      description?: string;
      category_id?: string | null;
      visibility?: Community['visibility'];
      is_adult?: boolean;
      cover_url?: string | null;
      avatar_url?: string | null;
      rules?: string | null;
      accent_color?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('community_create', {
        _title: input.title,
        _slug: input.slug,
        _description: input.description ?? null,
        _category_id: input.category_id ?? null,
        _visibility: input.visibility ?? 'public',
        _is_adult: input.is_adult ?? false,
        _cover_url: input.cover_url ?? null,
        _avatar_url: input.avatar_url ?? null,
        _rules: input.rules ?? null,
      });
      if (error) throw error;
      const newId = data as string;
      // patch acento (se fornecido) — coluna nova de Phase 5
      if (input.accent_color && newId) {
        try {
          await supabase
            .from('oculto_communities')
            .update({ accent_color: input.accent_color })
            .eq('id', newId);
        } catch { /* ignora se tabela ainda não tem a coluna */ }
      }
      return newId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      qc.invalidateQueries({ queryKey: ['oculto_community_can_create'] });
      toast.success('Comunidade criada!');
    },
    onError: (err: any) => {
      const msg = String(err?.message || '');
      const feedback = communityCreateFeedback({ message: msg });
      toast.error(feedback.title, { description: feedback.description });
    },
  });
}


export function useJoinCommunity(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('community_join', { _community: communityId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_membership', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      toast.success(status === 'pending' ? 'Solicitação enviada — aguardando aprovação.' : 'Você entrou na comunidade!');
    },
    onError: () => toast.error('Não foi possível entrar agora.'),
  });
}

export function useLeaveCommunity(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('community_leave', { _community: communityId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_membership', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
      toast.success('Você saiu da comunidade.');
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('owner_cannot_leave')) toast.error('Donos não podem sair — transfira a comunidade primeiro.');
      else toast.error('Erro ao sair.');
    },
  });
}

export function useCreateTopic(communityId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body?: string;
      is_adult?: boolean;
      channel_id?: string | null;
      media?: {
        kind: 'image' | 'video' | 'audio';
        url: string;
        cover_url?: string | null;
        trim_start_seconds?: number | null;
        trim_end_seconds?: number | null;
        outro_url?: string | null;
      } | null;
    }) => {
      if (!user?.id || !communityId) throw new Error('not_ready');
      const { data, error } = await supabase
        .from('oculto_community_topics')
        .insert({
          community_id: communityId,
          author_id: user.id,
          title: input.title,
          body: input.body ?? null,
          is_adult: !!input.is_adult,
          channel_id: input.channel_id ?? null,
        })
        .select('id,status')
        .single();
      if (error) throw error;
      const created = data as { id: string; status: string };

      // Persiste mídia em oculto_community_media (best-effort)
      const mediaItems = extractCommunityMediaFromBody(input.body ?? '').map((item) => ({
        community_id: communityId,
        topic_id: created.id,
        author_id: user.id,
        kind: item.kind,
        url: item.url,
      }));
      if (!mediaItems.length && input.media?.url) {
        mediaItems.push({
          community_id: communityId,
          topic_id: created.id,
          author_id: user.id,
          kind: input.media.kind,
          url: input.media.url,
          ...(input.media.cover_url ? { cover_url: input.media.cover_url } : {}),
          ...(input.media.trim_start_seconds != null ? { trim_start_seconds: input.media.trim_start_seconds } : {}),
          ...(input.media.trim_end_seconds != null ? { trim_end_seconds: input.media.trim_end_seconds } : {}),
          ...(input.media.outro_url ? { outro_url: input.media.outro_url } : {}),
        } as any);
      } else if (input.media) {
        // Anexa metadados ao primeiro vídeo encontrado.
        const idx = mediaItems.findIndex((m) => m.kind === 'video');
        if (idx >= 0) {
          if (input.media.cover_url) (mediaItems[idx] as any).cover_url = input.media.cover_url;
          if (input.media.trim_start_seconds != null) (mediaItems[idx] as any).trim_start_seconds = input.media.trim_start_seconds;
          if (input.media.trim_end_seconds != null) (mediaItems[idx] as any).trim_end_seconds = input.media.trim_end_seconds;
          if (input.media.outro_url) (mediaItems[idx] as any).outro_url = input.media.outro_url;
        }
      }
      if (mediaItems.length > 0 && created.status === 'published') {
        try {
          await supabase.from('oculto_community_media').insert(mediaItems);
        } catch { /* best-effort */ }
      }
      // Post automático no feed principal anunciando o tópico (best-effort).
      // Snapshot em JSON dentro de content_text com marcador, parseado pelo
      // CommunityTopicFeedCard. Não bloqueia o fluxo se falhar.
      if (created.status === 'published') {
        try {
          const [{ data: community }, { data: profile }] = await Promise.all([
            (supabase as any)
              .from('oculto_communities')
              .select('id, title, slug, cover_url, avatar_url, accent_color, is_adult')
              .eq('id', communityId)
              .maybeSingle(),
            (supabase as any)
              .from('v_public_profiles')
              .select('id, user_id')
              .or(`user_id.eq.${user.id},id.eq.${user.id}`)
              .limit(1)
              .maybeSingle(),
          ]);
          const profileId = (profile as any)?.id || user.id;
          if (community && profileId) {
            // Mídia embutida no snapshot — evita 1 round-trip por card no feed.
            const firstMediaItem = (mediaItems[0] as any) || null;
            const snapshot = {
              v: 2,
              kind: 'community_topic',
              community_id: communityId,
              community_title: (community as any).title,
              community_slug: (community as any).slug,
              community_cover_url: (community as any).cover_url ?? null,
              community_avatar_url: (community as any).avatar_url ?? null,
              accent_color: (community as any).accent_color ?? null,
              topic_id: created.id,
              topic_title: input.title,
              topic_body: input.body ?? null,
              first_media_kind: firstMediaItem?.kind ?? null,
              first_media_url: firstMediaItem?.url ?? null,
              first_media_cover_url: firstMediaItem?.cover_url ?? null,
            };
            const payload = `__COMMUNITY_TOPIC__\n${JSON.stringify(snapshot)}`;
            await (supabase as any).from('posts').insert({
              author_id: profileId,
              content_text: payload,
              privacy_level: 'public',
              post_type: 'community_topic',
              is_adult: !!input.is_adult || !!(community as any).is_adult,
            });
          }
        } catch { /* best-effort */ }
      }
      return created;
    },
    onSuccess: async (created) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_topics', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_pending_topics', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_pending_topics_count', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_media', communityId] });
      // Invalida feed principal para o novo card aparecer
      qc.invalidateQueries({ queryKey: ['real-feed'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['posts'] });
      if (created.status === 'pending_review') {
        toast.success('Tópico enviado para aprovação dos moderadores.');
        return;
      }
      toast.success('Tópico publicado!');
      // Fan-out de push delegado à edge function (não bloqueia o cliente)
      try {
        if (!communityId) return;
        void supabase.functions.invoke('community-topic-fanout', {
          body: { community_id: communityId, topic_id: created.id },
        }).catch(() => { /* best-effort */ });
      } catch { /* best-effort */ }
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('banned_word_detected')) toast.error('Seu tópico contém termos proibidos pela comunidade.');
      else if (msg.toLowerCase().includes('row-level')) toast.error('Você precisa ser membro ativo para postar.');
      else toast.error('Erro ao publicar tópico.');
    },
  });
}

/**
 * useUpdateTopic — autor (ou mod/owner/master por RLS) pode editar o tópico.
 * Atualiza título, corpo (com markdown de mídia), is_adult e canal.
 * Também reescreve todas as mídias em oculto_community_media (best-effort).
 */
export function useUpdateTopic(communityId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      topic_id: string;
      title: string;
      body?: string | null;
      is_adult?: boolean;
      channel_id?: string | null;
      media?: {
        kind: 'image' | 'video' | 'audio';
        url: string;
        cover_url?: string | null;
        trim_start_seconds?: number | null;
        trim_end_seconds?: number | null;
        outro_url?: string | null;
      } | null;
    }) => {
      if (!user?.id || !communityId) throw new Error('not_ready');
      const { error } = await supabase
        .from('oculto_community_topics')
        .update({
          title: input.title,
          body: input.body ?? null,
          is_adult: !!input.is_adult,
          channel_id: input.channel_id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.topic_id);
      if (error) throw error;

      // Sincroniza todas as mídias anexadas (best-effort, ignora erros de RLS).
      try {
        await supabase
          .from('oculto_community_media')
          .delete()
          .eq('topic_id', input.topic_id);
        const mediaItems = extractCommunityMediaFromBody(input.body ?? '').map((item) => ({
          community_id: communityId,
          topic_id: input.topic_id,
          author_id: user.id,
          kind: item.kind,
          url: item.url,
        }));
        if (!mediaItems.length && input.media?.url) {
          mediaItems.push({
            community_id: communityId,
            topic_id: input.topic_id,
            author_id: user.id,
            kind: input.media.kind,
            url: input.media.url,
            ...(input.media.cover_url ? { cover_url: input.media.cover_url } : {}),
            ...(input.media.trim_start_seconds != null ? { trim_start_seconds: input.media.trim_start_seconds } : {}),
            ...(input.media.trim_end_seconds != null ? { trim_end_seconds: input.media.trim_end_seconds } : {}),
            ...(input.media.outro_url ? { outro_url: input.media.outro_url } : {}),
          } as any);
        } else if (input.media) {
          const idx = mediaItems.findIndex((m) => m.kind === 'video');
          if (idx >= 0) {
            if (input.media.cover_url) (mediaItems[idx] as any).cover_url = input.media.cover_url;
            if (input.media.trim_start_seconds != null) (mediaItems[idx] as any).trim_start_seconds = input.media.trim_start_seconds;
            if (input.media.trim_end_seconds != null) (mediaItems[idx] as any).trim_end_seconds = input.media.trim_end_seconds;
            if (input.media.outro_url) (mediaItems[idx] as any).outro_url = input.media.outro_url;
          }
        }
        if (mediaItems.length > 0) {
          await supabase.from('oculto_community_media').insert(mediaItems);
        }
      } catch { /* best-effort */ }
      return input.topic_id;
    },
    onSuccess: (topicId) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_topics', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_topic', topicId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_topic_media', topicId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_media', communityId] });
      toast.success('Tópico atualizado!');
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('banned_word_detected')) toast.error('Seu tópico contém termos proibidos pela comunidade.');
      else if (msg.toLowerCase().includes('row-level')) toast.error('Você não tem permissão para editar este tópico.');
      else toast.error('Erro ao salvar alterações.');
    },
  });
}




export function useCreateReply(topicId: string | undefined, communityId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { body: string; parent_reply_id?: string | null }) => {
      if (!user?.id || !topicId || !communityId) throw new Error('not_ready');
      const body = typeof input === 'string' ? input : input.body;
      const parent_reply_id = typeof input === 'string' ? null : (input.parent_reply_id ?? null);
      const { error } = await supabase.from('oculto_community_replies').insert({
        topic_id: topicId,
        community_id: communityId,
        author_id: user.id,
        parent_reply_id,
        body,
      });
      if (error) throw error;
      return { body, parent_reply_id };
    },
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_replies', topicId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_topic', topicId] });
      // Push real (best-effort) — busca destinatários e dispara via triggerPush
      try {
        const { triggerPush } = await import('@/lib/pushTrigger');
        // 1) autor do tópico
        const { data: topic } = await supabase
          .from('oculto_community_topics')
          .select('author_id, title, community_id, oculto_communities(slug)')
          .eq('id', topicId as string)
          .maybeSingle();
        const targets = new Set<string>();
        if (topic?.author_id && topic.author_id !== user?.id) targets.add(topic.author_id);
        // 2) autor da reply pai (se houver)
        if (res?.parent_reply_id) {
          const { data: parent } = await supabase
            .from('oculto_community_replies')
            .select('author_id')
            .eq('id', res.parent_reply_id)
            .maybeSingle();
          if (parent?.author_id && parent.author_id !== user?.id) targets.add(parent.author_id);
        }
        const slug = (topic as any)?.oculto_communities?.slug;
        const url = slug ? `/comunidades/${slug}/topico/${topicId}` : '/comunidades';
        targets.forEach((uid) => {
          triggerPush({
            user_id: uid,
            title: 'Nova resposta na comunidade',
            body: (res?.body || '').slice(0, 120),
            url,
            type: 'community_reply',
            tag: `community_reply_${topicId}`,
          });
        });
      } catch { /* push é best-effort */ }
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('banned_word_detected')) toast.error('Sua resposta contém termos proibidos.');
      else if (msg.toLowerCase().includes('locked')) toast.error('Este tópico está fechado.');
      else if (msg.toLowerCase().includes('row-level')) toast.error('Você precisa ser membro ativo para responder.');
      else toast.error('Erro ao enviar resposta.');
    },
  });
}

/**
 * useUpdateReply — autor (ou mod/owner/master via RLS) edita o corpo da resposta.
 */
export function useUpdateReply(topicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reply_id: string; body: string }) => {
      const body = (input.body || '').trim();
      if (!body) throw new Error('empty_body');
      const { error } = await supabase
        .from('oculto_community_replies')
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', input.reply_id);
      if (error) throw error;
      return input.reply_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_replies', topicId] });
      toast.success('Resposta atualizada!');
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('banned_word_detected')) toast.error('Sua resposta contém termos proibidos.');
      else if (msg.toLowerCase().includes('row-level')) toast.error('Você não tem permissão para editar esta resposta.');
      else if (msg === 'empty_body') toast.error('A resposta não pode ficar vazia.');
      else toast.error('Erro ao salvar alterações.');
    },
  });
}





export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      community_id: string;
      topic_id?: string | null;
      reply_id?: string | null;
      reaction?: string;
    }) => {
      const { data, error } = await supabase.rpc('community_toggle_reaction', {
        _community: input.community_id,
        _topic: input.topic_id ?? null,
        _reply: input.reply_id ?? null,
        _reaction: input.reaction ?? 'like',
      });
      if (error) throw error;
      return data as boolean;
    },
    // ─── Optimistic update: aparece/some o emoji instantaneamente ───
    onMutate: async (input) => {
      const queryKey = input.topic_id
        ? ['oculto_community_topic_reactions_summary']
        : ['oculto_community_reply_reactions_summary'];
      const targetId = (input.topic_id ?? input.reply_id) as string;
      const emoji = input.reaction ?? 'like';
      await qc.cancelQueries({ queryKey });
      const snapshots: Array<[any, ReactionSummaryMap | undefined]> = [];
      const queries = qc.getQueriesData<ReactionSummaryMap>({ queryKey });
      for (const [key, data] of queries) {
        snapshots.push([key, data]);
        if (!data) continue;
        const next: ReactionSummaryMap = { ...data };
        const prev = next[targetId] ?? { counts: {}, mine: new Set<string>(), total: 0 };
        const mine = new Set(prev.mine);
        const counts = { ...prev.counts };
        const had = mine.has(emoji);
        if (had) {
          mine.delete(emoji);
          counts[emoji] = Math.max(0, (counts[emoji] ?? 1) - 1);
          if (counts[emoji] === 0) delete counts[emoji];
        } else {
          mine.add(emoji);
          counts[emoji] = (counts[emoji] ?? 0) + 1;
        }
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        next[targetId] = { counts, mine, total };
        qc.setQueryData(key, next);
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.snapshots) for (const [k, d] of ctx.snapshots) qc.setQueryData(k, d);
    },
    onSettled: (_v, _e, input) => {
      if (input.topic_id) {
        qc.invalidateQueries({ queryKey: ['oculto_community_topic_reactions_summary'] });
        qc.invalidateQueries({ queryKey: ['oculto_community_topic', input.topic_id] });
      }
      if (input.reply_id) {
        qc.invalidateQueries({ queryKey: ['oculto_community_reply_reactions_summary'] });
      }
    },
  });
}

export function useReportCommunityContent() {
  return useMutation({
    mutationFn: async (input: {
      community_id?: string | null;
      topic_id?: string | null;
      reply_id?: string | null;
      reason: string;
      details?: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error('unauthenticated');
      const { error } = await supabase.from('oculto_community_reports').insert({
        community_id: input.community_id ?? null,
        topic_id: input.topic_id ?? null,
        reply_id: input.reply_id ?? null,
        reporter_id: uid,
        reason: input.reason,
        details: input.details ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Denúncia enviada. Obrigado!'),
    onError: () => toast.error('Não foi possível enviar a denúncia.'),
  });
}

// ───────── upload de mídia (bucket community-media privado, signed URL) ─────────
export function useUploadCommunityMedia() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File): Promise<{ path: string; url: string }> => {
      if (!user?.id) throw new Error('unauthenticated');
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('community-media')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from('community-media')
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;
      return { path, url: signed.signedUrl };
    },
    onError: () => toast.error('Falha ao enviar imagem.'),
  });
}

// ───────── reações do usuário em lote (topic_ids) ─────────
export function useMyTopicReactions(topicIds: string[]) {
  const { user } = useAuth();
  const uniq = Array.from(new Set(topicIds.filter(Boolean)));
  return useQuery({
    queryKey: ['oculto_community_my_reactions', user?.id, uniq.sort().join(',')],
    enabled: !!user?.id && uniq.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_my_reactions', { _topic_ids: uniq });
      if (error) throw error;
      const set = new Set<string>();
      (data as any[] | null)?.forEach((r) => set.add(r.topic_id));
      return set;
    },
    staleTime: 20_000,
  });
}

// ───────── multi-reactions summary (qualquer emoji do WhatsApp) ─────────
// `CommunityReaction` agora é o próprio emoji (string). Mantemos compat com
// os códigos legados (`like|love|fire|laugh|wow|sad`) através de
// `normalizeReactionEmoji` em `@/lib/whatsappEmojis`.
import {
  QUICK_REACTION_EMOJIS,
  normalizeReactionEmoji,
} from '@/lib/whatsappEmojis';

export type CommunityReaction = string;
export const COMMUNITY_REACTIONS: { id: CommunityReaction; emoji: string; label: string }[] =
  QUICK_REACTION_EMOJIS.map((e) => ({ id: e, emoji: e, label: e }));

export interface ReactionSummary {
  counts: Record<string, number>;
  mine: Set<string>;
  total: number;
}
export type ReactionSummaryMap = Record<string, ReactionSummary>;

const emptySummary = (): ReactionSummary => ({ counts: {}, mine: new Set(), total: 0 });

export function useTopicReactionsSummary(topicIds: string[]) {
  const uniq = Array.from(new Set(topicIds.filter(Boolean)));
  return useQuery<ReactionSummaryMap>({
    queryKey: ['oculto_community_topic_reactions_summary', uniq.sort().join(',')],
    enabled: uniq.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('community_topic_reactions_summary', {
        _topic_ids: uniq,
      });
      if (error) throw error;
      const map: ReactionSummaryMap = {};
      for (const id of uniq) map[id] = emptySummary();
      for (const row of (data as any[]) ?? []) {
        const e = map[row.topic_id] ?? emptySummary();
        const emoji = normalizeReactionEmoji(row.reaction as string);
        e.counts[emoji] = (e.counts[emoji] ?? 0) + (Number(row.total) || 0);
        e.total += Number(row.total) || 0;
        if (row.mine) e.mine.add(emoji);
        map[row.topic_id] = e;
      }
      return map;
    },
  });
}

export function useReplyReactionsSummary(replyIds: string[]) {
  const uniq = Array.from(new Set(replyIds.filter(Boolean)));
  return useQuery<ReactionSummaryMap>({
    queryKey: ['oculto_community_reply_reactions_summary', uniq.sort().join(',')],
    enabled: uniq.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('community_reply_reactions_summary', {
        _reply_ids: uniq,
      });
      if (error) throw error;
      const map: ReactionSummaryMap = {};
      for (const id of uniq) map[id] = emptySummary();
      for (const row of (data as any[]) ?? []) {
        const e = map[row.reply_id] ?? emptySummary();
        const emoji = normalizeReactionEmoji(row.reaction as string);
        e.counts[emoji] = (e.counts[emoji] ?? 0) + (Number(row.total) || 0);
        e.total += Number(row.total) || 0;
        if (row.mine) e.mine.add(emoji);
        map[row.reply_id] = e;
      }
      return map;
    },
  });
}

// ───────── lista de membros ativos + perfis (decoupled) ─────────
export interface CommunityMemberEntry {
  user_id: string;
  role: 'owner' | 'moderator' | 'member';
  joined_at: string;
  profile: {
    id: string;
    user_id: string | null;
    username: string | null;
    display_name: string | null;
    name: string | null;
    avatar_url: string | null;
    is_vip: boolean | null;
  } | null;
}

export function useCommunityActiveMembers(communityId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: ['oculto_community_active_members', communityId, limit],
    enabled: !!communityId,
    queryFn: async (): Promise<CommunityMemberEntry[]> => {
      const { data: members, error } = await supabase
        .from('oculto_community_members')
        .select('user_id, role, joined_at')
        .eq('community_id', communityId as string)
        .eq('status', 'active')
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      const ids = (members ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await (supabase as any)
        .from('v_public_profiles')
        .select('id,user_id,username,name,avatar_url,is_vip')
        .in('id', ids);
      const pm = new Map<string, any>();
      (profiles ?? []).forEach((p: any) => pm.set(p.id, p));
      return (members ?? []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        profile: pm.get(m.user_id) ?? null,
      }));
    },
    staleTime: 30_000,
  });
}

// Map<user_id, role> para badges rápidos em replies/topics
export function useCommunityMemberRoles(communityId: string | undefined) {
  const { data } = useCommunityActiveMembers(communityId, 500);
  return useMemo(() => {
    const m = new Map<string, 'owner' | 'moderator' | 'member'>();
    (data ?? []).forEach((entry) => m.set(entry.user_id, entry.role));
    return m;
  }, [data]);
}


// ───────── contagem de pendentes ─────────
export function usePendingMembersCount(communityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['oculto_community_pending_count', communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('oculto_community_members')
        .select('user_id', { head: true, count: 'exact' })
        .eq('community_id', communityId as string)
        .eq('status', 'pending');
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
}

// ───────── helpers ─────────
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

// ═════════════════════════ PHASE 5 ═════════════════════════

// ───────── trending (ranking) ─────────
export interface CommunityTrending {
  community_id: string;
  title: string;
  slug: string;
  avatar_url: string | null;
  accent_color: string | null;
  members_count: number;
  topics_7d: number;
  replies_7d: number;
  score: number;
}

export function useCommunityTrending(limit = 5) {
  return useQuery({
    queryKey: ['oculto_community_trending', limit],
    queryFn: async (): Promise<CommunityTrending[]> => {
      try {
        const { data, error } = await (supabase as any).rpc('community_trending', { _limit: limit });
        if (error) throw error;
        return (data as any[]) ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });
}

// ───────── moderação de tópicos ─────────
export function useModerateTopic(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      topic_id: string;
      action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete' | 'restore';
    }) => {
      const { error } = await (supabase as any).rpc('community_topic_moderate', {
        _topic: input.topic_id,
        _action: input.action,
      });
      if (error) throw error;
    },
    onSuccess: (_v, input) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_topics', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_topic', input.topic_id] });
      const labels: Record<string, string> = {
        pin: 'Tópico fixado',
        unpin: 'Tópico desafixado',
        lock: 'Tópico fechado',
        unlock: 'Tópico reaberto',
        delete: 'Tópico removido',
        restore: 'Tópico restaurado',
      };
      toast.success(labels[input.action] || 'OK');
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('forbidden')) toast.error('Sem permissão para moderar.');
      else toast.error('Erro ao moderar tópico.');
    },
  });
}

// ───────── moderação de respostas ─────────
export function useModerateReply(topicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reply_id: string; action: 'delete' | 'restore' }) => {
      const { error } = await (supabase as any).rpc('community_reply_moderate', {
        _reply: input.reply_id,
        _action: input.action,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_replies', topicId] });
      toast.success('Resposta moderada');
    },
    onError: () => toast.error('Erro ao moderar resposta.'),
  });
}

// ───────── reações em respostas (batch) ─────────
export function useMyReplyReactions(replyIds: string[]) {
  const { user } = useAuth();
  const uniq = Array.from(new Set(replyIds.filter(Boolean)));
  return useQuery({
    queryKey: ['oculto_community_my_reply_reactions', user?.id, uniq.sort().join(',')],
    enabled: !!user?.id && uniq.length > 0,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc('community_my_reply_reactions', {
          _reply_ids: uniq,
        });
        if (error) throw error;
        const set = new Set<string>();
        (data as any[] | null)?.forEach((r) => set.add(r.reply_id));
        return set;
      } catch {
        return new Set<string>();
      }
    },
    staleTime: 20_000,
  });
}

// ───────── notificações de comunidade ─────────
export interface CommunityNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  is_read: boolean;
  created_at: string;
}

export function useCommunityNotifications(limit = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_notifications', user?.id, limit],
    enabled: !!user?.id,
    queryFn: async (): Promise<CommunityNotification[]> => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('id,type,title,body,data,is_read,created_at')
          .eq('user_id', user!.id)
          .like('type', 'community_%')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return (data as any[]) ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarkCommunityNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .like('type', 'community_%')
        .eq('is_read', false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_notifications'] });
    },
  });
}

// ───────── update accent color ─────────
export function useUpdateCommunityAccent(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accent_color: string | null) => {
      if (!communityId) throw new Error('not_ready');
      const { error } = await supabase
        .from('oculto_communities')
        .update({ accent_color })
        .eq('id', communityId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community'] });
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      toast.success('Cor personalizada atualizada!');
    },
    onError: () => toast.error('Erro ao atualizar cor.'),
  });
}

// ───────── update community (owner/master) ─────────
export interface UpdateCommunityInput {
  title?: string;
  description?: string | null;
  rules?: string | null;
  visibility?: Community['visibility'];
  is_adult?: boolean;
  accent_color?: string | null;
  cover_url?: string | null;
  avatar_url?: string | null;
  category_id?: string | null;
}


// ============================================================
// CONVITES POR LINK (Parte 9)
// ============================================================

export interface CommunityInvite {
  id: string;
  community_id: string;
  code: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  created_at: string;
}

export function useCommunityInvites(communityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['oculto_community_invites', communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_community_invites')
        .select('id, community_id, code, created_by, expires_at, max_uses, uses_count, is_active, created_at')
        .eq('community_id', communityId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as CommunityInvite[]) ?? [];
    },
    staleTime: 30_000,
  });
}

export function useCreateInvite(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { expires_at?: string | null; max_uses?: number | null }) => {
      if (!communityId) throw new Error('not_ready');
      const { data, error } = await supabase.rpc('community_invite_create', {
        _community: communityId,
        _expires_at: input.expires_at ?? null,
        _max_uses: input.max_uses ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { id: string; code: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_invites', communityId] });
      toast.success('Convite criado!');
    },
    onError: (e: any) => {
      const m = String(e?.message || '');
      if (m.includes('not_authorized')) toast.error('Apenas dono/moderador pode criar convites.');
      else if (m.includes('not_authenticated')) toast.error('Sessão expirada. Faça login novamente.');
      else toast.error(`Erro ao criar convite: ${m || 'desconhecido'}`);
    },
  });
}

export function useRevokeInvite(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc('community_invite_revoke', { _invite: inviteId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_invites', communityId] });
      toast.success('Convite revogado.');
    },
    onError: () => toast.error('Erro ao revogar convite.'),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('community_invite_accept', { _code: code });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { community_id: string; slug: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      qc.invalidateQueries({ queryKey: ['oculto_community_membership'] });
    },
  });
}


export function useUpdateCommunity(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCommunityInput) => {
      if (!communityId) throw new Error('not_ready');
      const payload = {
        _community: communityId,
        _title: input.title ?? null,
        _description: input.description ?? null,
        _rules: input.rules ?? null,
        _visibility: input.visibility ?? null,
        _is_adult: input.is_adult ?? null,
        _accent_color: input.accent_color ?? null,
        _cover_url: input.cover_url ?? null,
        _avatar_url: input.avatar_url ?? null,
        _category_id: (input.category_id && input.category_id.length > 0) ? input.category_id : null,
      };
      const { error } = await supabase.rpc('community_update', payload);
      if (error) {
        console.error('[community_update] RPC error:', error, 'payload:', payload);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community'] });
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      qc.invalidateQueries({ queryKey: ['oculto_community_trending'] });
      toast.success('Comunidade atualizada!');
    },
    onError: (err: any) => {
      const msg = String(err?.message || err?.details || '');
      if (msg.includes('forbidden')) toast.error('Apenas o dono pode editar.');
      else if (msg.includes('function') && msg.includes('does not exist')) toast.error('Função community_update ausente no banco — rode os SQLs das comunidades.');
      else toast.error(`Erro ao atualizar comunidade: ${msg.slice(0, 140) || 'desconhecido'}`);
    },
  });
}

export function useUpdateCommunityImagePositions(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cover_x?: number | null;
      cover_y?: number | null;
      avatar_x?: number | null;
      avatar_y?: number | null;
    }) => {
      if (!communityId) throw new Error('not_ready');
      const clamp = (n: number | null | undefined) =>
        n == null ? null : Math.max(0, Math.min(100, Math.round(n)));
      const { error } = await supabase.rpc('community_update_image_positions', {
        _community: communityId,
        _cover_x:  clamp(input.cover_x),
        _cover_y:  clamp(input.cover_y),
        _avatar_x: clamp(input.avatar_x),
        _avatar_y: clamp(input.avatar_y),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community'] });
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
    },
    onError: (err: any) => {
      const msg = String(err?.message || '');
      if (msg.includes('forbidden')) toast.error('Apenas o dono pode reposicionar.');
      else if (msg.includes('function') && msg.includes('does not exist'))
        toast.error('Função ausente no banco — rode o SQL community_image_positions.');
      else toast.error('Erro ao salvar posição da imagem');
    },
  });
}

// ───────────────────────────────────────────────
// ETAPA 4 — Moderação avançada
// ───────────────────────────────────────────────

export function useSetMemberRole(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: 'moderator' | 'member' }) => {
      if (!communityId) throw new Error('not_ready');
      const { error } = await supabase.rpc('community_set_member_role', {
        _community: communityId,
        _user: user_id,
        _new_role: role,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_active_members', communityId] });
      toast.success(vars.role === 'moderator' ? 'Promovido a moderador!' : 'Rebaixado a membro.');
    },
    onError: (err: any) => {
      const msg = String(err?.message || '');
      if (msg.includes('forbidden')) toast.error('Apenas o dono pode alterar papéis.');
      else if (msg.includes('cannot_change_owner')) toast.error('Não é possível alterar o dono.');
      else toast.error('Erro ao alterar papel.');
    },
  });
}

export function useBanMember(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, reason }: { user_id: string; reason?: string }) => {
      if (!communityId) throw new Error('not_ready');
      const { error } = await supabase.rpc('community_ban_member', {
        _community: communityId,
        _user: user_id,
        _reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_active_members', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_banned_members', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community', communityId] });
      toast.success('Membro banido.');
    },
    onError: (err: any) => {
      const msg = String(err?.message || '');
      if (msg.includes('cannot_ban_owner')) toast.error('Não é possível banir o dono.');
      else if (msg.includes('forbidden')) toast.error('Sem permissão.');
      else toast.error('Erro ao banir membro.');
    },
  });
}

export function useUnbanMember(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (user_id: string) => {
      if (!communityId) throw new Error('not_ready');
      const { error } = await supabase.rpc('community_unban_member', {
        _community: communityId,
        _user: user_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_banned_members', communityId] });
      toast.success('Banimento removido.');
    },
    onError: () => toast.error('Erro ao desbanir.'),
  });
}

export function useCommunityBannedMembers(communityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['oculto_community_banned_members', communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_banned_members', { _community: communityId });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 30_000,
  });
}

export function useDeleteCommunity(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!communityId) throw new Error('not_ready');
      const { error } = await supabase.rpc('community_delete', { _community: communityId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      qc.invalidateQueries({ queryKey: ['oculto_community_trending'] });
      toast.success('Comunidade excluída.');
    },
    onError: (err: any) => {
      const msg = String(err?.message || '');
      if (msg.includes('forbidden')) toast.error('Apenas o dono pode excluir.');
      else toast.error('Erro ao excluir comunidade.');
    },
  });
}




export interface CommunityInsights {
  totals: { members_count: number; topics_count: number; replies_count: number; pending_count: number };
  period_days: number;
  new_members: number;
  new_topics: number;
  new_replies: number;
  active_users: number;
  members_series: Array<{ d: string; c: number }>;
  topics_series: Array<{ d: string; c: number }>;
  top_topics: Array<{ id: string; title: string; replies: number; reactions: number; score: number }>;
  top_members: Array<{ user_id: string; topics: number; replies: number; score: number; username: string | null; display_name: string | null; name: string | null; avatar_url: string | null }>;
}

export function useCommunityInsights(communityId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['oculto_community_insights', communityId, days],
    enabled: !!communityId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_insights', { _community: communityId, _days: days });
      if (error) throw error;
      return data as unknown as CommunityInsights;
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// EVENTOS DA COMUNIDADE (encontros / lives com RSVP)
// ═══════════════════════════════════════════════════════════════
export interface CommunityEvent {
  id: string;
  community_id: string;
  channel_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  location: string | null;
  event_kind: 'meetup' | 'live' | 'call' | 'party' | 'other';
  is_online: boolean;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  going_count: number;
  interested_count: number;
  is_cancelled: boolean;
  is_adult: boolean;
  created_at: string;
  updated_at: string;
}

export function useCommunityEvents(communityId: string | undefined, opts: { includePast?: boolean } = {}) {
  const { includePast = false } = opts;
  return useQuery({
    queryKey: ['oculto_community_events', communityId, { includePast }],
    enabled: !!communityId,
    queryFn: async (): Promise<CommunityEvent[]> => {
      let q = supabase
        .from('oculto_community_events')
        .select('*')
        .eq('community_id', communityId as string);
      if (!includePast) {
        const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        q = q.gte('starts_at', cutoff);
      }
      const { data, error } = await q.order('starts_at', { ascending: true }).limit(80);
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 30_000,
  });
}

export function useMyCommunityEventRsvps(communityId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto_community_event_my_rsvps', communityId, user?.id],
    enabled: !!communityId && !!user?.id,
    queryFn: async (): Promise<Record<string, 'going' | 'interested'>> => {
      const { data, error } = await (supabase as any).rpc('community_event_my_rsvps', { _community: communityId });
      if (error) throw error;
      const map: Record<string, 'going' | 'interested'> = {};
      for (const row of (data ?? []) as any[]) map[row.event_id] = row.status;
      return map;
    },
    staleTime: 15_000,
  });
}

export function useUpsertCommunityEvent(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string | null;
      title: string;
      description?: string | null;
      cover_url?: string | null;
      location?: string | null;
      event_kind?: CommunityEvent['event_kind'];
      is_online?: boolean;
      starts_at: string;
      ends_at?: string | null;
      capacity?: number | null;
      is_adult?: boolean;
      channel_id?: string | null;
    }) => {
      if (!communityId) throw new Error('not_ready');
      const { data, error } = await (supabase as any).rpc('community_event_upsert', {
        _community: communityId,
        _id: input.id ?? null,
        _title: input.title,
        _description: input.description ?? null,
        _cover_url: input.cover_url ?? null,
        _location: input.location ?? null,
        _event_kind: input.event_kind ?? 'meetup',
        _is_online: input.is_online ?? false,
        _starts_at: input.starts_at,
        _ends_at: input.ends_at ?? null,
        _capacity: input.capacity ?? null,
        _is_adult: input.is_adult ?? false,
        _channel_id: input.channel_id ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_events', communityId] });
      toast.success('Evento salvo.');
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('forbidden')) toast.error('Apenas owner/moderador podem criar eventos.');
      else if (msg.includes('starts_at_required')) toast.error('Defina a data de início.');
      else if (msg.includes('title_required')) toast.error('Informe um título.');
      else toast.error('Erro ao salvar evento.');
    },
  });
}

export function useCancelCommunityEvent(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; cancel: boolean }) => {
      const { error } = await (supabase as any).rpc('community_event_cancel', { _id: input.id, _cancel: input.cancel });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_events', communityId] });
    },
    onError: () => toast.error('Erro ao atualizar evento.'),
  });
}

export function useDeleteCommunityEvent(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc('community_event_delete', { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_events', communityId] });
      toast.success('Evento removido.');
    },
    onError: () => toast.error('Erro ao remover evento.'),
  });
}

export function useRsvpCommunityEvent(communityId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { event_id: string; status: 'going' | 'interested' | 'none' }) => {
      const { data, error } = await (supabase as any).rpc('community_event_rsvp', {
        _event: input.event_id,
        _status: input.status,
      });
      if (error) throw error;
      return { event_id: input.event_id, status: (data as string) };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_events', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_community_event_my_rsvps', communityId, user?.id] });
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('not_member')) toast.error('Entre na comunidade para confirmar presença.');
      else toast.error('Erro ao registrar RSVP.');
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// ENQUETES DOS TÓPICOS
// ═══════════════════════════════════════════════════════════════
export interface TopicPollOption {
  id: string;
  label: string;
  votes: number;
  position: number;
}
export interface TopicPoll {
  poll_id: string;
  question: string;
  allow_multiple: boolean;
  is_closed: boolean;
  closes_at: string | null;
  total_votes: number;
  created_by: string;
  options: TopicPollOption[];
  my_option_ids: string[];
}

export function useTopicPoll(topicId: string | undefined) {
  return useQuery({
    queryKey: ['oculto_community_topic_poll', topicId],
    enabled: !!topicId,
    queryFn: async (): Promise<TopicPoll | null> => {
      const { data, error } = await (supabase as any).rpc('community_topic_poll_get', { _topic: topicId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.poll_id) return null;
      return {
        poll_id: row.poll_id,
        question: row.question,
        allow_multiple: !!row.allow_multiple,
        is_closed: !!row.is_closed,
        closes_at: row.closes_at ?? null,
        total_votes: row.total_votes ?? 0,
        created_by: row.created_by,
        options: Array.isArray(row.options) ? row.options : [],
        my_option_ids: Array.isArray(row.my_option_ids) ? row.my_option_ids : [],
      };
    },
    staleTime: 15_000,
  });
}

export function useCreateTopicPoll(topicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      question: string;
      options: string[];
      allow_multiple?: boolean;
      closes_at?: string | null;
    }) => {
      if (!topicId) throw new Error('not_ready');
      const { data, error } = await (supabase as any).rpc('community_topic_poll_create', {
        _topic: topicId,
        _question: input.question,
        _options: input.options,
        _allow_multiple: input.allow_multiple ?? false,
        _closes_at: input.closes_at ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_topic_poll', topicId] });
      toast.success('Enquete criada.');
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('forbidden')) toast.error('Apenas autor ou moderador podem criar enquete.');
      else if (msg.includes('min_two_options')) toast.error('Adicione pelo menos 2 opções.');
      else if (msg.includes('max_eight_options')) toast.error('Máximo de 8 opções.');
      else if (msg.includes('question_required')) toast.error('Informe a pergunta.');
      else toast.error('Erro ao criar enquete.');
    },
  });
}

export function useVoteTopicPoll(topicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { poll_id: string; option_id: string }) => {
      const { error } = await (supabase as any).rpc('community_topic_poll_vote', {
        _poll: input.poll_id,
        _option: input.option_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_topic_poll', topicId] });
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('poll_closed')) toast.error('Enquete encerrada.');
      else if (msg.includes('not_member')) toast.error('Entre na comunidade para votar.');
      else toast.error('Erro ao votar.');
    },
  });
}

export function useCloseTopicPoll(topicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { poll_id: string; close: boolean }) => {
      const { error } = await (supabase as any).rpc('community_topic_poll_close', {
        _poll: input.poll_id, _close: input.close,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oculto_community_topic_poll', topicId] }),
    onError: () => toast.error('Erro ao atualizar enquete.'),
  });
}

export function useDeleteTopicPoll(topicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poll_id: string) => {
      const { error } = await (supabase as any).rpc('community_topic_poll_delete', { _poll: poll_id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto_community_topic_poll', topicId] });
      toast.success('Enquete removida.');
    },
    onError: () => toast.error('Erro ao remover enquete.'),
  });
}

// ============================================================================
// Parte 18 — Conquistas / badges por participação
// ============================================================================

export interface CommunityBadgeDef {
  id: string;
  community_id: string | null;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  criteria: Record<string, number>;
  position: number;
  is_active: boolean;
}

export interface CommunityEarnedBadge {
  badge_code: string;
  granted_at: string;
  metadata: Record<string, unknown>;
}

export function useCommunityBadges(communityId: string | undefined, userId?: string | null) {
  const { user } = useAuth();
  const target = userId ?? user?.id ?? null;
  return useQuery({
    queryKey: ['oculto_community_badges', communityId, target],
    enabled: !!communityId && !!target,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('community_badge_list', {
        _community: communityId,
        _user: target,
      });
      if (error) throw error;
      const payload = (data || {}) as { defs?: CommunityBadgeDef[]; earned?: CommunityEarnedBadge[] };
      return {
        defs: (payload.defs || []) as CommunityBadgeDef[],
        earned: (payload.earned || []) as CommunityEarnedBadge[],
      };
    },
  });
}

export function useEvaluateCommunityBadges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ communityId, userId }: { communityId: string; userId?: string }) => {
      const { data, error } = await (supabase as any).rpc('community_badge_evaluate', {
        _community: communityId,
        _user: userId ?? null,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (_n, vars) => {
      qc.invalidateQueries({ queryKey: ['oculto_community_badges', vars.communityId] });
    },
  });
}




// ============================================================
// PARTE 19 — Convites direcionados + Perguntas de portaria
// ============================================================

export interface CommunityJoinQuestion {
  id: string;
  community_id: string;
  question: string;
  is_required: boolean;
  position: number;
  is_active: boolean;
  created_at: string;
}

export function useInviteUserToCommunity(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, expiresAt }: { targetUserId: string; expiresAt?: string | null }) => {
      if (!communityId) throw new Error('community_required');
      const { data, error } = await (supabase as any).rpc('community_invite_user', {
        _community: communityId,
        _target: targetUserId,
        _expires_at: expiresAt ?? null,
      });
      if (error) throw error;
      return data as { id: string; code: string };
    },
    onSuccess: () => {
      toast.success('Convite enviado');
      qc.invalidateQueries({ queryKey: ['oculto_community_invites', communityId] });
    },
    onError: (e: any) => {
      const msg = e?.message || '';
      if (msg.includes('already_member')) toast.error('Esse usuário já é membro');
      else if (msg.includes('cannot_invite_self')) toast.error('Você não pode se convidar');
      else if (msg.includes('forbidden')) toast.error('Sem permissão');
      else toast.error('Falha ao convidar');
    },
  });
}

export function useCommunityJoinQuestions(communityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['oculto_community_join_questions', communityId],
    enabled: !!communityId && enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('community_join_questions_list', {
        _community: communityId,
      });
      if (error) throw error;
      return (data ?? []) as CommunityJoinQuestion[];
    },
  });
}

export function useSetCommunityJoinQuestions(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (questions: Array<{ question: string; is_required?: boolean; position?: number }>) => {
      if (!communityId) throw new Error('community_required');
      const cleaned = questions
        .map((q, i) => ({
          question: (q.question || '').trim(),
          is_required: q.is_required ?? true,
          position: q.position ?? i + 1,
        }))
        .filter((q) => q.question.length > 0);
      const { error } = await (supabase as any).rpc('community_join_questions_set', {
        _community: communityId,
        _questions: cleaned,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Perguntas atualizadas');
      qc.invalidateQueries({ queryKey: ['oculto_community_join_questions', communityId] });
    },
    onError: () => toast.error('Falha ao salvar perguntas'),
  });
}

export function useJoinCommunityWithAnswers(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (answers: Array<{ question_id: string; answer: string }>) => {
      if (!communityId) throw new Error('community_required');
      const { data, error } = await (supabase as any).rpc('community_join_with_answers', {
        _community: communityId,
        _answers: answers,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Pedido enviado');
      qc.invalidateQueries({ queryKey: ['oculto_my_membership', communityId] });
      qc.invalidateQueries({ queryKey: ['oculto_communities'] });
    },
    onError: (e: any) => {
      const msg = e?.message || '';
      if (msg.includes('missing_required_answers')) toast.error('Responda todas as perguntas obrigatórias');
      else toast.error('Falha ao entrar');
    },
  });
}

export interface CommunityMemberAnswer {
  question_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export function useCommunityMemberAnswers(
  communityId: string | undefined,
  userId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['oculto_community_member_answers', communityId, userId],
    enabled: !!communityId && !!userId && enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('community_member_answers', {
        _community: communityId,
        _user: userId,
      });
      if (error) throw error;
      return (data ?? []) as CommunityMemberAnswer[];
    },
  });
}
