import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabasePublic } from '@/lib/supabaseExternal';
import { getCanonicalAuthorIds } from '@/lib/postAuthorResolver';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { calculatePriorityScore } from '@/lib/priority';

// Interface para Flash Story
export interface FlashStory {
  id: string;
  user_id: string;
  content_text: string | null;
  media_url: string | null;
  media_urls: string[] | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  video_master_url?: string | null;
  video_preview_url?: string | null;
  created_at: string;
  expires_at: Date; // Calculado: created_at + 24h
  time_remaining: number; // Milissegundos restantes
  is_viewed: boolean;
  author: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
    is_verified_couple: boolean;
    is_verified: boolean;
    is_online: boolean;
    plan_type: string;
    is_creator: boolean;
    aura_xp?: number | null;
    aura_level?: number | null;
  };
}

// Interface para usuário com stories
export interface UserWithStories {
  userId: string;
  author: FlashStory['author'];
  stories: FlashStory[];
  hasUnviewed: boolean;
  oldestUnviewedProgress: number; // 0-1, progresso do timer do story mais antigo não visto
}

const STORY_POST_SELECT = 'id, author_id, creator_id, post_type, is_flash, content_text, media_url, media_urls, media_type, thumbnail_url, preview_url, video_master_url, video_preview_url, created_at';

// Calcular tempo restante e progresso
function calculateTimeRemaining(createdAt: string): { remaining: number; progress: number } {
  const created = new Date(createdAt).getTime();
  const expiresAt = created + 24 * 60 * 60 * 1000; // 24 horas
  const now = Date.now();
  const remaining = Math.max(0, expiresAt - now);
  const totalDuration = 24 * 60 * 60 * 1000;
  const progress = remaining / totalDuration; // 1 = novo, 0 = expirando
  return { remaining, progress };
}

