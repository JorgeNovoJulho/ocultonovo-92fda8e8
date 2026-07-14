import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { normalizePlanType } from '@/lib/planType';
import { geocodeCity, haversineKm } from '@/lib/cityGeocode';
// triggerPush removido — push agora é tratado em useDiscoveryActions (Explorar misteriosos)

/** Calcula distância em km tentando GPS direto e, em fallback, geocodificando cidades. */
async function computeDistanceKm(
  viewerLat: number | null,
  viewerLng: number | null,
  viewerCity: string | null | undefined,
  targetLat: number | null | undefined,
  targetLng: number | null | undefined,
  targetCity: string | null | undefined,
): Promise<number | null> {
  // Caso 1: ambos têm GPS preciso
  if (viewerLat && viewerLng && targetLat && targetLng) {
    return haversineKm(viewerLat, viewerLng, targetLat, targetLng);
  }
  // Caso 2: viewer com GPS, alvo só com cidade → geocoda alvo
  if (viewerLat && viewerLng && targetCity) {
    const c = await geocodeCity(targetCity);
    if (c) return haversineKm(viewerLat, viewerLng, c.lat, c.lng);
  }
  // Caso 3: viewer só com cidade, alvo com GPS → geocoda viewer
  if (viewerCity && targetLat && targetLng) {
    const c = await geocodeCity(viewerCity);
    if (c) return haversineKm(c.lat, c.lng, targetLat, targetLng);
  }
  // Caso 4: ambos só com cidade → geocoda os dois (cache evita custo)
  if (viewerCity && targetCity) {
    const [a, b] = await Promise.all([geocodeCity(viewerCity), geocodeCity(targetCity)]);
    if (a && b) return haversineKm(a.lat, a.lng, b.lat, b.lng);
  }
  return null;
}


const PREFETCH_THRESHOLD = 3;
const PERFECT_PAIR_CACHE_TTL_MS = 45_000;
const MATCHED_PROFILE_IDS_CACHE_TTL_MS = 30_000;

type PerfectPairSessionCacheEntry = {
  cards: PairCard[];
  debug: PerfectPairDebugState;
  viewerCardStatus: ViewerCardStatus;
  cachedAt: number;
};

const perfectPairSessionCache = new Map<string, PerfectPairSessionCacheEntry>();
const profileIdCache = new Map<string, string>();
const profileIdInflight = new Map<string, Promise<string | null>>();
const matchedProfileIdsCache = new Map<string, { ids: string[]; cachedAt: number }>();
const matchedProfileIdsInflight = new Map<string, Promise<string[]>>();

function getPerfectPairSessionCache(userId: string) {
  const cached = perfectPairSessionCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > PERFECT_PAIR_CACHE_TTL_MS) return null;
  return cached;
}

function getFreshMatchedProfileIds(profileId: string) {
  const cached = matchedProfileIdsCache.get(profileId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > MATCHED_PROFILE_IDS_CACHE_TTL_MS) return null;
  return cached.ids;
}

export interface PairCard {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  bio: string | null;
  plan_type: string;
  tags_social: string[] | null;
  tags_adult: string[] | null;
  pair_photos: string[] | null;
  is_boosted?: boolean;
  shared_tags?: string[] | null;
  shared_tags_count?: number;
  pair_bio: string | null;
  age: number | null;
  distance_km: number | null;
  city: string | null;
  profile_type?: string | null;
  gender?: string | null;
}

export interface PairMatch {
  pairUserId: string;
  pairUserAuthId?: string;
  userName: string;
  pairUserAvatar?: string | null;
  conversationId?: string | null;
}

export interface PairMatchRecord {
  id: string;
  profileId: string;
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  matchedAt: string;
}

type PairSettingsRow = {
  user_id: string;
  min_age?: number | null;
  max_age?: number | null;
  max_distance_km?: number | null;
  interested_in?: string[] | null;
  show_only_verified?: boolean | null;
  match_photos: string[] | null;
};

export type PerfectPairDebugState = {
  authUserId: string | null;
  profileId: string | null;
  profileResolved: boolean;
  viewerConfigured: boolean;
  viewerReason: string | null;
  viewerSettingsLookupIds: string[];
  viewerSettingsResolvedBy: string | null;
  minAge: number | null;
  maxAge: number | null;
  maxDistanceKm: number | null;
  interestedIn: string[];
  showOnlyVerified: boolean;
  source: 'rpc' | 'fallback' | 'none';
  rpcNameTried: string | null;
  fetchError: string | null;
  excludedCount: number;
  rawCount: number;
  hiddenCount: number;
  settingsRowsFound: number;
  mediaLessCount: number;
  finalCount: number;
  finalIds: string[];
};

type ViewerCardStatus = {
  configured: boolean;
  reason: string | null;
};

type UsePerfectPairOptions = {
  mode?: 'full' | 'light';
  skipInitialMatchedFetch?: boolean;
};

const INITIAL_DEBUG_STATE: PerfectPairDebugState = {
  authUserId: null,
  profileId: null,
  profileResolved: false,
  viewerConfigured: false,
  viewerReason: null,
  viewerSettingsLookupIds: [],
  viewerSettingsResolvedBy: null,
  minAge: null,
  maxAge: null,
  maxDistanceKm: null,
  interestedIn: [],
  showOnlyVerified: false,
  source: 'none',
  rpcNameTried: null,
  fetchError: null,
  excludedCount: 0,
  rawCount: 0,
  hiddenCount: 0,
  settingsRowsFound: 0,
  mediaLessCount: 0,
  finalCount: 0,
  finalIds: [],
};

