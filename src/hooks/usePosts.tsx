import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase, supabasePublic } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { getCanonicalAuthorIds } from '@/lib/postAuthorResolver';
import { useAuth } from './useAuth';
import { useEffect, useRef, useCallback } from 'react';
import { useProfile } from './useProfile';
import type { Profile } from './useProfile';
import { calculatePriorityScore } from '@/lib/priority';
import { useShadowbanInterceptor } from './useShadowbanInterceptor';
import { useVideoTranscoding } from './useVideoTranscoding';
import { useFeedSettings } from './useFeedSettings';
import { toast } from 'sonner';
import { resolveActorId } from '@/lib/ensureProfile';
import { loadCache, saveCache } from '@/lib/persistentQueryCache';
import { useFeedCacheStore } from '@/store/useFeedCacheStore';
import { logger } from '@/lib/logger';
import { useFeedDebugStore } from '@/store/useFeedDebugStore';
import {
  sanitizeCategories,
  matchesSelectedCategories,
  FEED_GENDER_CATEGORIES,
  type FeedGenderCategory,
} from '@/config/feedGenderFilter';

export interface Post {
  id: string;
  user_id: string;      // kept for backwards compat
  author_id?: string;    // profiles.id
  creator_id?: string;   // auth.users.id (canonical owner)
  is_pinned?: boolean;
  pinned_at?: string | null;
  share_slug?: string | null;
  content_text: string | null;
  media_url: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  media_bucket?: string | null;
  privacy_level: 'public' | 'friends' | 'vip';
  is_locked: boolean;
  is_paid?: boolean;
  paid_price?: number;
  preview_blur?: string | null;
  is_adult?: boolean | null;
  legacy_public?: boolean;
  is_hidden?: boolean;
  likes_count: number;
  dislikes_count?: number;
  comments_count: number;
  saves_count?: number;
  shares_count?: number;
  created_at: string;
  updated_at: string;
  // Joined data
  author?: Profile;
  is_liked?: boolean;
  is_saved?: boolean;
}

// Helper: resolve the effective author id from a post row (profiles.id)
const getPostAuthorId = (post: any): string =>
  post.author_id || post.user_id || '';

// Canonical creator (auth user id) — prefer creator_id, fallback resolves later
export const getPostCreatorId = (post: any): string =>
  post.creator_id || '';

// Explicit column lists — avoid select('*') to reduce payload on hot feed paths.
// Keep in sync with the Post interface above and the mapProfile() helper below.
const POST_COLUMNS = [
  'id', 'author_id', 'creator_id',
  'is_pinned', 'pinned_at',
  'content_text', 'media_url', 'media_urls', 'media_type', 'thumbnail_url', 'preview_url', 'video_master_url', 'video_preview_url',
  'media_bucket', 'legacy_public',
  'video_duration_seconds',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price', 'is_hidden', 'preview_blur', 'is_adult',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
  // Canal VIP — Conteúdo narrativo (opcionais; fallback cobre views antigas)
  'title', 'subtitle', 'teaser', 'section_type', 'content_format',
  'series_id', 'series_title', 'chapter_number', 'read_time_minutes',
  // OCULTO PLAY — compartilhamento embutido no feed
  'oculto_play_item_id',
].join(',');


const POST_COLUMNS_NO_ADULT = [
  'id', 'author_id', 'creator_id',
  'is_pinned', 'pinned_at',
  'content_text', 'media_url', 'media_urls', 'media_type', 'thumbnail_url', 'preview_url', 'video_master_url', 'video_preview_url',
  'media_bucket', 'legacy_public',
  'video_duration_seconds',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price', 'is_hidden', 'preview_blur',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
  'title', 'subtitle', 'teaser', 'section_type', 'content_format',
  'series_id', 'series_title', 'chapter_number', 'read_time_minutes',
  'oculto_play_item_id',
].join(',');

const POST_COLUMNS_TABLE = [
  'id', 'author_id', 'creator_id',
  'is_pinned', 'pinned_at',
  'content_text', 'media_url', 'media_urls', 'media_type', 'thumbnail_url', 'preview_url', 'video_master_url', 'video_preview_url',
  'media_bucket', 'legacy_public',
  'video_duration_seconds',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price', 'is_hidden', 'preview_blur', 'is_adult',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
  'title', 'subtitle', 'teaser', 'section_type', 'content_format',
  'series_id', 'series_title', 'chapter_number', 'read_time_minutes',
  'oculto_play_item_id',
].join(',');

const POST_COLUMNS_TABLE_NO_ADULT = [
  'id', 'author_id', 'creator_id',
  'is_pinned', 'pinned_at',
  'content_text', 'media_url', 'media_urls', 'media_type', 'thumbnail_url', 'preview_url', 'video_master_url', 'video_preview_url',
  'media_bucket', 'legacy_public',
  'video_duration_seconds',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price', 'is_hidden', 'preview_blur',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
  'title', 'subtitle', 'teaser', 'section_type', 'content_format',
  'series_id', 'series_title', 'chapter_number', 'read_time_minutes',
  'oculto_play_item_id',
].join(',');



// Fallback compatível com versões antigas da view externa `v_feed_posts`.
// Não inclui colunas opcionais mais novas (ex.: media_urls, is_hidden) para
// evitar que o feed inteiro suma quando a view ainda não foi atualizada.
const POST_COLUMNS_FALLBACK = [
  'id', 'author_id', 'creator_id',
  'content_text', 'media_url', 'media_type', 'thumbnail_url', 'preview_url', 'video_master_url', 'video_preview_url',
  'media_bucket', 'legacy_public',
  'video_duration_seconds',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price', 'is_adult',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
].join(',');

const POST_COLUMNS_FALLBACK_NO_ADULT = [
  'id', 'author_id', 'creator_id',
  'content_text', 'media_url', 'media_type', 'thumbnail_url', 'preview_url', 'video_master_url', 'video_preview_url',
  'media_bucket', 'legacy_public',
  'video_duration_seconds',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
].join(',');

const POST_COLUMNS_TABLE_FALLBACK = [
  'id', 'author_id', 'creator_id',
  'content_text', 'media_url', 'media_type', 'thumbnail_url', 'preview_url',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
].join(',');

const POST_COLUMNS_TABLE_ADULT_FALLBACK = [
  'id', 'author_id', 'creator_id',
  'content_text', 'media_url', 'media_type', 'thumbnail_url', 'preview_url',
  'privacy_level', 'is_locked', 'is_paid', 'paid_price',
  'is_hidden', 'preview_blur', 'is_adult',
  'likes_count', 'dislikes_count', 'comments_count',
  'is_flash', 'post_type',
  'created_at', 'updated_at',
  'oculto_play_item_id',
].join(',');

const POST_COLUMNS_TABLE_ADULT_MINIMAL = [
  'id', 'author_id', 'creator_id',
  'content_text', 'media_url', 'media_type',
  'privacy_level', 'is_adult', 'is_flash', 'post_type',
  'likes_count', 'comments_count',
  'created_at', 'updated_at',
].join(',');

const POST_COLUMNS_TABLE_MINIMAL = [
  'id', 'author_id', 'creator_id', 'content_text', 'media_url', 'media_type',
  'likes_count', 'comments_count', 'created_at', 'updated_at',
].join(',');


const POST_COLUMNS_LEGACY_FALLBACK = '*';

const isMissingFeedColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    // Pós-hardening: se a VIEW perder GRANT/EXECUTE, não deixar o feed em branco.
    // Cai para a tabela `posts`, que possui policies próprias de leitura pública.
    (code === '42501' && (message.includes('v_feed_posts') || message.includes('permission denied'))) ||
    (message.includes('column') && (message.includes('v_feed_posts') || message.includes('posts'))) ||
    message.includes('relation') && message.includes('v_feed_posts') ||
    message.includes('schema cache')
  );
};

const FEED_TABLE_NAME = 'v_feed_posts';
const FEED_FALLBACK_TABLE_NAME = 'posts';

// +18 explícito: apenas posts criados com o botão +18 ativo recebem blur/filtro.
// Posts antigos, nulos ou vindos de fallbacks sem a coluna continuam no feed
// completo sem serem tratados como adultos por engano.
const normalizeIsAdult = (post: any) => post?.is_adult === true;

// Tipos de post permitidos no feed público.
// Inclui narrativos do Canal VIP (Diário VIP / capítulos / séries / artigos / histórias / bastidores)
// — o teaser/capa aparecem no feed; o conteúdo completo permanece gated pelo DiaryPaywall no leitor.
const FEED_ALLOWED_POST_TYPES = new Set<string>([
  'feed', 'standard', 'poll', 'voice_bio',
  'audio', 'video', 'image', 'media',
  'link', 'external_link', 'url', 'embed', 'link_post',
  'diary', 'chapter', 'series', 'story', 'article', 'text_post', 'backstage', 'narrative',
  // Card especial: tópico publicado em comunidade aparece como destaque no feed.
  'community_topic',
]);

const isFeedAllowedPost = (post: any): boolean => {
  const postType = post?.post_type ?? null;
  if (postType === null) return true;
  if (FEED_ALLOWED_POST_TYPES.has(postType)) return true;
  // Posts narrativos podem vir com post_type customizado mas section_type/content_format identificáveis
  const section = post?.section_type ?? null;
  const format = post?.content_format ?? null;
  if (format === 'narrative') return true;
  if (section && ['story','chapter','diary','article','series','text_post','backstage'].includes(section)) return true;
  return false;
};