// Formatar tempo restante para exibição
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expirado';
  
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Hook para buscar flash stories (posts com is_flash = true e menos de 24h)
export function useFlashStories() {
  const { user } = useAuth();
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['flash-stories', profile?.id ?? user?.id ?? 'anon'],
    queryFn: async (): Promise<UserWithStories[]> => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Query posts sem JOIN (evita PGRST200 no DB externo).
      // NÃO filtramos próprios stories aqui: a bolha "Seu Story" já é montada
      // separadamente via useMyFlashStories. Antes filtrávamos por user.id
      // (auth.users.id), mas author_id é profiles.id — então o filtro era
      // incoerente e, em contas onde profile.id == user.id, escondia TODOS os
      // stories do autor.
      let { data: posts, error } = await (supabase as any)
        .from('posts')
        .select(STORY_POST_SELECT)
        .or('is_flash.eq.true,post_type.eq.story')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        const fallback = await (supabasePublic as any)
          .from('posts')
          .select(STORY_POST_SELECT)
          .or('is_flash.eq.true,post_type.eq.story')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(100);
        posts = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.warn('[Stories] Query failed:', error.message);
        return [];
      }

      if (!posts || posts.length === 0) return [];

      // Remove os próprios stories (já aparecem em "Seu Story")
      const myAuthorIds = new Set<string>([profile?.id, profile?.user_id, user?.id].filter(Boolean) as string[]);
      const otherPosts = (posts as any[]).filter((p: any) => {
        const authorKeys = [p.author_id, p.creator_id].filter(Boolean);
        return !authorKeys.some((key: string) => myAuthorIds.has(key));
      });
      if (otherPosts.length === 0) return [];



      // Buscar perfis dos autores em lote (decoupled) — tenta por id E user_id
      const authorIds = [...new Set(otherPosts.flatMap((p: any) => [p.author_id, p.creator_id]).filter(Boolean))];
      const publicProfileSelect = 'id, user_id, name, username, avatar_url, is_verified_couple, is_verified, is_online, plan_type, is_creator';
      let [byId, byUserId] = await Promise.all([
        (supabase as any)
          .from('v_public_profiles')
          .select(publicProfileSelect)
          .in('id', authorIds),
        (supabase as any)
          .from('v_public_profiles')
          .select(publicProfileSelect)
          .in('user_id', authorIds),
      ]);

      // Se a view pública perdeu GRANT/security_invoker no banco externo, não
      // esconder Stories: volta para `profiles`, que já é usada pelo feed.
      if (byId.error || byUserId.error) {
        [byId, byUserId] = await Promise.all([
          (supabase as any)
            .from('profiles')
            .select(publicProfileSelect)
            .in('id', authorIds),
          (supabase as any)
            .from('profiles')
            .select(publicProfileSelect)
            .in('user_id', authorIds),
        ]);
      }

      if (byId.error || byUserId.error) {
        [byId, byUserId] = await Promise.all([
          (supabasePublic as any)
            .from('profiles')
            .select(publicProfileSelect)
            .in('id', authorIds),
          (supabasePublic as any)
            .from('profiles')
            .select(publicProfileSelect)
            .in('user_id', authorIds),
        ]);
      }

      const profileMap = new Map<string, any>();
      [...(byId.data || []), ...(byUserId.data || [])].forEach((p: any) => {
        if (p.id) profileMap.set(p.id, p);
        if (p.user_id) profileMap.set(p.user_id, p);
      });

      // Buscar visualizações do usuário atual
      let viewedStoryIds: string[] = [];
      if (user?.id) {
        try {
          const { data: views } = await (supabase as any)
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id);
          viewedStoryIds = (views || []).map((v: any) => v.story_id);
        } catch {
          // story_views table may not exist yet
        }
      }

      // Processar posts em stories — exige apenas que o perfil exista
      const stories: FlashStory[] = otherPosts
        .map((post: any) => {
          const { remaining } = calculateTimeRemaining(post.created_at);
          const author = profileMap.get(post.author_id) || profileMap.get(post.creator_id);
          if (!author) {
            const fallbackId = post.author_id || post.creator_id || post.id;
            return {
              ...post,
              user_id: fallbackId,
              author: {
                id: fallbackId,
                name: 'Usuário',
                username: null,
                avatar_url: null,
                is_verified_couple: false,
                is_verified: false,
                is_online: false,
                plan_type: 'free',
                is_creator: false,
              },
              expires_at: new Date(new Date(post.created_at).getTime() + 24 * 60 * 60 * 1000),
              time_remaining: remaining,
              is_viewed: viewedStoryIds.includes(post.id),
            };
          }
          // Garante um nome exibível mesmo quando o profile não tem `name`
          const safeAuthor = {
            ...author,
            name: author.name || author.username || 'Usuário',
          };
          return {
            ...post,
            user_id: safeAuthor.id,
            author: safeAuthor,
            expires_at: new Date(new Date(post.created_at).getTime() + 24 * 60 * 60 * 1000),
            time_remaining: remaining,
            is_viewed: viewedStoryIds.includes(post.id),
          };
        })
        .filter(Boolean) as FlashStory[];

      // Agrupar por usuário
      const userStoriesMap = new Map<string, UserWithStories>();

      stories.forEach(story => {
        const userId = story.user_id;
        if (!userStoriesMap.has(userId)) {
          userStoriesMap.set(userId, {
            userId,
            author: story.author,
            stories: [],
            hasUnviewed: false,
            oldestUnviewedProgress: 1,
          });
        }
        const userStories = userStoriesMap.get(userId)!;
        userStories.stories.push(story);
        if (!story.is_viewed) {
          userStories.hasUnviewed = true;
          const { progress } = calculateTimeRemaining(story.created_at);
          userStories.oldestUnviewedProgress = Math.min(userStories.oldestUnviewedProgress, progress);
        }
      });

      // Ordenar: não vistos primeiro, depois por prioridade
      return Array.from(userStoriesMap.values()).sort((a, b) => {
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        const scoreA = calculatePriorityScore({
          is_verified: a.author.is_verified,
          is_verified_couple: a.author.is_verified_couple,
          plan_type: a.author.plan_type,
          is_creator: a.author.is_creator,
        });
        const scoreB = calculatePriorityScore({
          is_verified: b.author.is_verified,
          is_verified_couple: b.author.is_verified_couple,
          plan_type: b.author.plan_type,
          is_creator: b.author.is_creator,
        });
        return scoreB - scoreA;
      });
    },
    // Sem polling automático: as stories aparecem via Realtime quando
    // alguém posta. Cache de 2 min garante zero piscadas ao remontar o feed.
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    enabled: true,
  });
}