function mergePairPhotos(
  profilePairPhotos: string[] | null | undefined,
  settingsMatchPhotos: string[] | null | undefined,
) {
  const merged = [
    ...(Array.isArray(settingsMatchPhotos) ? settingsMatchPhotos : []),
    ...(Array.isArray(profilePairPhotos) ? profilePairPhotos : []),
  ].filter(Boolean);

  return merged.length > 0 ? Array.from(new Set(merged)) : null;
}

function getViewerCardStatus(
  profile: { pair_photos?: string[] | null; avatar_url?: string | null } | null | undefined,
  settings: PairSettingsRow | null | undefined,
): ViewerCardStatus {
  const mergedPhotos = mergePairPhotos(profile?.pair_photos, settings?.match_photos);

  // Para começar a navegar basta ter QUALQUER imagem visível: foto do Perfect Pair OU avatar.
  // Isso permite que usuários novos (ex.: só com avatar) vejam cards imediatamente, enquanto
  // sugerimos no UI que adicionem fotos do Perfect Pair para um card mais atrativo.
  if ((mergedPhotos?.length || 0) > 0 || !!profile?.avatar_url) {
    return { configured: true, reason: null };
  }

  return {
    configured: false,
    reason: 'Adicione pelo menos 1 foto (avatar ou foto do Perfect Pair) para começar a receber perfis.',
  };
}

async function getPairSettingsMap(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return new Map<string, PairSettingsRow>();

  const { data, error } = await (supabase as any)
    .from('pair_settings')
    .select('user_id, min_age, max_age, max_distance_km, interested_in, show_only_verified, match_photos')
    .in('user_id', uniqueUserIds);

  if (error || !data) return new Map<string, PairSettingsRow>();

  return new Map<string, PairSettingsRow>(
    (data as PairSettingsRow[]).map((row) => [row.user_id, row])
  );
}

function resolvePairSettings(
  settingsMap: Map<string, PairSettingsRow>,
  ...candidateIds: Array<string | null | undefined>
) {
  for (const candidateId of candidateIds) {
    if (!candidateId) continue;
    const settings = settingsMap.get(candidateId);
    if (settings) return settings;
  }

  return null;
}

function countCardsWithoutMedia(cards: PairCard[]) {
  return cards.filter((card) => (card.pair_photos?.length || 0) === 0 && !card.avatar_url).length;
}

async function runPerfectPairRpc(params: {
  p_user_id: string;
  p_limit: number;
  p_viewer_lat?: number;
  p_viewer_lng?: number;
}) {
  const rpcNames = ['get_perfect_pairs', 'get_perfect_pair_candidates'];
  let lastError: any = null;
  let lastRpcName: string | null = null;

  for (const rpcName of rpcNames) {
    lastRpcName = rpcName;
    const { data, error } = await (supabase.rpc as any)(rpcName, params);
    if (!error) {
      return { data: data ?? [], error: null, rpcName };
    }
    lastError = error;

    const shouldTryNext = error?.code === 'PGRST202' || String(error?.message || '').includes('schema cache');
    if (!shouldTryNext) {
      break;
    }
  }

  return { data: null, error: lastError, rpcName: lastRpcName };
}

/** Get browser geolocation coordinates */
function getBrowserLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000, enableHighAccuracy: false }
    );
  });
}

async function ensureConversation(
  userAuthId: string,
  targetAuthId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_conversation', {
      p_user1_id: userAuthId,
      p_user2_id: targetAuthId,
    });
    if (!error && data) return data as string;
  } catch {}

  try {
    const { data: existing } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userAuthId)
      .limit(50);

    if (existing && existing.length > 0) {
      const convIds = existing.map((r: any) => r.conversation_id);
      const { data: mutual } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', targetAuthId)
        .in('conversation_id', convIds)
        .limit(1);
      if (mutual && mutual.length > 0) return mutual[0].conversation_id;
    }

    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({ created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select('id')
      .single();
    if (convErr || !conv) return null;

    await supabase.from('conversation_participants').insert([
      { conversation_id: conv.id, user_id: userAuthId },
      { conversation_id: conv.id, user_id: targetAuthId },
    ]);
    return conv.id;
  } catch {
    return null;
  }
}

let perfectPairActionsAvailable: boolean | null = null;

function isMissingPerfectPairActionsTable(error: any) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST205' || message.includes("public.perfect_pair_actions");
}

type StoredPairAction = {
  target_id: string;
  action_type: string;
  updated_at: string;
};

function dedupeStoredPairActions(rows: StoredPairAction[]) {
  const latestByTarget = new Map<string, StoredPairAction>();

  rows.forEach((row) => {
    const current = latestByTarget.get(row.target_id);
    if (!current || new Date(row.updated_at).getTime() > new Date(current.updated_at).getTime()) {
      latestByTarget.set(row.target_id, row);
    }
  });

  return Array.from(latestByTarget.values());
}

async function canUsePerfectPairActionsTable() {
  if (perfectPairActionsAvailable !== null) return perfectPairActionsAvailable;

  const { error } = await (supabase as any)
    .from('perfect_pair_actions')
    .select('user_id')
    .limit(1);

  if (isMissingPerfectPairActionsTable(error)) {
    perfectPairActionsAvailable = false;
    console.warn('[PerfectPair] tabela perfect_pair_actions indisponível; usando perfect_pairs.');
    return false;
  }

  perfectPairActionsAvailable = true;
  return true;
}