const applyBaseFeedFilters = (
  q: any,
  includeHiddenFilter: boolean,
  startDate?: string | null,
  _prioritizePinned: boolean = true,
  explicitAdultOnly: boolean = false,
  includeFlashFilter: boolean = true,
  includeAdultFilter: boolean = true,
) => {
  let chain = q;

  if (includeHiddenFilter) {
    chain = chain.not('is_hidden', 'is', 'true');
  }

  if (includeFlashFilter) {
    chain = chain.or('is_flash.eq.false,is_flash.is.null');
  }

  if (startDate) {
    chain = chain.gte('created_at', startDate);
  }

  if (explicitAdultOnly && includeAdultFilter) {
    // STRICT: somente publicações marcadas explicitamente como +18.
    // Legado/null NÃO entra para garantir feed limpo de conteúdo não-adulto.
    chain = chain.eq('is_adult', true);
  }

  // IMPORTANTE: não ordenar por `is_pinned/pinned_at` no PostgREST aqui.
  // Em alguns ambientes a view `v_feed_posts` retorna 200 com `Content-Range: */0`
  // quando combinamos múltiplos `order` de fixados + paginação, fazendo o feed
  // parecer vazio/incompleto no mobile e desktop. A priorização visual de fixados
  // já é feita no frontend (RealFeed), então a consulta principal deve buscar
  // por recência pura para garantir que todas as publicações apareçam.
  // Adicionado `id` secundário para garantir ordenação determinística entre páginas.
  return chain
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
};

const selectFeedSource = (preferView: boolean = true, publicClient: boolean = false) =>
  (publicClient ? supabasePublic : supabase).from((preferView ? FEED_TABLE_NAME : FEED_FALLBACK_TABLE_NAME) as any);

// IMPORTANTE: lista apenas colunas que existem no `profiles` do Supabase externo.
// Colunas opcionais de moderação (banned_at, frozen_until) são lidas via fallback
// dinâmico para que a ausência delas NÃO derrube toda a hidratação do feed
// (PostgREST retorna 42703 e zera o profileMap → cards exibiriam "Usuário").
const PROFILE_COLUMNS = [
  'id', 'user_id',
  'display_name', 'name', 'full_name', 'username',
  'avatar_url', 'banner_url',
  'is_verified', 'is_verified_couple', 'is_online',
  'plan_type', 'profile_type', 'is_creator', 'is_seed', 'is_test_account',
  'tags', 'tags_social', 'tags_adult', 'bio', 'gender', 'gender_category',
  'address_city', 'address_state',
  'hide_location',
  'account_status',
].join(',');

const resolveNotificationRecipient = async (postId: string) => {
  const { data: post, error: postError } = await supabase
    .from('posts' as any)
    .select('author_id,creator_id')
    .eq('id', postId)
    .maybeSingle();

  if (postError || !post) return null;

  const authorProfileId = (post as any).author_id || null;
  const creatorAuthId = (post as any).creator_id || null;

  if (creatorAuthId) {
    return { authUserId: creatorAuthId as string, profileId: authorProfileId as string | null };
  }
  if (!authorProfileId) return null;

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('id', authorProfileId)
    .maybeSingle();

  return (ownerProfile as any)?.user_id
    ? { authUserId: (ownerProfile as any).user_id as string, profileId: authorProfileId as string }
    : null;
};


// PAGE_SIZE: max posts loaded per batch — keep low for low-RAM devices
export const FEED_PAGE_SIZE = 15;

