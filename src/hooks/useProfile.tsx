import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabasePublic } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import {
  loadProfileImages,
  saveProfileImages,
  invalidateProfileImages,
  warmupProfileImages,
} from '@/lib/profileImageCache';

export interface NotificationPreferences {
  likes: boolean;
  follows: boolean;
  messages: boolean;
  subscriptions: boolean;
  visits: boolean;
  story_replies: boolean;
  unlocks: boolean;
  push_enabled: boolean;
}

export interface Profile {
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
  is_creator: boolean;
  is_verified: boolean;
  is_oculto_verified: boolean;
  is_verified_couple: boolean;
  is_online: boolean;
  is_looking_now: boolean;
  looking_now_since: string | null;
  last_seen: string | null;
  profile_type: string;
  balance: number;
  location_lat: number | null;
  location_lng: number | null;
  plan_type: string;
  partner1_name: string | null;
  partner2_name: string | null;
  partner1_doc_verified: boolean;
  partner2_doc_verified: boolean;
  partner1_selfie_verified: boolean;
  partner2_selfie_verified: boolean;
  gender: string | null;
  birth_date: string | null;
  partner1_birth_date: string | null;
  partner2_birth_date: string | null;
  notification_preferences: NotificationPreferences | null;
  verification_deadline: string | null;
  verification_reminder_sent: boolean;
  account_status: string | null;
  warning_count: number;
  frozen_until: string | null;
  created_at: string;
  updated_at: string;
  // Campos de privacidade
  show_on_radar: boolean;
  show_online_status: boolean;
  hide_age: boolean;
  hide_location: boolean;
  dm_setting: string;
  two_factor_enabled: boolean;
  // Flag de conta de teste (stealth)
  is_test_account: boolean;
  // Voice bio
  voice_bio_url: string | null;
  voice_bio_duration: number | null;
  cover_image_url: string | null;
  // Tags & Connection
  tags_social: string[];
  tags_adult: string[];
  connection_mode: boolean;
  // VIP computed field
  is_vip: boolean;
  vip_tier: string;
  aura_level: number;
  social_score: number;
  prestige_xp: number;
  document_verified: boolean;
  // WhatsApp promotions opt-in
  whatsapp_promotions_opt_in: boolean;
  // Address fields
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_lat: number | null;
  address_lng: number | null;
  address_verified: boolean;
  // PIX
  pix_key_type: string | null;
  pix_key: string | null;
  // Privacy & interests
  interest_tags: string[];
  show_distance: boolean;
  allow_anonymous_views: boolean;
}

type ProfileRow = Partial<Profile> & Record<string, any>;

const normalizeProfile = (raw: ProfileRow): Profile => {
  const mergedTags = Array.isArray(raw.tags)
    ? raw.tags
    : Array.isArray(raw.tags_social)
      ? raw.tags_social
      : [];

  // Fallback: display_name > name > full_name > email prefix
  const resolvedName = raw.display_name || raw.name || raw.full_name || raw.email?.split('@')[0] || '';

  return {
    ...(raw as Profile),
    id: (raw.id || raw.user_id || '') as string,
    user_id: (raw.user_id || raw.id || '') as string,
    name: resolvedName,
    display_name: raw.display_name || null,
    email: raw.email || null,
    role: raw.role || null,
    username: raw.username || null,
    avatar_url: raw.avatar_url || null,
    banner_url: raw.banner_url || null,
    cover_image_url: raw.cover_image_url || raw.banner_url || null,
    bio: raw.bio || null,
    plan_type: raw.plan_type || 'free',
    profile_type: raw.profile_type || 'single',
    gender: raw.gender || null,
    birth_date: raw.birth_date || null,
    partner1_birth_date: raw.partner1_birth_date || null,
    partner2_birth_date: raw.partner2_birth_date || null,
    balance: raw.balance ?? 0,
    location_lat: raw.location_lat ?? null,
    location_lng: raw.location_lng ?? null,
    tags_social: Array.isArray(raw.tags_social) ? raw.tags_social : mergedTags,
    tags_adult: Array.isArray(raw.tags_adult) ? raw.tags_adult : [],
    is_creator: raw.is_creator ?? false,
    is_verified: raw.is_verified ?? false,
    is_oculto_verified: raw.is_oculto_verified ?? raw.is_verified ?? false,
    is_verified_couple: raw.is_verified_couple ?? false,
    is_online: raw.is_online ?? false,
    is_looking_now: raw.is_looking_now ?? false,
    is_vip: raw.is_vip ?? (raw.plan_type === 'vip'),
    vip_tier: raw.vip_tier || '',
    aura_level: Number(raw.aura_level ?? 0),
    social_score: Number(raw.social_score ?? 0),
    prestige_xp: Number(raw.prestige_xp ?? 0),
    document_verified: raw.document_verified ?? false,
    show_on_radar: raw.show_on_radar ?? true,
    show_online_status: raw.show_online_status ?? true,
    hide_age: raw.hide_age ?? false,
    hide_location: raw.hide_location ?? false,
    dm_setting: raw.dm_setting || 'all',
    two_factor_enabled: raw.two_factor_enabled ?? false,
    is_test_account: raw.is_test_account ?? false,
    connection_mode: raw.connection_mode ?? true,
    warning_count: raw.warning_count ?? 0,
    verification_reminder_sent: raw.verification_reminder_sent ?? false,
    whatsapp_promotions_opt_in: raw.whatsapp_promotions_opt_in ?? false,
    address_verified: raw.address_verified ?? false,
    pix_key_type: raw.pix_key_type || null,
    pix_key: raw.pix_key || null,
    interest_tags: Array.isArray(raw.interest_tags) ? raw.interest_tags : [],
    show_distance: raw.show_distance ?? true,
    allow_anonymous_views: raw.allow_anonymous_views ?? false,
  };
};