// Hook para buscar stories do usuário atual
export function useMyFlashStories() {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['my-flash-stories', profile?.id],
    queryFn: async (): Promise<FlashStory[]> => {
      if (!profile?.id) return [];

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Query sem JOIN para evitar erros de FK no DB externo
      let { data, error } = await (supabase as any)
        .from('posts')
        .select(STORY_POST_SELECT)
        .or('is_flash.eq.true,post_type.eq.story')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        const fallback = await (supabasePublic as any)
          .from('posts')
          .select(STORY_POST_SELECT)
          .or('is_flash.eq.true,post_type.eq.story')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(100);
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.warn('[MyStories] Query failed:', error.message);
        return [];
      }

      const ownerIds = [profile.id, profile.user_id].filter(Boolean);

      return (data || [])
        .filter((post: any) => {
          const matchesOwner = ownerIds.some((id) => id === post.author_id || id === post.creator_id);
          const isStory = post?.is_flash === true || post?.post_type === 'story';
          return matchesOwner && isStory;
        })
        .map((post: any) => {
          const { remaining } = calculateTimeRemaining(post.created_at);
          return {
            ...post,
            user_id: profile.id,
            author: {
              id: profile.id,
              name: profile.name,
              username: profile.username,
              avatar_url: profile.avatar_url,
              is_verified_couple: profile.is_verified_couple || false,
              is_verified: profile.is_verified || false,
              is_online: true,
              plan_type: profile.plan_type || 'free',
              is_creator: profile.is_creator || false,
            },
            expires_at: new Date(new Date(post.created_at).getTime() + 24 * 60 * 60 * 1000),
            time_remaining: remaining,
            is_viewed: true,
          };
        });
    },
    enabled: !!profile?.id,
  });
}

// Hook para buscar stories de um usuário específico (para abrir do perfil)
export function useUserFlashStories(profileId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-flash-stories', profileId],
    queryFn: async (): Promise<UserWithStories | null> => {
      if (!profileId) return null;
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Resolve profile (id ou user_id)
      const publicProfileSelect = 'id, user_id, name, username, avatar_url, is_verified_couple, is_verified, is_online, plan_type, is_creator';
      let [byId, byUserId] = await Promise.all([
        (supabase as any)
          .from('v_public_profiles')
          .select(publicProfileSelect)
          .eq('id', profileId)
          .maybeSingle(),
        (supabase as any)
          .from('v_public_profiles')
          .select(publicProfileSelect)
          .eq('user_id', profileId)
          .maybeSingle(),
      ]);
      if (byId.error || byUserId.error) {
        [byId, byUserId] = await Promise.all([
          (supabasePublic as any)
            .from('profiles')
            .select(publicProfileSelect)
            .eq('id', profileId)
            .maybeSingle(),
          (supabasePublic as any)
            .from('profiles')
            .select(publicProfileSelect)
            .eq('user_id', profileId)
            .maybeSingle(),
        ]);
      }
      const author = byId.data || byUserId.data;
      if (!author) return null;
      const authorIds = [author.id, author.user_id].filter(Boolean);

      let { data: posts, error } = await (supabase as any)
        .from('posts')
        .select(STORY_POST_SELECT)
        .or('is_flash.eq.true,post_type.eq.story')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        const fallback = await (supabasePublic as any)
          .from('posts')
          .select(STORY_POST_SELECT)
          .or('is_flash.eq.true,post_type.eq.story')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: true })
          .limit(100);
        posts = fallback.data;
        error = fallback.error;
      }

      if (error || !posts || posts.length === 0) return null;

      const storyPosts = posts.filter((post: any) => {
        const matchesAuthor = authorIds.some((id) => id === post.author_id || id === post.creator_id);
        const isStory = post?.is_flash === true || post?.post_type === 'story';
        return matchesAuthor && isStory;
      });

      if (storyPosts.length === 0) return null;

      let viewedStoryIds: string[] = [];
      if (user?.id) {
        try {
          const { data: views } = await (supabase as any)
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id)
            .in('story_id', storyPosts.map((p: any) => p.id));
          viewedStoryIds = (views || []).map((v: any) => v.story_id);
        } catch {}
      }

      const stories: FlashStory[] = storyPosts.map((post: any) => {
        const { remaining } = calculateTimeRemaining(post.created_at);
        return {
          ...post,
          user_id: author.id,
          author,
          expires_at: new Date(new Date(post.created_at).getTime() + 24 * 60 * 60 * 1000),
          time_remaining: remaining,
          is_viewed: viewedStoryIds.includes(post.id),
        };
      });

      const hasUnviewed = stories.some(s => !s.is_viewed);
      return {
        userId: author.id,
        author,
        stories,
        hasUnviewed,
        oldestUnviewedProgress: 1,
      };
    },
    enabled: !!profileId,
    staleTime: 30000,
  });
}