export function usePosts(options?: { userId?: string; limit?: number }) {
  const { user, authReady } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const addDebugLog = useFeedDebugStore((s) => s.addLog);
  const { data: feedSettings } = useFeedSettings();

  const isEnabled = feedSettings?.is_enabled !== false;
  const showAll = feedSettings?.show_all === true;
  const maxPosts = feedSettings?.max_posts ?? 200;
  // Feed principal precisa ser realmente infinito: não aplicar corte por data
  // vindo de feed_settings.start_date, pois isso escondia publicações antigas em
  // mobile e desktop mesmo com o scroll carregando novas páginas.
  const startDate = null;

  const query = useQuery({
    queryKey: ['posts', options?.userId, options?.limit, isEnabled, showAll, maxPosts, startDate, profile?.id],
    staleTime: 24 * 60 * 60 * 1000,   // 24h
    gcTime: 48 * 60 * 60 * 1000,  // 48h


    retry: 2,
    refetchOnWindowFocus: false, 
    refetchOnMount: false,       
    refetchOnReconnect: false,   
    refetchInterval: false,      
    refetchIntervalInBackground: false,
    placeholderData: (previousData: any) => previousData, 



    enabled: authReady && !!user?.id,
    queryFn: async () => {
      addDebugLog('query', 'Buscando posts do feed', { userId: options?.userId, limit: options?.limit });
      // Feed desativado para o plano? retorna vazio
      if (!isEnabled && !options?.userId) return [];

      // Build base query — filtra por start_date se houver, sem corte de 10 dias
      const buildQuery = (
        q: any,
        columns: string = POST_COLUMNS,
        includeHiddenFilter = true
      ) => applyBaseFeedFilters(q.select(columns), includeHiddenFilter, startDate && !options?.userId ? startDate : null);

      // Limites: feed pessoal usa options.limit; feed principal usa max_posts (cap em 200 p/ não estourar memória mobile)
      const feedLimit = options?.userId
        ? (options?.limit || 80)
        : Math.min(showAll ? maxPosts : maxPosts, 200);

      let allPosts: any[] = [];

      if (options?.userId) {
        let { data, error } = await buildQuery(selectFeedSource(true), POST_COLUMNS)
          .eq('author_id', options.userId)
          .limit(feedLimit);

        if (error && isMissingFeedColumnError(error)) {
          const fallback = await buildQuery(selectFeedSource(false), POST_COLUMNS_FALLBACK, false)
            .eq('author_id', options.userId)
            .limit(feedLimit);
          data = fallback.data;
          error = fallback.error;

          if (error && isMissingFeedColumnError(error)) {
            const legacyFallback = await buildQuery(selectFeedSource(false), POST_COLUMNS_LEGACY_FALLBACK, false)
              .eq('author_id', options.userId)
              .limit(feedLimit);
            data = legacyFallback.data;
            error = legacyFallback.error;
          }
        }

        if (error) {
          console.warn('[Feed] Error fetching user posts:', error.code);
          return [];
        }
        allPosts = (data || []).filter((post: any) => {
          if (!isFeedAllowedPost(post)) return false;
          if (post?.is_hidden === true) return false;
          if (post?.privacy_level === 'hidden') return false;
          return true;
        });
      } else {
        let { data, error } = await buildQuery(selectFeedSource(true), POST_COLUMNS).limit(feedLimit);

        if (error && isMissingFeedColumnError(error)) {
          const fallback = await buildQuery(selectFeedSource(false), POST_COLUMNS_FALLBACK, false).limit(feedLimit);
          data = fallback.data;
          error = fallback.error;

          if (error && isMissingFeedColumnError(error)) {
            const legacyFallback = await buildQuery(selectFeedSource(false), POST_COLUMNS_LEGACY_FALLBACK, false).limit(feedLimit);
            data = legacyFallback.data;
            error = legacyFallback.error;
          }
        }

        if (error) {
          console.warn('[Feed] Error fetching posts:', error.code);
          return [];
        }
        allPosts = (data || []).filter((post: any) => {
          if (!isFeedAllowedPost(post)) return false;
          if (post?.is_hidden === true) return false;
          if (post?.privacy_level === 'hidden') return false;
          return true;
        });
      }

      if (allPosts.length === 0) {
        addDebugLog('query', 'Nenhum post encontrado');
        return [];
      }
      addDebugLog('query', `${allPosts.length} posts carregados`);

      // Para posts pagos bloqueados pela VIEW v_feed_posts (media_url=NULL),
      // usar preview_url como placeholder visual; o overlay paywall cobre.
      for (const row of allPosts) {
        if (!row.media_url && row.is_paid && row.preview_url) {
          row.media_url = row.preview_url;
        }
      }

      // Collect unique author IDs and fetch profiles separately
      const authorIds = [...new Set(allPosts.map(getPostAuthorId).filter(Boolean))];
      let profileMap = new Map<string, any>();

      if (authorIds.length > 0) {
        const mapProfile = (p: any) => ({
          id: p.id,
          user_id: p.user_id || p.id,
          name: p.display_name || p.name || p.full_name || p.username || 'Usuário',
          username: p.username || null,
          avatar_url: p.avatar_url || null,
          cover_image_url: p.banner_url || null,
          is_verified: p.is_verified ?? false,
          is_verified_couple: p.is_verified_couple ?? false,
          is_online: p.is_online ?? false,
          plan_type: p.plan_type || 'free',
          profile_type: p.profile_type || 'individual',
          is_creator: p.is_creator ?? false,
          is_seed: p.is_seed ?? false,
          is_test_account: p.is_test_account ?? false,
          tags_social: Array.isArray(p.tags_social) ? p.tags_social : (Array.isArray(p.tags) ? p.tags : []),
          tags_adult: Array.isArray(p.tags_adult) ? p.tags_adult : [],
          bio: p.bio || null,
          gender: p.gender || null,
          address_city: p.address_city || null,
          address_state: p.address_state || null,
          hide_location: p.hide_location ?? false,
        });

        const hydrateMap = (rows: any[] | null | undefined) => {
          if (!rows) return;
          for (const p of rows) {
            const mapped = mapProfile(p);
            if (p.id) profileMap.set(p.id, mapped);
            if (p.user_id && p.user_id !== p.id) profileMap.set(p.user_id, mapped);
          }
        };

        // Lookup by id first, then by user_id for any missing
        const { data: byId, error: byIdError } = await supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .in('id', authorIds);

        if (byIdError) {
          console.warn('[Feed] profiles by id failed:', byIdError.message);
        }
        hydrateMap(byId as any[]);

        const stillMissing = authorIds.filter(id => !profileMap.has(id));
        if (stillMissing.length > 0) {
          const { data: byUserId } = await supabase
            .from('profiles')
            .select(PROFILE_COLUMNS)
            .in('user_id', stillMissing);
          hydrateMap(byUserId as any[]);
        }
      }

      // Fetch likes and current save counts
      let likedPostIds = new Set<string>();
      let savedPostIds = new Set<string>();
      const savedCounts = new Map<string, number>();
      const postIds = allPosts.map(p => p.id);

      if (postIds.length > 0) {
        const { data: allSaves } = await supabase
          .from('saved_posts' as any)
          .select('post_id')
          .in('post_id', postIds);

        for (const save of (allSaves as any[] || [])) {
          const postId = save?.post_id;
          if (!postId) continue;
          savedCounts.set(postId, (savedCounts.get(postId) || 0) + 1);
        }
      }

      if (user?.id && profile?.id) {
        const likeActorId = profile.id;
        const saveActorId = profile.id;

        const [likesResult, savesResult] = await Promise.all([
          supabase
            .from('post_likes' as any)
            .select('post_id')
            .in('post_id', postIds)
            .eq('user_id', likeActorId),
          supabase
            .from('saved_posts' as any)
            .select('post_id')
            .in('post_id', postIds)
            .eq('user_id', saveActorId),
        ]);

        likedPostIds = new Set((likesResult.data as any[] || []).map(l => l.post_id));
        savedPostIds = new Set((savesResult.data as any[] || []).map(s => s.post_id));
      }

      // Map posts with author + like/save status
      const postsWithAuthor = allPosts.map(post => {
        const aid = getPostAuthorId(post);
        const foundAuthor = profileMap.get(aid);
        const fallbackAuthor = {
          id: aid,
          user_id: aid,
          name: 'Usuário',
          username: null,
          avatar_url: null,
          is_verified: false,
          is_verified_couple: false,
          is_online: false,
          plan_type: 'free',
          profile_type: 'individual',
          tags_social: [],
          tags_adult: [],
        };

        return {
          ...post,
          is_adult: normalizeIsAdult(post),
          user_id: foundAuthor?.user_id || (post as any).creator_id || aid, // normalize
          privacy_level: (post?.privacy_level ?? 'public') as Post['privacy_level'],
          author: foundAuthor || fallbackAuthor,
          saves_count: savedCounts.get(post.id) ?? post.saves_count ?? 0,
          is_liked: likedPostIds.has(post.id),
          is_saved: savedPostIds.has(post.id),
        };
      }) as Post[];

      // Sort: real posts first, seeds at the end
      const seedIds = new Set<string>();
      for (const [id, p] of profileMap) {
        if (p.is_seed || p.is_test_account) seedIds.add(id);
      }

      const realPosts: Post[] = [];
      const seedPosts: Post[] = [];
      for (const p of postsWithAuthor) {
        if (seedIds.has(getPostAuthorId(p))) {
          seedPosts.push(p);
        } else {
          realPosts.push(p);
        }
      }

      // Already sorted by created_at desc from DB
      return [...realPosts, ...seedPosts.slice(0, 10)];
    },
  });

  // Subscribe to realtime updates with auto-reconnect + throttled refetch.
  //
  // Histórico: a versão anterior chamava `invalidateQueries({refetchType:'all'})`
  // + `refetchQueries({type:'all'})` para TODOS os eventos (inclusive cada
  // mudança em `profiles`, `post_likes`, `post_comments` etc.). Em mobile
  // isso disparava um refetch completo de TODAS as páginas a cada poucos
  // segundos → o array de `posts` ganhava nova identidade → Virtuoso e os
  // cards remontavam → o feed "piscava/reiniciava" durante a navegação.
  //
  // Correção:
  //  - `profiles` saiu da assinatura: muda o tempo todo (presença, status,
  //    avatar) e não é dono do feed.
  //  - Eventos secundários (likes/saves/comments/shares) são coalescidos
  //    em janela maior (1500ms) e usam `refetchType: 'active'` — só refaz
  //    queries que estão sendo observadas naquele instante.
  //  - Removido o `refetchQueries` duplicado — `invalidate` já refaz.
  //  - `visibilitychange` agora respeita um cooldown de 5s, evitando
  //    refetch instantâneo cada vez que o usuário troca rapidamente de
  //    aba/app em mobile (gera flicker).
  useEffect(() => {
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRefetch = false;
    let isMounted = true;
    let lastRefetchAt = 0;
    const addDebugLog = useFeedDebugStore.getState().addLog;

    const doRefetch = () => {
      if (!isMounted) return;
      
      const now = Date.now();
      // Proteção contra loops de refetch: ignorar se houve um refetch há menos de 10 segundos
      if (now - lastRefetchAt < 10000) {
        addDebugLog('stale', 'Refetch ignorado (cooldown ativo)', { diff: now - lastRefetchAt });
        return;
      }

      lastRefetchAt = now;
      addDebugLog('query', 'Disparando refetch controlado via Realtime/Visibility');
      
      queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['oculto-feed-news'] });
      queryClient.invalidateQueries({ queryKey: ['oculto-feed-cards'] });
    };

    const throttledRefetch = (immediate = false) => {
      if (!isMounted) return;
      
      if (immediate) {
        if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
        pendingRefetch = false;
        doRefetch();
        return;
      }
      
      pendingRefetch = true;
      if (throttleTimer) return;
      
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (!isMounted || !pendingRefetch) return;
        pendingRefetch = false;
        doRefetch();
      }, 15000); // Janela de coalescência aumentada para 15s para evitar piscadas
    };

    const onPostsChange = (payload: any) => {
      addDebugLog('stale', 'Evento Realtime detectado: posts', { type: payload.eventType });
      throttledRefetch(false); // Nunca imediato para alterações de posts via realtime
    };
    
    const onSecondaryChange = (payload: any) => {
      addDebugLog('stale', `Evento Realtime secundário: ${payload.table}`, { type: payload.eventType });
      throttledRefetch(false);
    };

    const unsubs: Array<() => void> = [
      subscribeTable('posts', onPostsChange),
      subscribeTable('post_likes', onSecondaryChange),
      subscribeTable('post_dislikes', onSecondaryChange),
      subscribeTable('post_comments', onSecondaryChange),
      subscribeTable('saved_posts', onSecondaryChange),
      subscribeTable('post_shares', onSecondaryChange),
    ];

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      
      const now = Date.now();
      // Só refetch se ficou fora por mais de 5 minutos
      if (now - lastRefetchAt < 300000) {
        addDebugLog('stale', 'Visibility ignorado (cache recente)', { diff: now - lastRefetchAt });
        return;
      }
      
      addDebugLog('query', 'Retorno de visibilidade detectado');
      throttledRefetch(true);
    };
    
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      isMounted = false;
      if (throttleTimer) clearTimeout(throttleTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      for (const u of unsubs) u();
    };
  }, [queryClient]);


  return query;
}

/**
 * useInfinitePosts — paginação por cursor (created_at desc) usando .range()
 * Usado pelo RealFeed para infinite scroll de alta performance.
 * Retorna pages = Post[][]; flatten via useMemo no consumidor.
 */