const buildUsernameFallback = (email?: string, name?: string) =>
  ((name || email?.split('@')[0] || 'usuario') as string)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'usuario';

const sortProfilesByRecency = (rows: ProfileRow[] = []) =>
  [...rows].sort((a, b) => {
    const aTime = new Date((a.updated_at || a.created_at || 0) as string).getTime();
    const bTime = new Date((b.updated_at || b.created_at || 0) as string).getTime();
    return bTime - aTime;
  });

// Build a fallback profile from auth metadata (no DB needed)
const buildFallbackProfile = (authUser: any): Profile => {
  const metadata = (authUser.user_metadata || {}) as Record<string, any>;
  const fallbackName = (metadata.display_name || metadata.name || metadata.full_name || authUser.email?.split('@')[0] || 'Usuário') as string;
  const isAdmin = authUser.email === 'ocultomaster@ocultoswing.com.br';
  return normalizeProfile({
    id: authUser.id,
    user_id: authUser.id,
    name: fallbackName,
    display_name: metadata.display_name || null,
    email: authUser.email || null,
    role: isAdmin ? 'admin' : metadata.role || null,
    username: metadata.username || buildUsernameFallback(authUser.email, metadata.name),
    avatar_url: metadata.avatar_url || null,
    banner_url: metadata.banner_url || null,
    bio: metadata.bio || null,
    plan_type: isAdmin ? 'vip' : 'free',
    is_vip: isAdmin,
    is_creator: isAdmin,
    is_verified: isAdmin,
    is_oculto_verified: isAdmin,
  });
};

const isAbortError = (err: any) => {
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  const code = String(err?.code || '');
  return name === 'AbortError' || code === '20' || /aborted|signal is aborted/i.test(msg);
};

const tryPublicProfileFallback = async (userId: string): Promise<ProfileRow | null> => {
  try {
    const { data: byUserId, error: byUserIdError } = await (supabasePublic as any)
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (!byUserIdError && byUserId?.[0]) return byUserId[0] as ProfileRow;

    const { data: byId, error: byIdError } = await (supabasePublic as any)
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!byIdError && byId) return byId as ProfileRow;
  } catch {
    // Fallback público é best-effort; se falhar, o fallback local assume.
  }
  return null;
};