async function getStoredPairActions(profileId: string) {
  const actions: StoredPairAction[] = [];

  const { data: profileLikesData } = await (supabase as any)
    .from('profile_likes')
    .select('receiver_id, created_at')
    .eq('sender_id', profileId);

  if (profileLikesData) {
    actions.push(
      ...profileLikesData.map((row: any) => ({
        target_id: row.receiver_id,
        action_type: 'like',
        updated_at: row.created_at || new Date().toISOString(),
      }))
    );
  }

  if (await canUsePerfectPairActionsTable()) {
    const { data, error } = await (supabase as any)
      .from('perfect_pair_actions')
      .select('target_id, action_type, updated_at')
      .eq('user_id', profileId);

    if (isMissingPerfectPairActionsTable(error)) {
      perfectPairActionsAvailable = false;
    } else if (!error && data) {
      actions.push(...data);
    }
  }

  const { data: legacyData } = await (supabase as any)
    .from('perfect_pairs')
    .select('target_id, action, created_at')
    .eq('user_id', profileId);

  if (legacyData) {
    actions.push(
      ...legacyData.map((row: any) => ({
        target_id: row.target_id,
        action_type: row.action,
        updated_at: row.created_at || new Date().toISOString(),
      }))
    );
  }

  return dedupeStoredPairActions(actions);
}