export function useInfinitePosts(
  pageSize: number = FEED_PAGE_SIZE,
  options?: { explicitAdultOnly?: boolean },
) {
  const { user, authReady } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const addDebugLog = useFeedDebugStore((s) => s.addLog);
  const { data: feedSettings } = useFeedSettings();
  const likedSavedHydrationReadyRef = useRef(false);
  // O feed público não pode depender do carregamento completo da linha em
  // `profiles`. Em alguns logins/dispositivos o profile chega depois do auth;
  // manter `profile.id` como gate deixava a query desabilitada e a UI caía no
  // estado vazio. Dados dependentes do perfil (filtro de gênero, autor, liked)
  // já têm fallbacks próprios e são revalidados quando o profile hidrata.
  const feedIdentityReady = authReady && !!user?.id;

  useEffect(() => {
    const idle = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 1200));
    const cancel = (window as any).cancelIdleCallback || clearTimeout;
    const handle = idle(() => {
      likedSavedHydrationReadyRef.current = true;
    }, { timeout: 2500 });
    return () => cancel(handle);
  }, []);

  const isEnabled = feedSettings?.is_enabled !== false;
  // Feed principal infinito NÃO pode respeitar `feed_settings.start_date`.
  // Esse corte ainda estava ativo no hook usado pelo RealFeed e escondia posts
  // antigos em mobile/desktop mesmo após o ajuste feito no hook legado `usePosts`.
  const startDate = null;
  const explicitAdultOnly = options?.explicitAdultOnly === true;

  const buildInfinitePostsQuery = useCallback((
    from: number,
    to?: number,
    columns: string = POST_COLUMNS,
    includeHiddenFilter = true,
    preferView = true,
    includeFlashFilter = true,
    includeAdultFilter = true,
    prioritizePinned = true,
    publicClient = false,
  ) => {
    let chain: any = applyBaseFeedFilters(
      selectFeedSource(preferView, publicClient).select(columns),
      includeHiddenFilter,
      startDate,
      prioritizePinned,
      explicitAdultOnly,
      includeFlashFilter,
      includeAdultFilter,
    );

    if (typeof to === 'number') {
      return chain.range(from, to);
    }

    return chain.limit(pageSize);
  }, [pageSize, startDate, explicitAdultOnly]);

  // Filtro de gênero salvo no perfil — aplicado em runtime (e na queryKey,
  // para refetch instantâneo quando o usuário muda no modal "Filtro do feed").
  const selectedGenderCategories: FeedGenderCategory[] = sanitizeCategories(
    (profile as any)?.feed_filter_categories,
  );
  const allCategoriesSelected =
    selectedGenderCategories.length === 0 ||
    selectedGenderCategories.length >= FEED_GENDER_CATEGORIES.length;
  const genderFilterKey = allCategoriesSelected
    ? 'all'
    : [...selectedGenderCategories].sort().join(',');

  // Feed principal: filtros de descoberta não removem posts; o filtro de
  // gênero do usuário (Filtro do Feed) é aplicado depois e respeita o
  // opt-in de cada categoria.
  const feedCacheKey = `feed:v18-complete-includes-adult-posts:adult-mode=${explicitAdultOnly ? 'explicit' : 'all'}:${profile?.id ?? 'anon'}:${pageSize}:gf=${genderFilterKey}`;
  const cachedFeed = loadCache<{ posts: Post[]; nextOffset: number | null }>(feedCacheKey, 24 * 60 * 60 * 1000);
  // Só usar o cache como `initialData` se ainda estiver fresco (≤ staleTime).
  // Cache antigo (de horas/dias atrás) servido como initialData + refetchOnMount:false
  // fazia usuários que logavam verem feed desatualizado SEM refetch — a causa raiz
  // do bug "logo após login, posts de 1-2 dias atrás aparecem como mais recentes".
  const FEED_FRESH_MS = 24 * 60 * 60 * 1000; // 24h
  const cacheIsFresh =
    !explicitAdultOnly &&
    !!cachedFeed?.updatedAt &&
    Array.isArray(cachedFeed?.data?.posts) &&
    cachedFeed.data.posts.length > 0 &&
    (Date.now() - cachedFeed.updatedAt) < FEED_FRESH_MS;
  const getOfflineFeedSnapshot = () => {
    if (explicitAdultOnly) return null;
    const cached = cachedFeed?.data?.posts?.length ? cachedFeed.data.posts : [];
    const zustand = useFeedCacheStore.getState().getPostsSnapshot(user?.id || null) as Post[];
    const posts = cached.length ? cached : zustand;
    return posts.length ? { posts, nextOffset: null as number | null, offline: true } : null;
  };


  const query = useInfiniteQuery({
    queryKey: ['posts-infinite', 'v18-complete-includes-adult-posts', isEnabled, profile?.id, pageSize, genderFilterKey, explicitAdultOnly],
    initialPageParam: 0,
    staleTime: 24 * 60 * 60 * 1000, 
    gcTime: 48 * 60 * 60 * 1000, 


    retry: (failureCount, err: any) => {
      if (failureCount >= 3) return false;
      const msg = String(err?.message || err || '');
      return /abort|aborted|network|fetch|timeout|failed to fetch|load failed/i.test(msg);
    },
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false, 
    refetchInterval: false,
    refetchIntervalInBackground: false,
    placeholderData: (previousData: any) => previousData, 
    enabled: feedIdentityReady,


    queryFn: async ({ pageParam = 0 }) => {
      if (!isEnabled) return { posts: [] as Post[], nextOffset: null as number | null };


      const from = pageParam as number;
      const to = from + pageSize - 1;

      // Timeout duro de 10s no fetch principal — se a conexão pendurar, lança
      // erro e o retry com backoff entra em ação ao invés de skeleton eterno.
      const withTimeout = <T,>(p: PromiseLike<T>, ms = 10_000, tag = 'feed-fetch'): Promise<T> =>
        Promise.race([
          Promise.resolve(p) as Promise<T>,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${tag}`)), ms)),
        ]);

      const safeFeedResult = async (p: PromiseLike<any>, tag: string) => {
        try {
          return await withTimeout<any>(p, 10_000, tag);
        } catch (err: any) {
          console.warn('[Feed] request failed:', tag, err?.message || err);
          return {
            data: null,
            error: {
              code: 'FETCH_FAILED',
              message: String(err?.message || err || 'Falha de rede ao carregar o feed'),
            },
          };
        }
      };

      const safeHydrationResult = async (p: PromiseLike<any>, tag: string) => {
        try {
          return await withTimeout<any>(p, 8_000, tag);
        } catch (err: any) {
          console.warn('[Feed] hydration failed:', tag, err?.message || err);
          return { data: [] as any[], error: { code: 'FETCH_FAILED', message: String(err?.message || err || tag) } };
        }
      };

      // Auditoria de compatibilidade do feed:
      // 1) normal usa a view v_feed_posts (controla paywall/preview);
      // 2) modo +18 usa a tabela posts para ler a flag real is_adult;
      // 3) se o Supabase externo estiver com schema antigo, caímos para listas
      //    progressivamente menores e removemos apenas os filtros que dependem
      //    de colunas ausentes. Assim o feed não some por uma coluna nova.
      const attempts = explicitAdultOnly
        ? [
            // Preferir a view do feed: ela é a rota liberada por RLS para todos
            // os usuários autenticados. Consultar `posts` direto podia voltar
            // vazio em alguns perfis/dispositivos, deixando o modo +18 sem feed.
            { columns: POST_COLUMNS, hidden: true, view: true, flash: true, adult: true, pinned: true },
            { columns: POST_COLUMNS_FALLBACK, hidden: false, view: true, flash: true, adult: true, pinned: false },
            { columns: POST_COLUMNS_TABLE, hidden: true, view: false, flash: true, adult: true, pinned: true },
            { columns: POST_COLUMNS_TABLE_ADULT_FALLBACK, hidden: true, view: false, flash: true, adult: true, pinned: false },
            { columns: POST_COLUMNS_TABLE_ADULT_MINIMAL, hidden: false, view: false, flash: true, adult: true, pinned: false },
            { columns: POST_COLUMNS_LEGACY_FALLBACK, hidden: false, view: false, flash: false, adult: true, pinned: false },
            { columns: POST_COLUMNS_FALLBACK, hidden: false, view: true, flash: true, adult: true, pinned: false, public: true },
            { columns: POST_COLUMNS_TABLE_ADULT_MINIMAL, hidden: false, view: false, flash: true, adult: true, pinned: false, public: true },
          ]
        : [
            { columns: POST_COLUMNS, hidden: true, view: true, flash: true, adult: false, pinned: true },
            { columns: POST_COLUMNS_NO_ADULT, hidden: true, view: true, flash: true, adult: false, pinned: true },
            { columns: POST_COLUMNS_FALLBACK, hidden: false, view: true, flash: true, adult: false, pinned: false },
            { columns: POST_COLUMNS_FALLBACK_NO_ADULT, hidden: false, view: true, flash: true, adult: false, pinned: false },
            { columns: POST_COLUMNS_TABLE, hidden: true, view: false, flash: true, adult: false, pinned: true },
            { columns: POST_COLUMNS_TABLE_NO_ADULT, hidden: true, view: false, flash: true, adult: false, pinned: true },
            { columns: POST_COLUMNS_TABLE_FALLBACK, hidden: false, view: false, flash: true, adult: false, pinned: false },
            { columns: POST_COLUMNS_TABLE_MINIMAL, hidden: false, view: false, flash: false, adult: false, pinned: false },
            { columns: POST_COLUMNS_LEGACY_FALLBACK, hidden: false, view: false, flash: false, adult: false, pinned: false },
            { columns: POST_COLUMNS_FALLBACK_NO_ADULT, hidden: false, view: true, flash: true, adult: false, pinned: false, public: true },
            { columns: POST_COLUMNS_TABLE_MINIMAL, hidden: false, view: false, flash: false, adult: false, pinned: false, public: true },
          ];

      let data: any[] | null = null;
      let error: any = null;
      for (const attempt of attempts) {
        const result = await safeFeedResult(
          buildInfinitePostsQuery(
            from,
            to,
            attempt.columns,
            attempt.hidden,
            attempt.view,
            attempt.flash,
            attempt.adult,
            attempt.pinned,
            (attempt as any).public === true,
          ),
          `feed-attempt-${attempt.view ? 'view' : 'table'}${(attempt as any).public ? '-anon' : ''}-${from}`,
        );
        data = result.data;
        error = result.error;
        if (!error) break;
        if (!isMissingFeedColumnError(error)) break;
      }

      // Se a primeira página voltou vazia pela view/tabela, tenta seleções mais
      // enxutas antes de declarar feed vazio. No modo +18, o filtro SQL
      // is_adult=true é preservado em todos os fallbacks para não misturar
      // conteúdos do modo completo.
      if (!error && (!data || data.length === 0) && from === 0) {
        const emptyFallbacks = explicitAdultOnly
          ? [
              { columns: POST_COLUMNS, hidden: true, view: true, flash: true, adult: true, pinned: true },
              { columns: POST_COLUMNS_FALLBACK, hidden: false, view: true, flash: true, adult: true, pinned: false },
              { columns: POST_COLUMNS_TABLE, hidden: true, view: false, flash: true, adult: true, pinned: true },
              { columns: POST_COLUMNS_TABLE_ADULT_FALLBACK, hidden: true, view: false, flash: true, adult: true, pinned: false },
              { columns: POST_COLUMNS_TABLE_ADULT_MINIMAL, hidden: false, view: false, flash: true, adult: true, pinned: false },
              { columns: POST_COLUMNS_LEGACY_FALLBACK, hidden: false, view: false, flash: false, adult: true, pinned: false },
              { columns: POST_COLUMNS_FALLBACK, hidden: false, view: true, flash: true, adult: true, pinned: false, public: true },
              { columns: POST_COLUMNS_TABLE_ADULT_MINIMAL, hidden: false, view: false, flash: true, adult: true, pinned: false, public: true },
            ]
          : [
              { columns: POST_COLUMNS_TABLE, hidden: true, view: false, flash: true, adult: false, pinned: true },
              { columns: POST_COLUMNS_TABLE_NO_ADULT, hidden: true, view: false, flash: true, adult: false, pinned: true },
              { columns: POST_COLUMNS_LEGACY_FALLBACK, hidden: false, view: false, flash: false, adult: false, pinned: false },
              { columns: POST_COLUMNS_FALLBACK_NO_ADULT, hidden: false, view: true, flash: true, adult: false, pinned: false, public: true },
              { columns: POST_COLUMNS_TABLE_MINIMAL, hidden: false, view: false, flash: false, adult: false, pinned: false, public: true },
            ];
        for (const attempt of emptyFallbacks) {
          const result = await safeFeedResult(
            buildInfinitePostsQuery(0, undefined, attempt.columns, attempt.hidden, attempt.view, attempt.flash, attempt.adult, attempt.pinned, (attempt as any).public === true),
            `feed-empty-fallback-${attempt.view ? 'view' : 'table'}${(attempt as any).public ? '-anon' : ''}`,
          );
          if (!result.error && result.data?.length) {
            data = result.data;
            error = null;
            break;
          }
          if (result.error && !isMissingFeedColumnError(result.error)) {
            error = result.error;
            break;
          }
        }
      }

      if (error) {
        console.warn('[Feed] infinite fetch error:', error.code, error.message);
        const offline = getOfflineFeedSnapshot();
        if (from === 0 && offline) return offline;
        return { posts: [] as Post[], nextOffset: null };
      }

      let rawData = (data || []) as any[];

      // Experiência completa deve exibir TAMBÉM as publicações +18 recentes,
      // com blur decidido no RealPostCard. Em algumas versões da view
      // `v_feed_posts`, esses posts adultos eram omitidos; como a consulta da
      // view ainda voltava com posts não-adultos, o fallback para `posts` nunca
      // rodava e o usuário via o feed incompleto. Buscamos uma faixa paralela
      // apenas de `posts.is_adult=true` e mesclamos por id, mantendo a view como
      // fonte principal para os demais cards e sem afetar o modo “Apenas +18”.
      if (!explicitAdultOnly) {
        const adultSupplementAttempts = [
          { columns: POST_COLUMNS_TABLE, hidden: true, flash: true },
          { columns: POST_COLUMNS_TABLE_ADULT_FALLBACK, hidden: true, flash: true },
          { columns: POST_COLUMNS_TABLE_ADULT_MINIMAL, hidden: false, flash: true },
          { columns: POST_COLUMNS_LEGACY_FALLBACK, hidden: false, flash: false },
        ];

        for (const attempt of adultSupplementAttempts) {
          let adultQuery: any = supabase
            .from(FEED_FALLBACK_TABLE_NAME as any)
            .select(attempt.columns)
            .eq('is_adult', true)
            .order('created_at', { ascending: false });

          if (attempt.hidden) adultQuery = adultQuery.not('is_hidden', 'is', 'true');
          if (attempt.flash) adultQuery = adultQuery.or('is_flash.eq.false,is_flash.is.null');
          adultQuery = adultQuery.range(from, to);

          const supplement = await safeFeedResult(adultQuery, 'feed-adult-supplement');
          if (!supplement.error) {
            const seenIds = new Set(rawData.map((p: any) => p?.id).filter(Boolean));
            const missingAdultRows = ((supplement.data || []) as any[]).filter((p: any) => p?.id && !seenIds.has(p.id));
            if (missingAdultRows.length > 0) {
              rawData = [...rawData, ...missingAdultRows].sort((a: any, b: any) => {
                const ta = new Date(a?.created_at || 0).getTime();
                const tb = new Date(b?.created_at || 0).getTime();
                return tb - ta;
              });
            }
            break;
          }
          if (!isMissingFeedColumnError(supplement.error)) break;
        }
      }

      // Normaliza media_url: aceita media_urls[] como fallback (compat. com posts antigos/novos)
      // E para posts pagos bloqueados pela VIEW (media_url=NULL), usa preview_url como
      // placeholder visual — o overlay continua exibindo o paywall.
      for (const row of rawData) {
        if (!row.media_url && Array.isArray((row as any).media_urls) && (row as any).media_urls.length > 0) {
          row.media_url = (row as any).media_urls[0];
        }
        if (!row.media_url && row.is_paid && row.preview_url) {
          row.media_url = row.preview_url;
        }
      }

      const allPosts = rawData.filter((post: any) => {
        if (!isFeedAllowedPost(post)) return false;
        if (post?.is_hidden === true) return false;
        if (post?.privacy_level === 'hidden') return false;
        if (explicitAdultOnly) {
          if (post?.is_adult !== true) return false;
          if (post?.is_flash === true) return false;
          if ((post as any)?.oculto_play_item_id) return false;
        }
        return true;
      });

      // Pagination: decidir pela quantidade BRUTA antes do filtro post_type.
      // Caso contrário, uma página inteira de polls/outros tipos derrubaria
      // erroneamente nextOffset para null e travaria o infinite scroll.
      if (rawData.length === 0 && allPosts.length === 0) {
        const offline = from === 0 ? getOfflineFeedSnapshot() : null;
        if (offline) return offline;
        return { posts: [] as Post[], nextOffset: null };
      }

      const authorIds = [...new Set(allPosts.map(getPostAuthorId).filter(Boolean))];
      const creatorIds = [...new Set(allPosts.map((p: any) => p.creator_id).filter(Boolean))];
      // Unifica chaves: alguns posts têm author_id = profiles.id, outros = auth.uid;
      // creator_id quase sempre é auth.uid. Buscamos por todas as possibilidades.
      const lookupIds = [...new Set([...authorIds, ...creatorIds])];
      const postIds = allPosts.map((p: any) => p.id);
      const actorId = user?.id && profile?.id ? profile.id : null;
      const shouldHydrateViewerState = likedSavedHydrationReadyRef.current || from > 0;

      // Tudo em paralelo: profiles (UMA query com OR cobre id E user_id) + likes + saves do usuário atual.
      // Combinar reduz 1 round-trip de rede por página — ganho real em 3G/4G ruim.
      const orFilter = lookupIds.length > 0
        ? `id.in.(${lookupIds.join(',')}),user_id.in.(${lookupIds.join(',')})`
        : null;
      const [profilesResult, likesResult, savesResult, allSavesResult] = await Promise.all([
        orFilter
          ? safeHydrationResult(supabase.from('profiles').select(PROFILE_COLUMNS).or(orFilter), 'profiles-hydration')
          : Promise.resolve({ data: [] as any[], error: null }),
        actorId && shouldHydrateViewerState
          ? safeHydrationResult(supabase.from('post_likes' as any).select('post_id').in('post_id', postIds).eq('user_id', actorId), 'likes-hydration')
          : Promise.resolve({ data: [] as any[], error: null }),
        actorId && shouldHydrateViewerState
          ? safeHydrationResult(supabase.from('saved_posts' as any).select('post_id').in('post_id', postIds).eq('user_id', actorId), 'saved-hydration')
          : Promise.resolve({ data: [] as any[], error: null }),
        // Contagem real de saves por post (independente do viewer) — garante que
        // o contador exibido reflita o estado do banco mesmo se posts.saves_count
        // não estiver sincronizado por trigger.
        postIds.length > 0
          ? safeHydrationResult(supabase.from('saved_posts' as any).select('post_id').in('post_id', postIds), 'all-saves-hydration')
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      const profileMap = new Map<string, any>();
      const mapProfile = (p: any) => ({
        id: p.id,
        user_id: p.user_id || p.id,
        name: p.display_name || p.name || p.full_name || p.username || 'Usuário',
        username: p.username || null,
        avatar_url: p.avatar_url || null,
        cover_image_url: p.banner_url || null,
        is_verified: p.is_verified ?? false,
        is_verified_couple: p.is_verified_couple ?? false,
        is_online: p.is_online ?? false,
        plan_type: p.plan_type || 'free',
        profile_type: p.profile_type || 'individual',
        is_creator: p.is_creator ?? false,
        is_seed: p.is_seed ?? false,
        is_test_account: p.is_test_account ?? false,
        tags_social: Array.isArray(p.tags_social) ? p.tags_social : (Array.isArray(p.tags) ? p.tags : []),
        tags_adult: Array.isArray(p.tags_adult) ? p.tags_adult : [],
        bio: p.bio || null,
        gender: p.gender || null,
        gender_category: p.gender_category ?? null,
        address_city: p.address_city || null,
        address_state: p.address_state || null,
        hide_location: p.hide_location ?? false,
        account_status: p.account_status || 'active',
        banned_at: p.banned_at || null,
        frozen_until: p.frozen_until || null,
      });
      const indexProfile = (p: any) => {
        const mapped = mapProfile(p);
        if (p.id) profileMap.set(p.id, mapped);
        if (p.user_id) profileMap.set(p.user_id, mapped);
      };
      for (const p of (profilesResult.data as any[] || [])) indexProfile(p);


      const likedPostIds = new Set((likesResult.data as any[] || []).map((l: any) => l.post_id));
      const savedPostIds = new Set((savesResult.data as any[] || []).map((s: any) => s.post_id));
      const savesCountMap = new Map<string, number>();
      for (const row of (allSavesResult.data as any[] || [])) {
        const pid = row?.post_id;
        if (!pid) continue;
        savesCountMap.set(pid, (savesCountMap.get(pid) || 0) + 1);
      }


      const nowMs = Date.now();
      const computeRestriction = (author: any): null | 'banido' | 'congelado' => {
        if (!author) return null;
        if (author.banned_at) return 'banido';
        if (author.account_status && !['active', 'verified'].includes(author.account_status)) {
          if (author.account_status === 'banned') return 'banido';
          if (author.account_status === 'frozen') return 'congelado';
          return 'banido';
        }
        if (author.frozen_until) {
          const t = new Date(author.frozen_until).getTime();
          if (!Number.isNaN(t) && t > nowMs) return 'congelado';
        }
        return null;
      };

      const rawPosts = allPosts.map((post: any) => {
        const aid = getPostAuthorId(post);
        const cid = (post as any).creator_id;
        // Tenta múltiplas chaves: author_id (profiles.id), creator_id (auth.uid) ou user_id legado
        const foundAuthor =
          profileMap.get(aid) ||
          (cid ? profileMap.get(cid) : null) ||
          (post.user_id ? profileMap.get(post.user_id) : null);
        const restricted_reason = computeRestriction(foundAuthor);
        return {
          ...post,
          is_adult: normalizeIsAdult(post),
          user_id: foundAuthor?.user_id || cid || aid,
          privacy_level: (post?.privacy_level ?? 'public') as Post['privacy_level'],
          author: foundAuthor || {
            id: aid, user_id: aid, name: 'Usuário', username: null, avatar_url: null,
            is_verified: false, is_verified_couple: false, is_online: false,
            plan_type: 'free', profile_type: 'individual', tags_social: [], tags_adult: [],
          },
          saves_count: savesCountMap.get(post.id) ?? post.saves_count ?? 0,
          is_liked: likedPostIds.has(post.id),
          is_saved: savedPostIds.has(post.id),
          restricted_reason,
        };
      }) as Post[];

      // Feed principal universal: filtros de perfil/gênero não podem remover
      // publicações públicas válidas de outros usuários. Eles ficam apenas para
      // descoberta/search; aqui a regra é recência + visibilidade pública.
      const NARRATIVE_SECTIONS_FILTER = new Set([
        'story', 'chapter', 'diary', 'article', 'series', 'text_post', 'backstage',
      ]);
      const myUserId = user?.id ?? null;
      const myProfileId = profile?.id ?? null;

      // Cards narrativos VIP (Bastidores, Diário, Capítulo, Série, Artigo,
      // História, Texto exclusivo) só devem aparecer no feed quando o post
      // realmente tem conteúdo vindo do canal de origem — ou seja: precisa
      // ter pelo menos título, capa ou um teaser/conteúdo substancial.
      // Stubs vazios (uma frase só, sem capa, sem título) são ocultados.
      const hasNarrativeContent = (p: any) => {
        const title = (p?.title || '').toString().trim();
        if (title.length > 0) return true;
        const cover = p?.thumbnail_url || p?.preview_url || p?.media_url;
        if (cover) return true;
        const teaser = (p?.teaser || p?.content_text || p?.content || '').toString().trim();
        return teaser.length >= 60;
      };
      const isEmptyNarrativeStub = (p: any) => {
        const isNarrative =
          p?.content_format === 'narrative' ||
          (p?.section_type && NARRATIVE_SECTIONS_FILTER.has(p.section_type));
        if (!isNarrative) return false;
        // Dono do post sempre vê os próprios cards (mesmo vazios) para edição.
        if (myUserId && (p.user_id === myUserId || p.author?.user_id === myUserId)) return false;
        if (myProfileId && (p.author_id === myProfileId || p.author?.id === myProfileId)) return false;
        return !hasNarrativeContent(p);
      };

      const baseFiltered = rawPosts.filter((p: any) => !isEmptyNarrativeStub(p));

      // Filtro Global de Gênero do Feed — aplicado em TODOS os modos de
      // experiência (Apenas +18 e Experiência Completa). Quando o usuário
      // alterna no modal "Filtro do feed", o save() invalida `posts-infinite`
      // e o `genderFilterKey` da queryKey força refetch instantâneo, sem
      // recarregar a página. Perfis sem gênero passam (allowUnknown=true)
      // para evitar feed vazio em catálogos legados.
      const genderFiltered = allCategoriesSelected
        ? baseFiltered
        : baseFiltered.filter((p: any) => {
            // Dono do post sempre vê seus próprios posts.
            if (myUserId && (p.user_id === myUserId || p.author?.user_id === myUserId)) return true;
            if (myProfileId && (p.author_id === myProfileId || p.author?.id === myProfileId)) return true;
            const raw =
              p?.author?.gender_category ??
              p?.author?.gender ??
              p?.gender_category ??
              p?.gender ??
              null;
            return matchesSelectedCategories(raw, selectedGenderCategories, { allowUnknown: true });
          });

      // ORDENAÇÃO DETERMINÍSTICA (IMPORTANTE PARA EVITAR PISCADAS):
      // 1. Fixados (is_pinned) primeiro.
      // 2. Data de criação (created_at) decrescente.
      // 3. ID como critério de desempate final.
      const posts = [...genderFiltered].sort((a: any, b: any) => {
        const ap = a?.is_pinned ? 1 : 0;
        const bp = b?.is_pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;

        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (dateA !== dateB) return dateB - dateA;

        return String(b.id).localeCompare(String(a.id));
      });

      // Use rawData length (pré-filtro) para decidir se há próxima página.
      // Se a página inteira veio cheia mas foi filtrada por post_type/gênero, ainda
      // queremos avançar o cursor para não travar o scroll.
      const nextOffset = rawData.length < pageSize ? null : from + (rawData.length || pageSize);
      const result = { posts, nextOffset };
      // Cache só da primeira página (hidratação instantânea no próximo load)
      if (from === 0 && posts.length > 0) {
        saveCache(feedCacheKey, result);
        useFeedCacheStore.getState().setPosts(posts, user?.id || null);
      }
      return result;
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialData: cacheIsFresh && cachedFeed?.data
      ? { pages: [cachedFeed.data], pageParams: [0] }
      : undefined,
    initialDataUpdatedAt: cacheIsFresh ? cachedFeed?.updatedAt : undefined,
  });


  // ============================================================
  // Login boot refetch — garante feed fresco logo após autenticar.
  // Sem isso, usuários que logam com cache antigo (24h TTL) viam
  // posts atrasados em 1-2 dias até o head-poll de 60s rodar.
  // ============================================================
  const lastBootRefetchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!feedIdentityReady || !user?.id) return;
    if (lastBootRefetchRef.current === user.id) return;
    lastBootRefetchRef.current = user.id;

    // COALESCÊNCIA AGRESSIVA: se já houve refetch nos últimos 10s, ignora o boot.
    const now = Date.now();
    const lastRefetch = (window as any)._OCULTO_LAST_REFETCH || 0;
    if (now - lastRefetch < 10000) {
      addDebugLog('stale', 'Ignorando boot refetch (cooldown ativo)', { diff: now - lastRefetch });
      return;
    }
    (window as any)._OCULTO_LAST_REFETCH = now;

    addDebugLog('query', 'Disparando refetch de boot');
    queryClient.invalidateQueries({ queryKey: ['posts-infinite'], refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' });
    // Marca cache como sujo para forçar re-render no feed sem sumir com posts atuais
    useFeedCacheStore.getState().setPosts(useFeedCacheStore.getState().posts || [], user.id);
  }, [feedIdentityReady, user?.id, queryClient, addDebugLog]);

  // ============================================================
  // Fallback de aba oculta: se o usuário deixou a aba aberta por
  // horas/dias (laptop dormindo), o WebSocket pode ter caído sem
  // reconectar. Ao voltar à aba após ≥5 min hidden, força refetch.
  // ============================================================
  useEffect(() => {
    if (!feedIdentityReady) return;
    let hiddenSince: number | null = null;
    const onVis = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        hiddenSince = Date.now();
      } else if (hiddenSince && Date.now() - hiddenSince > 5 * 60_000) {
        hiddenSince = null;
        // COALESCÊNCIA: ignora se atualizado nos últimos 5 min.
        const now = Date.now();
        const lastRefetch = (window as any)._OCULTO_LAST_REFETCH || 0;
        if (now - lastRefetch < 300000) {
          addDebugLog('stale', 'Ignorando visibilidade refetch (dados recentes)');
          return;
        }
        (window as any)._OCULTO_LAST_REFETCH = now;
        addDebugLog('query', 'Refetch por retorno de visibilidade');
        queryClient.invalidateQueries({ queryKey: ['posts-infinite'], refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [feedIdentityReady, queryClient, addDebugLog]);

  // Realtime local do infinite feed: só aplica DELETE no cache.
  // INSERT/UPDATE já são tratados por `usePostsRealtime` no RealFeed; duplicar
  // invalidate aqui criava refetch em cascata no mobile, fazendo o feed piscar.
  useEffect(() => {
    let isMounted = true;


    // DELETE instantâneo via cache patch — sem esperar refetch.
    const patchDelete = (deletedId: string) => {
      if (!isMounted) return;
      queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            posts: (page.posts || []).filter((p: any) => p.id !== deletedId),
          })),
        };
      });
      queryClient.setQueriesData({ queryKey: ['posts'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((p: any) => p.id !== deletedId);
      });
    };

    // Canal único compartilhado via realtimeBus.
    const unsub = subscribeTable('posts', (payload: any) => {
      const evt = payload?.eventType;
      if (evt === 'DELETE') {
        const id = payload?.old?.id;
        if (id) patchDelete(id);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [queryClient]);

  // ============================================================
  // Head-poll de novidades (fallback do realtime).
  // Sondagem leve do `created_at` mais recente a cada 60s. Garante
  // que novos posts apareçam mesmo se a publication `supabase_realtime`
  // estiver degradada/vazia (sem precisar recarregar a página).
  // ============================================================
  useEffect(() => {
    if (!feedIdentityReady) return;
    let isMounted = true;
    let lastSeen: string | null = null;
    let inflight = false;

    const probe = async () => {
      if (!isMounted || inflight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inflight = true;
      try {
        const { data, error } = await supabase
          .from(FEED_TABLE_NAME as any)
          .select('id, created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data || !isMounted) return;
        const stamp = (data as any).created_at as string | undefined;
        if (!stamp) return;
        if (lastSeen === null) { lastSeen = stamp; return; }
        if (stamp > lastSeen) {
          lastSeen = stamp;
          queryClient.invalidateQueries({ queryKey: ['posts-infinite'], refetchType: 'active' });
          queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' });
          useFeedCacheStore.getState().setPosts(useFeedCacheStore.getState().posts || [], user?.id || null);
        }
      } catch { /* noop */ } finally {
        inflight = false;
      }
    };

    probe();
    // Safety-net leve (60s): o Realtime cobre INSERT/DELETE em tempo real;
    // este probe só existe para o caso raro da publication `supabase_realtime`
    // estar degradada. Além disso, o listener `visibilitychange`/`focus`
    // abaixo já dispara probe imediato ao voltar de background.
    const timer = setInterval(probe, 60_000);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') probe();
    };
    const onFocus = () => probe();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('pageshow', onFocus);
      window.addEventListener('online', onFocus);
    }

    return () => {
      isMounted = false;
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pageshow', onFocus);
        window.removeEventListener('online', onFocus);
      }
    };
  }, [queryClient, feedIdentityReady]);

  return query;
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isSimulatingAsBannedUser } = useShadowbanInterceptor();
  const { triggerTranscode } = useVideoTranscoding();

  return useMutation({
    mutationFn: async (post: {
      content_text?: string;
      media_url?: string;
      media_urls?: string[];
      media_type?: 'image' | 'video';
      video_duration_seconds?: number;
      privacy_level?: 'public' | 'friends' | 'vip';
      is_locked?: boolean;
      is_flash?: boolean;
      thumbnail_url?: string;
      preview_url?: string;
      media_storage_path?: string;
      media_bucket?: string;
      is_paid?: boolean;
      paid_price?: number;
      preview_blur?: string;
      is_adult?: boolean;
      style_meta?: Record<string, any> | null;
      link_preview_image_url?: string | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      if (isSimulatingAsBannedUser) {
        logger.log('[Shadowban Sim] Post creation intercepted - not persisted');
        await new Promise(resolve => setTimeout(resolve, 300));
        return { id: 'simulated-post-id', ...post };
      }

      // IDs canônicos: author_id -> profiles.id, creator_id -> auth.uid.
      const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user.id);

      const insertData: any = {
        author_id: authorProfileId,
        creator_id: creatorId,
        content_text: post.content_text,
        media_url: post.media_url,
        media_urls: Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls : null,
        media_type: post.media_type || null,
        video_duration_seconds: post.video_duration_seconds || null,
        privacy_level: post.privacy_level || 'public',
        is_locked: post.is_locked || false,
        is_flash: post.is_flash || false,
        thumbnail_url: post.thumbnail_url || null,
        preview_url: post.preview_url || null,
        media_storage_path: post.media_storage_path || null,
        media_bucket: post.media_bucket || 'post-media',
        is_paid: post.is_paid || false,
        paid_price: post.paid_price || null,
        preview_blur: post.preview_blur || null,
        is_adult: post.is_adult === true,
        style_meta: post.style_meta && Object.keys(post.style_meta).length > 0 ? post.style_meta : null,
        link_preview_image_url: post.link_preview_image_url || null,
      };

      if (post.media_type === 'video' && post.media_url) {
        insertData.video_processing_status = 'processing';
        insertData.video_master_url = post.media_url;
        insertData.video_preview_url = post.media_url;
      }

      const { data, error } = await supabase
        .from('posts' as any)
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      if (post.media_type === 'video' && post.media_url && data) {
        triggerTranscode((data as any).id, post.media_url).catch(err => {
          console.error('[useCreatePost] Transcode trigger failed:', err);
        });
      }

      return data;
    },
    onSuccess: (created: any, variables) => {
      // Prepend otimista: o autor vê o post no topo do feed na mesma hora,
      // sem esperar o refetch (sem delay perceptível).
      if (created?.id) {
        queryClient.setQueriesData({
          predicate: (query) => {
            const key = query.queryKey as any[];
            if (!Array.isArray(key) || key[0] !== 'posts-infinite') return false;
            const queryAdultOnly = key[key.length - 1] === true;
            return !queryAdultOnly || variables.is_adult === true;
          },
        }, (old: any) => {
          if (!old?.pages?.length) return old;
          const firstPage = old.pages[0];
          
          const postWithAuthor = {
            ...created,
            author: profile || undefined
          };

          // Estrutura padrão: { posts: Post[], nextOffset: number|null }
          if (firstPage && Array.isArray(firstPage.posts)) {
            const alreadyThere = firstPage.posts.some((p: any) => p?.id === created.id);
            if (alreadyThere) return old;
            return {
              ...old,
              pages: [
                { ...firstPage, posts: [postWithAuthor, ...firstPage.posts] },
                ...old.pages.slice(1),
              ],
            };
          }
          // Fallback: páginas como array direto
          if (Array.isArray(firstPage)) {
            const alreadyThere = firstPage.some((p: any) => p?.id === created.id);
            if (alreadyThere) return old;
            return { ...old, pages: [[postWithAuthor, ...firstPage], ...old.pages.slice(1)] };
          }
          return old;
        });
      }
      queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['my-posts'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'], refetchType: 'active' });
      if (variables.is_flash) {
        queryClient.invalidateQueries({ queryKey: ['flash-stories'], refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: ['my-flash-stories'], refetchType: 'active' });
      }
    },
  });
}

export function useUpdatePost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      content_text?: string | null;
      media_url?: string | null;
      media_type?: 'image' | 'video' | null;
      video_duration_seconds?: number | null;
      privacy_level?: 'public' | 'friends' | 'vip';
      is_locked?: boolean;
      thumbnail_url?: string | null;
      preview_url?: string | null;
      media_storage_path?: string | null;
      media_bucket?: string | null;
      is_paid?: boolean;
      paid_price?: number | null;
      preview_blur?: string | null;
      is_adult?: boolean | null;
      style_meta?: Record<string, any> | null;
      link_preview_image_url?: string | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { id, ...rest } = input;
      const updateData: any = {};
      Object.entries(rest).forEach(([k, v]) => {
        if (v !== undefined) updateData[k] = v;
      });
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('posts' as any)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (updated: any) => {
      // Atualização otimista no cache infinito do feed para refletir em tempo real
      if (updated?.id) {
        queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) =>
              Array.isArray(page)
                ? page.map((p: any) => (p.id === updated.id ? { ...p, ...updated } : p))
                : page,
            ),
          };
        });
        queryClient.setQueriesData({ queryKey: ['posts'] }, (old: any) => {
          if (!old) return old;
          if (Array.isArray(old)) {
            return old.map((p: any) => (p.id === updated.id ? { ...p, ...updated } : p));
          }
          return old;
        });
      }
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.refetchQueries({ queryKey: ['posts'], type: 'active' });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      queryClient.refetchQueries({ queryKey: ['posts-infinite'], type: 'active' });
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
    },
  });
}

export function useLikePost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const actorId = await resolveActorId(profile?.id);
      if (!actorId) throw new Error('Profile not found');

      if (isLiked) {
        const { error } = await supabase
          .from('post_likes' as any)
          .delete()
          .eq('post_id', postId)
          .eq('user_id', actorId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('post_likes' as any)
          .insert({ post_id: postId, user_id: actorId });
        if (error) throw error;

        try {
          const recipient = await resolveNotificationRecipient(postId);
          if (recipient && recipient.authUserId !== user.id && recipient.profileId !== actorId) {
            const displayName = profile?.username || profile?.name || 'Alguém';
            await supabase.from('notifications' as any).insert({
              user_id: recipient.authUserId,
              type: 'like',
              title: `@${displayName} curtiu sua publicação`,
              body: null,
              data: { actor_id: actorId, actor_user_id: user.id, post_id: postId },
            });
          }
        } catch {}
      }
    },
    onMutate: async ({ postId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['posts-infinite'] });
      const previousPosts = queryClient.getQueriesData({ queryKey: ['posts'] });
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['posts-infinite'] });
      const updater = (old: any) => {
        const apply = (p: any) => p.id === postId ? {
          ...p,
          is_liked: !isLiked,
          likes_count: isLiked ? Math.max(0, (p.likes_count||0)-1) : (p.likes_count||0)+1,
        } : p;
        if (!old) return old;
        if (old.pages) return { ...old, pages: old.pages.map((page: any) => {
          const items = Array.isArray(page?.posts) ? page.posts : Array.isArray(page) ? page : null;
          if (!items) return page;
          const next = items.map(apply);
          return Array.isArray(page) ? next : { ...page, posts: next };
        }) };
        if (Array.isArray(old)) return old.map(apply);
        return old;
      };
      queryClient.setQueriesData({ queryKey: ['posts'] }, updater);
      queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, updater);
      queryClient.setQueriesData({ queryKey: ['creator-posts'] }, updater);
      return { previousPosts, previousInfinite };
    },
    onError: (_e, _v, ctx: any) => {
      ctx?.previousPosts?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
      ctx?.previousInfinite?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
    },
  });
}

export function useSavePost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: async ({ postId, isSaved }: { postId: string; isSaved: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const actorId = await resolveActorId(profile?.id);
      if (!actorId) throw new Error('Profile not found');

      if (isSaved) {
        const { error } = await supabase
          .from('saved_posts' as any)
          .delete()
          .eq('post_id', postId)
          .eq('user_id', actorId);
        if (error) throw error;
        return { action: 'unsaved' as const };
      } else {
        // Idempotente: se já existir (race), trata como sucesso
        const { data: existing } = await supabase
          .from('saved_posts' as any)
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', actorId)
          .maybeSingle();
        if (existing) return { action: 'saved' as const };

        // .select() força PostgREST a retornar a linha — se RLS bloquear o
        // INSERT, o erro vem agora (em vez de silenciosamente "ok").
        const { data: inserted, error } = await supabase
          .from('saved_posts' as any)
          .insert({ post_id: postId, user_id: actorId })
          .select('id')
          .maybeSingle();
        if (error && (error as any).code !== '23505') {
          console.error('[useSavePost] INSERT bloqueado', { error, actorId, postId });
          throw error;
        }
        if (!inserted && (!error || (error as any).code !== '23505')) {
          // RLS/Policy silenciosamente descartou a linha
          throw new Error('Não foi possível salvar (verifique permissões do banco em saved_posts).');
        }
        // Notificação para o autor é gerada por trigger (trg_notify_on_post_save)
        return { action: 'saved' as const };
      }

    },
    // Optimistic UI: atualiza estado is_saved + saves_count imediatamente
    onMutate: async ({ postId, isSaved }) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['creator-posts'] });
      const previousPosts = queryClient.getQueryData(['posts']);
      const previousCreatorPosts = queryClient.getQueryData(['creator-posts']);

      const updateCache = (old: any) => {
        if (!old) return old;
        const update = (p: any) =>
          p.id === postId
            ? {
                ...p,
                is_saved: !isSaved,
                saves_count: isSaved
                  ? Math.max(0, (p.saves_count || 0) - 1)
                  : (p.saves_count || 0) + 1,
              }
            : p;
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page: any) => {
              const items = Array.isArray(page?.posts) ? page.posts : Array.isArray(page) ? page : null;
              if (!items) return page;
              const next = items.map(update);
              return Array.isArray(page) ? next : { ...page, posts: next };
            }),
          };
        }
        if (Array.isArray(old)) return old.map(update);
        return old;
      };

      queryClient.setQueriesData({ queryKey: ['posts'] }, updateCache);
      queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, updateCache);
      queryClient.setQueriesData({ queryKey: ['creator-posts'] }, updateCache);
      return { previousPosts, previousCreatorPosts };
    },
    onError: (err: any, vars, context) => {
      if (context?.previousPosts) queryClient.setQueryData(['posts'], context.previousPosts);
      if (context?.previousCreatorPosts) queryClient.setQueryData(['creator-posts'], context.previousCreatorPosts);

      const rawMsg = err?.message || err?.error_description || err?.hint || '';
      const code = err?.code || err?.status || '';
      const msg = String(rawMsg).toLowerCase();
      const wasSaving = !vars?.isSaved;
      const action = wasSaving ? 'salvar' : 'remover dos salvos';

      console.error('[useSavePost] Falha ao', action, { error: err, code, message: rawMsg });

      if (msg.includes('not authenticated')) {
        toast.error('Você precisa estar logado', {
          description: 'Faça login novamente para salvar publicações.',
        });
      } else if (msg.includes('profile not found')) {
        toast.error('Perfil não encontrado', {
          description: 'Não foi possível identificar seu perfil. Recarregue a página e tente novamente.',
        });
      } else if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network')) {
        toast.error('Sem conexão', {
          description: 'Verifique sua internet e tente novamente.',
        });
      } else if (code === '42501' || msg.includes('row-level security') || msg.includes('permission')) {
        toast.error('Sem permissão', {
          description: 'Você não tem permissão para salvar este post.',
        });
      } else {
        const detail = rawMsg
          ? `${rawMsg}${code ? ` (código: ${code})` : ''}`
          : `Não foi possível ${action} este post. Tente novamente.`;
        toast.error(`Erro ao ${action}`, { description: detail });
      }
    },
    onSuccess: (result) => {
      if (result?.action === 'saved') {
        void import('@/lib/auraQuests').then(({ progressAuraQuest }) =>
          progressAuraQuest('save_post', 1, { bypassLock: true, reason: 'post salvo' })
        ).catch(() => {});
        toast.success('Post salvo com sucesso', {
          description: 'Você pode revê-lo a qualquer momento na seção "Salvos".',
        });
      } else {
        toast.success('Removido dos salvos', {
          description: 'O post foi retirado da sua lista de salvos.',
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
      queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
    },
  });
}

export function useSavedPosts() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['saved-posts', user?.id, profile?.id],
    retry: false,
    queryFn: async () => {
      if (!user?.id || !profile?.id) return [];
      const actorId = profile.id;

      const { data: savedData, error: savedError } = await supabase
        .from('saved_posts' as any)
        .select('post_id')
        .eq('user_id', actorId)
        .order('created_at', { ascending: false });

      if (savedError || !savedData) return [];

      const postIds = (savedData as any[]).map(s => s.post_id);
      if (postIds.length === 0) return [];

      const { data: posts, error: postsError } = await supabase
        .from('v_feed_posts' as any)
        .select(POST_COLUMNS)
        .in('id', postIds);

      if (postsError || !posts) return [];

      // Fetch authors
      const authorIds = [...new Set((posts as any[]).map(getPostAuthorId).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('id', authorIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return (posts as any[])
        .filter((post: any) => post?.is_hidden !== true && post?.privacy_level !== 'hidden')
        .map(post => ({
          ...post,
          user_id: getPostAuthorId(post),
          author: profileMap.get(getPostAuthorId(post)),
          is_saved: true,
        })) as Post[];
    },
    enabled: !!user?.id,
  });

  // Realtime: qualquer INSERT/DELETE em saved_posts do usuário atual
  // invalida a lista para refletir imediatamente no menu lateral.
  useEffect(() => {
    if (!profile?.id) return;
    const unsub = subscribeTable('saved_posts', (payload: any) => {
      const row = (payload?.new ?? payload?.old) as any;
      if (!row) {
        queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
        return;
      }
      if (row.user_id === profile.id) {
        queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      }
    });
    return () => { try { unsub?.(); } catch { /* noop */ } };
  }, [profile?.id, queryClient]);

  return query;
}


// Hook para excluir postagem com remoção de mídia do storage
export function useDeletePost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: Pick<Post, 'id' | 'media_url'> & { video_master_url?: string | null }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // 1. Deletar mídia do storage (se existir)
      const mediaUrls = [post.media_url, post.video_master_url].filter(Boolean) as string[];
      for (const url of mediaUrls) {
        try {
          // Extrair bucket e path da URL do Supabase Storage
          const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
          if (match) {
            const [, bucket, path] = match;
            await supabase.storage.from(bucket).remove([decodeURIComponent(path)]);
          }
        } catch {
          // Ignorar erros de storage — não bloquear a exclusão do post
        }
      }

      // 2. Deletar o post do banco. Usamos .select() para detectar quando o RLS
      // silenciosamente bloqueia o DELETE (0 linhas afetadas, sem erro).
      const { data: deletedRows, error } = await supabase
        .from('posts' as any)
        .delete()
        .eq('id', post.id)
        .select('id');

      if (error) throw error;
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error('Permissão negada para remover esta publicação.');
      }
    },
    // Optimistic: remove da lista antes da resposta do servidor
    onMutate: async (post) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['misterios-destaque'] });
      const previous = queryClient.getQueryData(['posts']);
      const removeFn = (old: any) => {
        if (Array.isArray(old)) return old.filter((p: any) => p?.id !== post.id);
        return old;
      };
      queryClient.setQueriesData({ queryKey: ['posts'] }, removeFn);
      queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, removeFn);
      queryClient.setQueriesData({ queryKey: ['creator-posts'] }, removeFn);
      queryClient.setQueriesData({ queryKey: ['misterios-destaque'] }, removeFn);

      // Limpa cache localStorage da seção Mistérios em Destaque, que persiste
      // por 24h e faria a foto excluída reaparecer após reload.
      try {
        if (typeof window !== 'undefined') {
          const prefix = 'oculto:misterios-destaque:v1:';
          for (let i = window.localStorage.length - 1; i >= 0; i--) {
            const k = window.localStorage.key(i);
            if (!k || !k.startsWith(prefix)) continue;
            try {
              const raw = window.localStorage.getItem(k);
              if (!raw) continue;
              const parsed = JSON.parse(raw);
              if (parsed && Array.isArray(parsed.data)) {
                parsed.data = parsed.data.filter((p: any) => p?.id !== post.id);
                window.localStorage.setItem(k, JSON.stringify(parsed));
              }
            } catch { /* noop */ }
          }
        }
      } catch { /* noop */ }

      return { previous };
    },
    onError: (_err, _post, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['posts'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
      queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
      queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
      queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
      queryClient.invalidateQueries({ queryKey: ['misterios-destaque'] });
    },
  });
}