// Dedupe per-session: evita inflar otimisticamente a contagem em re-mounts/StrictMode.
// Reset apenas com reload da página — alinhado ao escopo "viewer abriu este story".
const _viewedThisSession = new Set<string>();

// Hook para marcar story como visto
export function useMarkStoryViewed() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (storyId: string) => {
      if (!user?.id) return { skipped: true } as const;

      // Backend rate-limit: story_view
      try {
        const { data: rl } = await (supabase as any).rpc('check_and_increment_usage', { _feature: 'story_view' });
        if (rl && rl.allowed === false) {
          const { dispatchRateLimit } = await import('@/components/RateLimitProvider');
          dispatchRateLimit({
            feature: 'story_view',
            reason: rl.reason,
            count: rl.count,
            limit: rl.limit,
            resetAt: rl.reset_at,
            plan: rl.plan,
          });
          return { skipped: true } as const;
        }
      } catch { /* fail-open */ }

      // RPC registra a visualização (resolve profile.id internamente, idempotente)
      const { data, error } = await (supabase as any).rpc('story_view_register', {
        p_story_id: storyId,
      });
      // PGRST202 = RPC ausente no DB externo (silenciar até deploy do SQL)
      if (error && String(error?.code || '') !== 'PGRST202' && import.meta.env.DEV) {
        console.warn('[markStoryViewed] RPC error:', error);
      }
      // RPC retorna { ok, inserted } — usamos pra confirmar bump real
      const inserted = !!(data && (data.inserted === true || data?.[0]?.inserted === true));
      return { skipped: false, inserted } as const;
    },
    onMutate: async (storyId: string) => {
      const firstTimeThisSession = !_viewedThisSession.has(storyId);
      if (firstTimeThisSession) _viewedThisSession.add(storyId);

      // Optimistic: marca como visto na lista de stories
      await queryClient.cancelQueries({ queryKey: ['flash-stories'] });
      const prev = queryClient.getQueryData<UserWithStories[]>(['flash-stories']);
      if (prev) {
        const next = prev.map(u => ({
          ...u,
          stories: u.stories.map(s => s.id === storyId ? { ...s, is_viewed: true } : s),
          hasUnviewed: u.stories.some(s => s.id !== storyId && !s.is_viewed),
        }));
        queryClient.setQueryData(['flash-stories'], next);
      }

      // Optimistic: +1 no contador (só na primeira vez desta sessão)
      let prevCount: number | undefined;
      if (firstTimeThisSession) {
        await queryClient.cancelQueries({ queryKey: ['story-view-count', storyId] });
        prevCount = queryClient.getQueryData<number>(['story-view-count', storyId]);
        if (typeof prevCount === 'number') {
          queryClient.setQueryData<number>(['story-view-count', storyId], prevCount + 1);
        }
      }
      return { prev, prevCount, firstTimeThisSession };
    },
    onError: (_e, storyId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['flash-stories'], ctx.prev);
      if (ctx?.firstTimeThisSession) {
        _viewedThisSession.delete(storyId);
        if (typeof ctx?.prevCount === 'number') {
          queryClient.setQueryData<number>(['story-view-count', storyId], ctx.prevCount);
        }
      }
    },
    onSettled: (_d, _e, storyId) => {
      // Refetch IMEDIATO — garante saldo correto em todos os dispositivos
      queryClient.refetchQueries({ queryKey: ['story-view-count', storyId] });
      queryClient.refetchQueries({ queryKey: ['story-views', storyId] });
    },
  });
}

// Hook para criar flash story
export function useCreateFlashStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mediaUrl, mediaUrls, contentText }: { mediaUrl?: string; mediaUrls?: string[]; contentText?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user.id);

      const insertData: any = {
        author_id: authorProfileId,
        creator_id: creatorId,
        media_url: mediaUrl || null,
        media_urls: mediaUrls || null,
        content_text: contentText || null,
        is_flash: true,
        post_type: 'story',
        privacy_level: 'public',
      };

      const { error } = await (supabase as any)
        .from('posts')
        .insert(insertData);

      if (error) {
        console.error('[Stories] Insert failed:', error.code, error.message, error.details, error.hint);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
      queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