async function persistPairAction(userId: string, targetId: string, actionType: string) {
  let saved = false;
  let lastError: any = null;

  if (actionType === 'like' || actionType === 'super_like') {
    await (supabase as any)
      .from('profile_likes')
      .delete()
      .eq('sender_id', userId)
      .eq('receiver_id', targetId);

    const { error: profileLikeError } = await (supabase as any)
      .from('profile_likes')
      .insert({ sender_id: userId, receiver_id: targetId });

    if (!profileLikeError) {
      saved = true;
    } else {
      lastError = profileLikeError;
    }
  } else if (actionType === 'dislike') {
    await (supabase as any)
      .from('profile_likes')
      .delete()
      .eq('sender_id', userId)
      .eq('receiver_id', targetId);
    saved = true;
  }

  if (await canUsePerfectPairActionsTable()) {
    const { error } = await (supabase as any)
      .from('perfect_pair_actions')
      .upsert(
        {
          user_id: userId,
          target_id: targetId,
          action_type: actionType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,target_id' }
      );

    if (isMissingPerfectPairActionsTable(error)) {
      perfectPairActionsAvailable = false;
    } else if (!error) {
      saved = true;
    } else {
      lastError = error;
    }
  }

  await (supabase as any)
    .from('perfect_pairs')
    .delete()
    .eq('user_id', userId)
    .eq('target_id', targetId);

  const { error: legacyError } = await (supabase as any)
    .from('perfect_pairs')
    .insert({ user_id: userId, target_id: targetId, action: actionType });

  if (!legacyError) {
    saved = true;
    return { saved, error: null };
  }

  return { saved, error: lastError || legacyError };
}

async function hasMutualPairLike(targetId: string, currentProfileId: string) {
  const { data: profileLikeData } = await (supabase as any)
    .from('profile_likes')
    .select('id')
    .eq('sender_id', targetId)
    .eq('receiver_id', currentProfileId)
    .limit(1)
    .maybeSingle();

  if (profileLikeData) {
    return true;
  }

  if (await canUsePerfectPairActionsTable()) {
    const { data, error } = await (supabase as any)
      .from('perfect_pair_actions')
      .select('action_type')
      .eq('user_id', targetId)
      .eq('target_id', currentProfileId)
      .in('action_type', ['like', 'super_like'])
      .limit(1)
      .maybeSingle();

    if (isMissingPerfectPairActionsTable(error)) {
      perfectPairActionsAvailable = false;
    } else if (!error && data) {
      return true;
    }
  }

  const { data: legacyData } = await (supabase as any)
    .from('perfect_pairs')
    .select('action')
    .eq('user_id', targetId)
    .eq('target_id', currentProfileId)
    .in('action', ['like', 'super_like'])
    .limit(1)
    .maybeSingle();

  return !!legacyData;
}

/**
 * Retorna IDs de perfis que JÁ têm match mútuo confirmado com o usuário atual.
 * Usado para impedir que cards de matches já realizados voltem a aparecer no
 * baralho de "Descobrir" — eles devem ficar apenas na guia "Matches".
 */
export async function getMatchedProfileIds(currentProfileId: string): Promise<string[]> {
  const cached = getFreshMatchedProfileIds(currentProfileId);
  if (cached) return cached;

  const inflight = matchedProfileIdsInflight.get(currentProfileId);
  if (inflight) return inflight;

  const request = (async () => {
  try {
    const [{ data: discoveryMatches }, { data: lookingNowMatches }] = await Promise.all([
      (supabase as any)
        .from('oculto_discovery_likes')
        .select('user_profile_id, target_profile_id')
        .or(`user_profile_id.eq.${currentProfileId},target_profile_id.eq.${currentProfileId}`)
        .eq('status', 'matched')
        .limit(2000),
      (supabase as any)
        .from('looking_now_matches')
        .select('user1_id, user2_id, is_expired')
        .or(`user1_id.eq.${currentProfileId},user2_id.eq.${currentProfileId}`)
        .eq('is_expired', false)
        .limit(2000),
    ]);

    const discoveryMatchedIds = ((discoveryMatches || []) as any[])
      .map((row) => row.user_profile_id === currentProfileId ? row.target_profile_id : row.user_profile_id)
      .filter(Boolean) as string[];

    const lookingNowMatchedIds = ((lookingNowMatches || []) as any[])
      .map((row) => row.user1_id === currentProfileId ? row.user2_id : row.user1_id)
      .filter(Boolean) as string[];

    // 1) Coletar likes que EU dei (likedIds)
    const [mineProfileLikes, mineActions, mineLegacy] = await Promise.all([
      (supabase as any).from('profile_likes').select('receiver_id').eq('sender_id', currentProfileId),
      (supabase as any).from('perfect_pair_actions').select('target_id').eq('user_id', currentProfileId).in('action_type', ['like', 'super_like']),
      (supabase as any).from('perfect_pairs').select('target_id').eq('user_id', currentProfileId).in('action', ['like', 'super_like']),
    ]);
    const likedIds = Array.from(new Set([
      ...((mineProfileLikes.data || []) as any[]).map((r) => r.receiver_id),
      ...((mineActions.data || []) as any[]).map((r) => r.target_id),
      ...((mineLegacy.data || []) as any[]).map((r) => r.target_id),
    ].filter(Boolean) as string[]));
    if (likedIds.length === 0) return Array.from(new Set([...discoveryMatchedIds, ...lookingNowMatchedIds]));

    // 2) Quais desses também me curtiram (mutual)
    const [theirsProfileLikes, theirsActions, theirsLegacy] = await Promise.all([
      (supabase as any).from('profile_likes').select('sender_id').eq('receiver_id', currentProfileId).in('sender_id', likedIds),
      (supabase as any).from('perfect_pair_actions').select('user_id').eq('target_id', currentProfileId).in('action_type', ['like', 'super_like']).in('user_id', likedIds),
      (supabase as any).from('perfect_pairs').select('user_id').eq('target_id', currentProfileId).in('action', ['like', 'super_like']).in('user_id', likedIds),
    ]);
    const ids = Array.from(new Set([
      ...discoveryMatchedIds,
      ...lookingNowMatchedIds,
      ...((theirsProfileLikes.data || []) as any[]).map((r) => r.sender_id),
      ...((theirsActions.data || []) as any[]).map((r) => r.user_id),
      ...((theirsLegacy.data || []) as any[]).map((r) => r.user_id),
    ].filter(Boolean) as string[]));
    matchedProfileIdsCache.set(currentProfileId, { ids, cachedAt: Date.now() });
    return ids;
  } catch (e) {
    console.warn('[PerfectPair] getMatchedProfileIds falhou:', e);
    return [];
  } finally {
    matchedProfileIdsInflight.delete(currentProfileId);
  }
  })();

  matchedProfileIdsInflight.set(currentProfileId, request);
  return request;
}

async function createPerfectPairMatchArtifacts(currentProfileId: string, targetProfileId: string) {
  const [{ data: currentProfile }, { data: targetProfile }] = await Promise.all([
    supabase.from('profiles').select('user_id, name, username, avatar_url').eq('id', currentProfileId).maybeSingle(),
    supabase.from('profiles').select('user_id, name, username, avatar_url').eq('id', targetProfileId).maybeSingle(),
  ]);

  const currentAuthId = (currentProfile as any)?.user_id;
  const targetAuthId = (targetProfile as any)?.user_id;

  if (!currentAuthId || !targetAuthId) {
    return { conversationId: null, targetAuthId: targetAuthId ?? null, targetProfile };
  }

  const conversationId = await ensureConversation(currentAuthId, targetAuthId);
  // Privacidade: NUNCA usar nome real em notificações — somente @username.
  const toHandle = (p: any) => {
    const u = (p?.username || '').toString().trim().replace(/^@+/, '');
    return u ? `@${u}` : 'alguém';
  };
  const currentName = toHandle(currentProfile);
  const targetName = toHandle(targetProfile);

  await Promise.allSettled([
    supabase.from('notifications').insert({
      user_id: currentAuthId,
      type: 'looking_now_match',
      title: `Perfect Pair! 💕 ${targetName} também curtiu você!`,
    } as any),
    supabase.from('notifications').insert({
      user_id: targetAuthId,
      type: 'looking_now_match',
      title: `Perfect Pair! 💕 ${currentName} também curtiu você!`,
    } as any),
  ]);

  // Push de Perfect Pair desativado — fluxo legado.
  // Os pushes de "Explorar novos misteriosos(as)" são disparados em
  // useDiscoveryActions.approachMutation quando ocorre reciprocidade.

  return { conversationId, targetAuthId, targetProfile };
}

export function usePerfectPair(options?: UsePerfectPairOptions) {
  const mode = options?.mode ?? 'full';
  const skipInitialMatchedFetch = options?.skipInitialMatchedFetch ?? false;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cards, setCards] = useState<PairCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState<PerfectPairDebugState>(INITIAL_DEBUG_STATE);
  const [match, setMatch] = useState<PairMatch | null>(null);
  const [viewerCardStatus, setViewerCardStatus] = useState<ViewerCardStatus>({ configured: true, reason: null });
  const [lastAction, setLastAction] = useState<{ targetId: string; action: string } | null>(null);
  const [receivedSuperLikes, setReceivedSuperLikes] = useState<Set<string>>(new Set());
  const profileIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const browserCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const shownMatchesRef = useRef<Set<string>>(new Set());
  // Track all IDs swiped in this session to prevent re-showing
  const swipedIdsRef = useRef<Set<string>>(new Set());

  const resolveProfileId = useCallback(async () => {
    if (!user?.id) return null;
    if (profileIdRef.current) return profileIdRef.current;
    const cachedProfileId = profileIdCache.get(user.id);
    if (cachedProfileId) {
      profileIdRef.current = cachedProfileId;
      return cachedProfileId;
    }

    const inflight = profileIdInflight.get(user.id);
    if (inflight) return inflight;

    const request = (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id')
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();

      if (error) {
        console.warn('[PerfectPair] Não foi possível resolver o perfil do usuário:', error.message);
      }

      if (data?.id) {
        profileIdRef.current = data.id;
        profileIdCache.set(user.id, data.id);
        return data.id;
      }

      return null;
    })().finally(() => {
      profileIdInflight.delete(user.id);
    });

    profileIdInflight.set(user.id, request);
    return request;
  }, [user?.id]);

  // Get profile id from auth user id
  useEffect(() => {
    resolveProfileId();
  }, [resolveProfileId]);

  // Get browser location on mount
  useEffect(() => {
    getBrowserLocation().then((coords) => {
      if (coords) {
        browserCoordsRef.current = coords;
        if (profileIdRef.current) {
          supabase.from('profiles').update({
            location_lat: coords.lat,
            location_lng: coords.lng,
          }).eq('id', profileIdRef.current).then(() => {});
        }
      }
    });
  }, []);

  const fetchCards = useCallback(async (isBackground = false) => {
    if (!user?.id || isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isBackground) setLoading(true);
    let debugState: PerfectPairDebugState = {
      ...INITIAL_DEBUG_STATE,
      authUserId: user.id,
    };

    try {
      const profileId = await resolveProfileId();
      debugState.profileId = profileId;
      debugState.profileResolved = !!profileId;
      if (!profileId) {
        debugState.fetchError = 'Perfil do usuário logado não foi resolvido.';
        setCards([]);
        setDebug(debugState);
        return;
      }

      if (!isBackground) {
        const cached = getPerfectPairSessionCache(user.id);
        if (cached) {
          setCards(cached.cards);
          setDebug(cached.debug);
          setViewerCardStatus(cached.viewerCardStatus);
          setLoading(false);
        }
      }

      const [{ data: viewerProfile }, matchedIds] = await Promise.all([
        supabase
        .from('profiles')
        .select('id, user_id, avatar_url, plan_type, location_lat, location_lng, address_city')
        .eq('id', profileId)
        .maybeSingle(),
        skipInitialMatchedFetch && !isBackground ? Promise.resolve<string[]>([]) : getMatchedProfileIds(profileId),
      ]);

      const viewerSettingsLookupIds = Array.from(new Set([user.id, profileId, (viewerProfile as any)?.user_id].filter(Boolean) as string[]));
      const viewerSettingsMap = await getPairSettingsMap(viewerSettingsLookupIds);
      const viewerSettings = resolvePairSettings(viewerSettingsMap, profileId, (viewerProfile as any)?.user_id, user.id);
      debugState.viewerSettingsLookupIds = viewerSettingsLookupIds;
      debugState.viewerSettingsResolvedBy = viewerSettings
        ? (viewerSettings.user_id === profileId ? 'profile.id' : viewerSettings.user_id === (viewerProfile as any)?.user_id ? 'profiles.user_id' : 'auth.user.id')
        : null;
      debugState.minAge = viewerSettings?.min_age ?? null;
      debugState.maxAge = viewerSettings?.max_age ?? null;
      debugState.maxDistanceKm = viewerSettings?.max_distance_km ?? null;
      debugState.interestedIn = Array.isArray(viewerSettings?.interested_in) ? viewerSettings!.interested_in! : [];
      debugState.showOnlyVerified = !!viewerSettings?.show_only_verified;
      const nextViewerCardStatus = getViewerCardStatus(viewerProfile as any, viewerSettings);
      setViewerCardStatus(nextViewerCardStatus);
      debugState.viewerConfigured = nextViewerCardStatus.configured;
      debugState.viewerReason = nextViewerCardStatus.reason;

      if (!nextViewerCardStatus.configured) {
        setCards([]);
        debugState.finalCount = 0;
        debugState.fetchError = nextViewerCardStatus.reason;
        setDebug(debugState);
        return;
      }

      const viewerCity: string | null = (viewerProfile as any)?.address_city ?? null;

      let viewerLat = browserCoordsRef.current?.lat || null;
      let viewerLng = browserCoordsRef.current?.lng || null;

      if (!viewerLat || !viewerLng) {
        viewerLat = viewerProfile?.location_lat || null;
        viewerLng = viewerProfile?.location_lng || null;
      }

      const rpcPromise = runPerfectPairRpc({
        p_user_id: profileId,
        p_limit: 10,
        p_viewer_lat: viewerLat ?? undefined,
        p_viewer_lng: viewerLng ?? undefined,
      });
      const rpcTimeoutMs = mode === 'light' ? 2500 : 5000;
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), rpcTimeoutMs));

      const matchedSet = new Set<string>(matchedIds);

      let profiles: any[] | null = null;
      let error: any = null;
      try {
        const result = await Promise.race([rpcPromise, timeoutPromise]) as any;
        profiles = result?.data ?? null;
        error = result?.error ?? null;
        debugState.rpcNameTried = result?.rpcName ?? null;
      } catch (e: any) {
        error = { message: e?.message || 'RPC failed' };
      }

      if (error) {
        console.warn('RPC fallback:', error.message);
        debugState.source = 'fallback';
        debugState.fetchError = error.message || 'RPC failed';

        const actioned = await getStoredPairActions(profileId);

        const now = Date.now();
        // Pular (dislike) oculta o card por 30 dias; depois volta a aparecer
        const dislikeWindowMs = 15 * 24 * 60 * 60 * 1000;
        const excludeIds = new Set<string>([profileId]);

        // Add session-swiped IDs
        swipedIdsRef.current.forEach(id => excludeIds.add(id));

        // Add already-matched profiles — eles ficam só na guia Matches
        matchedSet.forEach(id => excludeIds.add(id));

        // Likes simples NÃO devem ocultar o card permanentemente — o perfil só sai
        // do baralho quando: (a) houve dislike recente (30d) ou (b) já existe match mútuo
        // confirmado (tratado em outra camada). Isso garante que perfis curtidos voltem
        // a aparecer caso ainda não tenham retribuído.
        for (const a of actioned) {
          if (a.action_type === 'dislike') {
            const updatedAt = new Date(a.updated_at).getTime();
            if (now - updatedAt < dislikeWindowMs) {
              excludeIds.add(a.target_id);
            }
          }
        }

        const excludeArr = Array.from(excludeIds);
        debugState.excludedCount = excludeArr.length;
        // PostgREST exige sintaxe (uuid,uuid,...) — quando vazio usamos sentinela inválido para não quebrar
        const excludeSql = excludeArr.length > 0
          ? `(${excludeArr.join(',')})`
          : `(00000000-0000-0000-0000-000000000000)`;

        let fallbackQuery = supabase
          .from('profiles')
          .select('id, user_id, name, username, avatar_url, bio, plan_type, tags_social, tags_adult, birth_date, location_lat, location_lng, address_city, is_seed, is_invisible, profile_type, gender, banner_url')
          .not('id', 'in', excludeSql)
          .limit(20);

        const { data: rawFallback } = await fallbackQuery;
        debugState.rawCount = (rawFallback || []).length;

        const fallbackSettingsMap = mode === 'light'
          ? new Map<string, PairSettingsRow>()
          : await getPairSettingsMap(
              ((rawFallback || []) as any[]).flatMap((p: any) => [p.id, p.user_id]).filter(Boolean)
            );
        debugState.settingsRowsFound = fallbackSettingsMap.size;

        // Filtra is_seed e is_invisible em memória (encadear .or() múltiplos no PostgREST sobrescreve)
        const fallbackProfiles = (rawFallback || []).filter((p: any) =>
          (p.is_seed === false || p.is_seed == null) &&
          (p.is_invisible === false || p.is_invisible == null)
        );
        debugState.hiddenCount = debugState.rawCount - fallbackProfiles.length;

        const newCards: PairCard[] = await Promise.all(((fallbackProfiles || []) as any[]).map(async (p: any) => {
          const pairSettings = mode === 'light' ? null : resolvePairSettings(fallbackSettingsMap, p.id, p.user_id);
          let age: number | null = null;
          if (p.birth_date) {
            const bd = new Date(p.birth_date);
            const today = new Date();
            age = today.getFullYear() - bd.getFullYear();
            if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
          }

          const distance_km =
            viewerLat && viewerLng && p.location_lat && p.location_lng
              ? haversineKm(viewerLat, viewerLng, p.location_lat, p.location_lng)
              : mode === 'light'
                ? null
                : await computeDistanceKm(
                    viewerLat, viewerLng, viewerCity,
                    p.location_lat, p.location_lng, p.address_city,
                  );

          return {
            id: p.id, name: p.name, username: p.username, avatar_url: p.avatar_url,
            bio: p.bio, pair_bio: null, plan_type: normalizePlanType(p.plan_type),
            tags_social: p.tags_social ?? [], tags_adult: p.tags_adult ?? [],
            pair_photos: mergePairPhotos(undefined, pairSettings?.match_photos), is_boosted: false, shared_tags: [], age, distance_km,
            city: p.address_city ?? null,
            profile_type: p.profile_type ?? null,
            gender: p.gender ?? null,
            banner_url: p.banner_url ?? null,
          } as PairCard;
        }));
        debugState.mediaLessCount = countCardsWithoutMedia(newCards);

        // Filter out session-swiped
        const filtered = newCards.filter(c => !swipedIdsRef.current.has(c.id));
        debugState.finalCount = filtered.length;
        debugState.finalIds = filtered.map((card) => card.id);

        if (isBackground) {
          setCards(prev => {
            const existingIds = new Set(prev.map(c => c.id));
            const unique = filtered.filter(c => !existingIds.has(c.id));
            return [...prev, ...unique];
          });
        } else {
          setCards(filtered);
        }
        perfectPairSessionCache.set(user.id, {
          cards: filtered,
          debug: debugState,
          viewerCardStatus: nextViewerCardStatus,
          cachedAt: Date.now(),
        });
        setDebug(debugState);
        return;
      }

      // RPC succeeded — enriquece com dados completos do perfil (a RPC retorna apenas id/username/avatar/bio)
      const rpcRows = (profiles || []) as any[];
      debugState.source = 'rpc';
      debugState.rawCount = rpcRows.length;
      let newCards: PairCard[] = [];
      if (rpcRows.length > 0) {
        const ids = rpcRows.map((r) => r.id);
        const { data: enriched } = await supabase
          .from('profiles')
          .select('id, user_id, name, username, avatar_url, bio, plan_type, tags_social, tags_adult, birth_date, location_lat, location_lng, address_city, profile_type, gender, banner_url')
          .in('id', ids);

        const settingsMap = mode === 'light'
          ? new Map<string, PairSettingsRow>()
          : await getPairSettingsMap(
          ((enriched || []) as any[]).flatMap((p: any) => [p.id, p.user_id]).filter(Boolean)
        );
        debugState.settingsRowsFound = settingsMap.size;

        const enrichedMap = new Map<string, any>((enriched || []).map((p: any) => [p.id, p]));

        const builtCards = await Promise.all(rpcRows.map(async (r) => {
          const p = enrichedMap.get(r.id) || r;
          const pairSettings = mode === 'light' ? null : resolvePairSettings(settingsMap, p.id, p.user_id);
          let age: number | null = null;
          if (p.birth_date) {
            const bd = new Date(p.birth_date);
            const today = new Date();
            age = today.getFullYear() - bd.getFullYear();
            if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
          }
          const distance_km =
            viewerLat && viewerLng && p.location_lat && p.location_lng
              ? haversineKm(viewerLat, viewerLng, p.location_lat, p.location_lng)
              : mode === 'light'
                ? null
                : await computeDistanceKm(
                    viewerLat, viewerLng, viewerCity,
                    p.location_lat, p.location_lng, p.address_city,
                  );
          return {
            id: r.id,
            name: p.name || r.username || 'Usuário',
            username: p.username ?? r.username ?? null,
            avatar_url: p.avatar_url ?? r.avatar_url ?? null,
            bio: p.bio ?? r.bio ?? null,
            pair_bio: null,
            plan_type: normalizePlanType(p.plan_type || r.plan_type || 'free'),
            tags_social: p.tags_social ?? [],
            tags_adult: p.tags_adult ?? [],
            pair_photos: mergePairPhotos(r.pair_photos, pairSettings?.match_photos),
            is_boosted: false,
            shared_tags: [],
            age,
            distance_km,
            city: p.address_city ?? null,
            profile_type: p.profile_type ?? null,
            gender: p.gender ?? null,
            banner_url: p.banner_url ?? null,
          } as PairCard;
        }));
        newCards = builtCards.filter((c: PairCard) => !swipedIdsRef.current.has(c.id) && !matchedSet.has(c.id));

        debugState.mediaLessCount = countCardsWithoutMedia(newCards);
      }

      debugState.finalCount = newCards.length;
      debugState.finalIds = newCards.map((card) => card.id);
      perfectPairSessionCache.set(user.id, {
        cards: newCards,
        debug: debugState,
        viewerCardStatus: nextViewerCardStatus,
        cachedAt: Date.now(),
      });

      if (isBackground) {
        setCards(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const unique = newCards.filter((c: PairCard) => !existingIds.has(c.id));
          return [...prev, ...unique];
        });
      } else {
        setCards(newCards);
      }
      setDebug(debugState);
    } catch (err) {
      console.error('[PerfectPair] fetchCards error:', err);
      debugState.fetchError = err instanceof Error ? err.message : 'Erro inesperado ao carregar cards';
      setDebug(debugState);
    } finally {
      isFetchingRef.current = false;
      if (!isBackground) setLoading(false);
    }
  }, [user?.id, mode, skipInitialMatchedFetch, resolveProfileId]);

  // Initial fetch (no localStorage cache — always fresh from DB)
  useEffect(() => {
    swipedIdsRef.current.clear();
    fetchCards(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Prefetch when cards drop to threshold
  useEffect(() => {
    if (cards.length > 0 && cards.length <= PREFETCH_THRESHOLD && !isFetchingRef.current) {
      fetchCards(true);
    }
  }, [cards.length, fetchCards]);

  // Realtime: refetch cards/contadores quando follow/unfollow, novas curtidas
  // de perfil ou novas ações de perfect pair envolverem o usuário logado.
  useEffect(() => {
    if (!user?.id) return;

    let scheduled: number | null = null;
    const scheduleRefetch = () => {
      if (scheduled !== null) return;
      scheduled = window.setTimeout(() => {
        scheduled = null;
        if (!isFetchingRef.current) fetchCards(true);
        queryClient.invalidateQueries({ queryKey: ['pair-matches'] });
      }, 800);
    };

    const unsubs = [
      subscribeTable('followers', () => scheduleRefetch()),
      subscribeTable('profile_likes', () => scheduleRefetch()),
      subscribeTable('perfect_pair_actions', () => scheduleRefetch()),
    ];

    return () => {
      if (scheduled !== null) window.clearTimeout(scheduled);
      unsubs.forEach((u) => u());
    };
  }, [user?.id, fetchCards, queryClient]);

  const showMatchModal = useCallback((
    pairProfileId: string,
    pairAuthId: string | undefined,
    userName: string,
    avatar: string | null,
    conversationId: string | null,
    savedCardAvatar: string | null | undefined
  ) => {
    const dedupeKey = `${user?.id}_${pairProfileId}`;
    if (shownMatchesRef.current.has(dedupeKey)) return;
    shownMatchesRef.current.add(dedupeKey);

    setMatch({
      pairUserId: pairProfileId,
      pairUserAuthId: pairAuthId,
      userName,
      pairUserAvatar: savedCardAvatar ?? avatar,
      conversationId,
    });

    queryClient.invalidateQueries({ queryKey: ['pair-matches'] });
  }, [user?.id, queryClient]);

  // Listen for match notifications in realtime
  useEffect(() => {
    if (!user?.id) return;

    const unsub = subscribeTable(
      'notifications',
      (payload: any) => {
        const n = payload.new;
        if (!n || n.user_id !== user.id) return;
        const isPerfectPairMatch =
          n?.type === 'looking_now_match' ||
          n?.type === 'match' ||
          n?.data?.notification_type === 'looking_now_match';
        if (!isPerfectPairMatch) return;

        const pairProfileId = n.data?.pair_user_id;
        const conversationId = n.data?.conversation_id ?? null;
        if (!pairProfileId) return;

        const rawBody = n.body || n.title || '';
        const userName = rawBody
          .replace(' também curtiu você!', '')
          .replace('Perfect Pair! 💕', '')
          .trim() || 'Alguém';

        const cardInStack = cards.find(c => c.id === pairProfileId);

        supabase
          .from('profiles')
          .select('user_id, name, avatar_url')
          .eq('id', pairProfileId)
          .single()
          .then(({ data: pData }) => {
            showMatchModal(
              pairProfileId,
              pData?.user_id ?? undefined,
              pData?.name || cardInStack?.name || userName,
              pData?.avatar_url ?? null,
              conversationId,
              cardInStack?.avatar_url
            );
          });
      },
      { events: ['INSERT'] },
    );

    return () => { unsub(); };
  }, [user?.id, cards, showMatchModal]);

  // Optimistic swipe action
  const swipe = useCallback(async (targetId: string, action: 'like' | 'dislike' | 'superlike') => {
    const currentProfileId = await resolveProfileId();
    if (!currentProfileId) {
      console.error('[PerfectPair] profileId não resolvido para swipe');
      return;
    }

    // Backend rate-limit: match (apenas like/superlike consomem cota)
    if (action !== 'dislike') {
      try {
        const { data: rl } = await (supabase as any).rpc('check_and_increment_usage', { _feature: 'match' });
        if (rl && rl.allowed === false) {
          const { dispatchRateLimit } = await import('@/components/RateLimitProvider');
          dispatchRateLimit({
            feature: 'match',
            reason: rl.reason,
            count: rl.count,
            limit: rl.limit,
            resetAt: rl.reset_at,
            plan: rl.plan,
          });
          return;
        }
      } catch { /* fail-open */ }
    }

    const targetCard = cards.find(c => c.id === targetId);
    setLastAction({ targetId, action });

    // Track swiped ID in session to prevent re-showing
    swipedIdsRef.current.add(targetId);

    // Remove card immediately (optimistic)
    setCards(prev => prev.filter(c => c.id !== targetId));

    const dbAction = action === 'superlike' ? 'super_like' : action;

    const { saved, error } = await persistPairAction(currentProfileId, targetId, dbAction);

    if (!saved) {
      console.error('Pair insert error:', error);
      return;
    }

    // On like/super_like: check for mutual match
    if (action === 'like' || action === 'superlike') {
      queryClient.invalidateQueries({ queryKey: ['pair-matches'] });

      const savedCard = targetCard;
      const currentAuthId = user?.id;

      const checkForMatch = async (attempt = 0) => {
        if (!currentAuthId) return;

        const { data: matchNotifs } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', currentAuthId)
          .in('type', ['looking_now_match', 'match'])
          .order('created_at', { ascending: false })
          .limit(10);

        if (matchNotifs && matchNotifs.length > 0) {
          for (const n of matchNotifs as any[]) {
            const pairProfileId = n.data?.pair_user_id || targetId;
            const conversationId = n.data?.conversation_id ?? null;
            const notifAge = Date.now() - new Date(n.created_at).getTime();

            if (pairProfileId === targetId && notifAge < 15000) {
              const { data: pData } = await supabase
                .from('profiles')
                .select('user_id, name, avatar_url')
                .eq('id', pairProfileId)
                .single();

              showMatchModal(
                pairProfileId,
                pData?.user_id ?? undefined,
                pData?.name || savedCard?.name || 'Alguém',
                pData?.avatar_url ?? null,
                conversationId,
                savedCard?.avatar_url
              );
              return;
            }
          }
        }

        // Direct DB check for mutual like (fallback)
        if (attempt === 1) {
          const reverseActionExists = await hasMutualPairLike(targetId, currentProfileId);

          if (reverseActionExists) {
            const { conversationId, targetAuthId, targetProfile } = await createPerfectPairMatchArtifacts(currentProfileId, targetId);
            showMatchModal(
              targetId,
              targetAuthId ?? undefined,
              (() => { const u = ((targetProfile as any)?.username || (savedCard as any)?.username || '').toString().trim().replace(/^@+/, ''); return u ? `@${u}` : '@usuario'; })(),
              (targetProfile as any)?.avatar_url ?? null,
              conversationId,
              savedCard?.avatar_url
            );
            return;
          }
        }

        if (attempt < 3) {
          setTimeout(() => checkForMatch(attempt + 1), 800);
        }
      };

      setTimeout(() => checkForMatch(), 350);
    }
  }, [user?.id, cards, queryClient, resolveProfileId, showMatchModal]);

  // Undo last action
  const undo = useCallback(async () => {
    const currentProfileId = await resolveProfileId();
    if (!currentProfileId) return;

    try {
      const { data: targetId, error } = await supabase.rpc('undo_last_swipe', {
        user_uuid: currentProfileId,
      });

      if (error) throw error;

      if (!targetId) {
        toast({ title: 'Sem ações para desfazer', variant: 'default' });
        return;
      }

      // Remove from session swiped set so it can appear again
      swipedIdsRef.current.delete(targetId as string);

      const { data: recovered } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, bio, plan_type, tags_social, tags_adult')
        .eq('id', targetId)
        .single();

      if (recovered) {
        const card = {
          ...(recovered as unknown as PairCard),
          tags_social: (recovered as any).tags_social ?? [],
          tags_adult: (recovered as any).tags_adult ?? [],
        };
        setCards(prev => [card, ...prev]);
      }

      setLastAction(null);
    } catch (err: any) {
      toast({ title: 'Erro ao desfazer', description: err.message, variant: 'destructive' });
    }
  }, [resolveProfileId]);

  const dismissMatch = useCallback(() => setMatch(null), []);

  // Fetch received super likes for current cards
  useEffect(() => {
    const pid = profileIdRef.current;
    if (!pid || cards.length === 0) return;

    const cardIds = cards.map(c => c.id);
    (async () => {
      const receivedIds = new Set<string>();

      if (await canUsePerfectPairActionsTable()) {
        const { data, error } = await (supabase as any)
          .from('perfect_pair_actions')
          .select('user_id')
          .eq('target_id', pid)
          .eq('action_type', 'super_like')
          .in('user_id', cardIds);

        if (isMissingPerfectPairActionsTable(error)) {
          perfectPairActionsAvailable = false;
        } else if (data) {
          data.forEach((row: any) => receivedIds.add(row.user_id));
        }
      }

      const { data: legacyData } = await (supabase as any)
        .from('perfect_pairs')
        .select('user_id')
        .eq('target_id', pid)
        .eq('action', 'super_like')
        .in('user_id', cardIds);

      if (legacyData) {
        legacyData.forEach((row: any) => receivedIds.add(row.user_id));
      }

      setReceivedSuperLikes(receivedIds);
    })();
  }, [cards]);

  return {
    cards,
    debug,
    loading,
    viewerCardStatus,
    swipe,
    undo,
    match,
    dismissMatch,
    refetch: () => { swipedIdsRef.current.clear(); fetchCards(false); },
    hasUndo: !!lastAction,
    receivedSuperLikes,
  };
}