export function useProfile() {
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();

  // Hidratação instantânea: avatar/banner em cache local com TTL+versão
  const cachedImages = useMemo(() => loadProfileImages(user?.id), [user?.id]);
  const placeholderProfile = useMemo<Profile | undefined>(() => {
    if (!user?.id) return undefined;
    const metadata = (user.user_metadata || {}) as Record<string, any>;
    const base = buildFallbackProfile(user);
    return {
      ...base,
      // IMPORTANTE: zera id/user_id no placeholder.
      // Em quase todo usuário real `profiles.id !== auth.uid`, então expor o
      // auth.uid como se fosse `profile.id` dispara stats/posts/visitas com
      // chave errada (contadores zerados, posts trocados). Os hooks de stats
      // estão gated por `enabled: !!profileId` — mantemos eles ociosos até o
      // banco devolver o profile real.
      id: '' as any,
      user_id: '' as any,
      username: cachedImages?.username ?? base.username,
      display_name: cachedImages?.display_name ?? base.display_name,
      name: cachedImages?.name ?? cachedImages?.display_name ?? base.name,
      avatar_url: cachedImages?.avatar_url ?? metadata.avatar_url ?? null,
      banner_url: cachedImages?.banner_url ?? null,
      cover_image_url: cachedImages?.cover_image_url ?? cachedImages?.banner_url ?? null,
    } as Profile;
  }, [user, cachedImages]);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['profile', user?.id],
    retry: (failureCount, err: any) => isAbortError(err) && failureCount < 3,
    retryDelay: (attempt) => Math.min(600 * 2 ** attempt, 4000),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? placeholderProfile,
    queryFn: async () => {
      if (!user?.id) return null;

      const { data: profilesByUserId, error: profileByUserIdError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(3); // pega o perfil canônico mais antigo, não duplicata recente

      let data = ((profilesByUserId as ProfileRow[] | null) || [])[0] || null;
      let err = profileByUserIdError;

      if (!data && !err) {
        const { data: profileById, error: profileByIdError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        data = profileById;
        err = profileByIdError;
      }

      // Abort transitório (RQ cancel / unmount): propaga para retry, não polui fallback.
      if (err && isAbortError(err)) {
        throw err;
      }

      // If RLS recursion (42P17) or any DB error, return local fallback instead of throwing
      if (err) {
        const publicData = await tryPublicProfileFallback(user.id);
        if (publicData) {
          const normalizedPublic = normalizeProfile(publicData);
          if (user.email === 'ocultomaster@ocultoswing.com.br') {
            return { ...normalizedPublic, plan_type: 'vip', is_vip: true, is_verified: true, is_oculto_verified: true } as Profile;
          }
          return normalizedPublic;
        }
        console.warn('[Perfil] DB inacessível, usando fallback local:', (err as any).code, err.message);
        return buildFallbackProfile(user);
      }

      if (!data) {
        // Sem linha em profiles → tenta a RPC idempotente `ensure_my_profile`
        // antes de cair no fallback local (que exibe "@usuario" e dados zerados).
        // A RPC cria a linha base se faltar e devolve o id; em seguida refazemos
        // a query para obter o registro real com username, plano, etc.
        try {
          const { error: ensureErr } = await (supabase as any).rpc('ensure_my_profile');
          if (!ensureErr) {
            const { data: reloaded } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();
            if (reloaded) {
              const normalizedNew = normalizeProfile(reloaded as ProfileRow);
              if (user.email === 'ocultomaster@ocultoswing.com.br') {
                return { ...normalizedNew, plan_type: 'vip', is_vip: true, is_verified: true, is_oculto_verified: true } as Profile;
              }
              return normalizedNew;
            }
          }
        } catch { /* segue para o fallback local */ }

        const publicData = await tryPublicProfileFallback(user.id);
        if (publicData) {
          const normalizedPublic = normalizeProfile(publicData);
          if (user.email === 'ocultomaster@ocultoswing.com.br') {
            return { ...normalizedPublic, plan_type: 'vip', is_vip: true, is_verified: true, is_oculto_verified: true } as Profile;
          }
          return normalizedPublic;
        }

        // Após "Atualizar WebApp" (cache zerado + schema cache do PostgREST
        // aquecendo) a 1ª consulta pode retornar `null` mesmo havendo perfil.
        // Mantemos o fallback local (com cache de imagens) e reagendamos.
        console.warn('[Perfil] Sem linha após RPC — usando fallback local e reagendando.');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
        }, 1500);
        const fb = buildFallbackProfile(user);
        const cached = loadProfileImages(user.id);
        if (cached) {
          return {
            ...fb,
            username: cached.username ?? fb.username,
            display_name: cached.display_name ?? fb.display_name,
            name: cached.name ?? cached.display_name ?? fb.name,
            avatar_url: cached.avatar_url ?? fb.avatar_url,
            banner_url: cached.banner_url ?? fb.banner_url,
            cover_image_url: cached.cover_image_url ?? cached.banner_url ?? fb.cover_image_url,
          } as Profile;
        }
        return fb;
      }

      // Cemitério: se o profile foi soft-deleted, encerra a sessão imediatamente
      if ((data as any)?.is_deleted === true) {
        try {
          await supabase.auth.signOut();
        } catch (e) { console.warn('[Perfil] signOut after soft-delete falhou:', e); }
        if (typeof window !== 'undefined') {
          window.location.replace('/?account=deleted');
        }
        return null;
      }

      const normalized = normalizeProfile(data as ProfileRow);
      if (user.email === 'ocultomaster@ocultoswing.com.br') {
        return { ...normalized, plan_type: 'vip', is_vip: true, is_verified: true, is_oculto_verified: true } as Profile;
      }
      return normalized;
    },
    enabled: !!user?.id && authReady,
  });

  // Persiste URLs de imagem no cache + pré-aquece o cache HTTP do browser.
  // Nunca sobrescreve uma URL válida em cache com `null` (evita que um
  // fetch parcial pós-update apague avatar/banner do cache local).
  useEffect(() => {
    if (!user?.id || !profile) return;
    const prev = loadProfileImages(user.id);
    saveProfileImages(user.id, {
      avatar_url: profile.avatar_url ?? prev?.avatar_url ?? null,
      banner_url: profile.banner_url ?? prev?.banner_url ?? null,
      cover_image_url: profile.cover_image_url ?? prev?.cover_image_url ?? null,
      // ⬇️ Persiste identidade no cache local (hidratação instantânea no próximo load)
      username: profile.username ?? prev?.username ?? null,
      display_name: profile.display_name ?? prev?.display_name ?? null,
      name: profile.name ?? prev?.name ?? null,
    });
    warmupProfileImages([profile.avatar_url, profile.banner_url, profile.cover_image_url]);
  }, [user?.id, profile?.avatar_url, profile?.banner_url, profile?.cover_image_url, profile?.username, profile?.display_name, profile?.name]);


  // Realtime: auto-refresh when webhook updates plan_type/payment_status
  useEffect(() => {
    if (!profile?.id) return;
    const unsub = subscribeTable('profiles', (payload: any) => {
      if (payload?.new?.id !== profile.id) return;
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    }, { events: ['UPDATE'] });
    return unsub;
  }, [profile?.id, user?.id, queryClient]);

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const normalizedUpdates: any = { ...updates };
      if (normalizedUpdates.cover_image_url && !normalizedUpdates.banner_url) normalizedUpdates.banner_url = normalizedUpdates.cover_image_url;
      if (Array.isArray(normalizedUpdates.tags_social) && !normalizedUpdates.tags) normalizedUpdates.tags = normalizedUpdates.tags_social;

      const profileId = profile?.id || user.id;
      const { data, error } = await supabase.from('profiles').update(normalizedUpdates).eq('id', profileId).select().maybeSingle();
      
      if (error) throw error;
      return data;
    },
    // Optimistic UI: update cache instantly before server responds
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['profile', user?.id] });
      const previous = queryClient.getQueryData(['profile', user?.id]);
      queryClient.setQueryData(['profile', user?.id], (old: Profile | null) =>
        old ? { ...old, ...updates } : old
      );
      // Se troca avatar/banner, invalida o cache local para refletir a nova URL
      if (
        Object.prototype.hasOwnProperty.call(updates, 'avatar_url') ||
        Object.prototype.hasOwnProperty.call(updates, 'banner_url') ||
        Object.prototype.hasOwnProperty.call(updates, 'cover_image_url')
      ) {
        invalidateProfileImages(user?.id);
      }
      return { previous };
    },
    onError: (_err, _updates, context) => {
      // Rollback on failure — form state preserved, no white screen
      if (context?.previous) {
        queryClient.setQueryData(['profile', user?.id], context.previous);
      }
      toast.error('Falha ao salvar. Tente novamente.');
    },
    onSettled: () => {
      // Invalidar TODOS os caches que dependem de dados do perfil
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
      queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
      queryClient.invalidateQueries({ queryKey: ['creator-profile'] });
      queryClient.invalidateQueries({ queryKey: ['story-creators'] });
    },
  });

  return {
    profile,
    isLoading,
    error,
    updateProfile: updateProfile.mutate,
    isUpdating: updateProfile.isPending,
  };
}

export function useProfileById(profileId: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'by-id', profileId],
    retry: false,
    queryFn: async () => {
      if (!profileId) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();
      
      if (error) {
        console.warn('[ProfileById] DB error, returning null:', error.code);
        return null;
      }
      return data ? normalizeProfile(data as ProfileRow) : null;
    },
    enabled: !!profileId,
  });
}

export function useCreators() {
  return useQuery({
    queryKey: ['creators'],
    retry: false,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*');
      
      if (error) {
        console.warn('[Creators] DB error, returning empty:', error.code);
        return [];
      }
      
      const creators = (data as any[] || []).filter((p: any) => p.is_creator === true);
      return creators as Profile[];
    },
  });
}
