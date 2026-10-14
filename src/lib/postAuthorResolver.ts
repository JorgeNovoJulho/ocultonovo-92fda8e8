import { supabase } from "@/lib/supabaseExternal";
import {
  loadAuthorScope,
  loadAuthorScopeStale,
  saveAuthorScope,
  markNetworkFailure,
  isAbortLikeError as cacheIsAbortLikeError,
  withTimeout,
} from "@/lib/authorScopeCache";


export interface CanonicalAuthorIds {
  /** profiles.id — usado em posts.author_id (FK posts_author_id_fkey). */
  authorProfileId: string;
  /** auth.users.id — usado em posts.creator_id (RLS owner). */
  creatorId: string;
}

export interface ResolvedAuthorScope extends CanonicalAuthorIds {
  /** Todos os profile ids já associados ao mesmo auth user, incluindo legados/duplicados. */
  allProfileIds: string[];
  /** Usernames efetivamente usados/encontrados para resolver perfis legados. */
  matchedUsernames?: string[];
  /** Username atual priorizado na resolução. */
  canonicalUsername?: string | null;
  /** Indica se havia perfis legados/duplicados relevantes. */
  hasLegacyProfiles?: boolean;
}

type ProfileIdRow = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ResolvedAuthorOptions = {
  usernames?: string[] | null;
};

const AUTHOR_SCOPE_CACHE_TTL_MS = 60_000;
const authorScopeCache = new Map<string, { expiresAt: number; value: ResolvedAuthorScope }>();
const pendingAuthorScopeRequests = new Map<string, Promise<ResolvedAuthorScope>>();

function normalizeUsernameCandidate(value?: string | null) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase() || null;
}

function uniqueUsernames(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeUsernameCandidate).filter(Boolean) as string[]));
}

function buildAuthorScopeCacheKey(authUserId: string, usernames: string[] = []) {
  return `${authUserId}::${[...usernames].sort().join(',')}`;
}

function readCachedAuthorScope(cacheKey: string) {
  const cached = authorScopeCache.get(cacheKey);
  if (cached && cached.expiresAt >= Date.now()) return cached.value;
  if (cached) authorScopeCache.delete(cacheKey);
  // Fallback: hidratação a partir de sessionStorage (sobrevive a navegações).
  const fromSession = loadAuthorScope(cacheKey) as ResolvedAuthorScope | null;
  if (fromSession?.authorProfileId) {
    authorScopeCache.set(cacheKey, { expiresAt: Date.now() + AUTHOR_SCOPE_CACHE_TTL_MS, value: fromSession });
    return fromSession;
  }
  return null;
}

/** Retorna QUALQUER valor já visto antes (inclusive expirado) — usado em modo
 *  "stale-while-error" quando a rede falha. Nunca toca o banco. */
function readStaleAuthorScope(cacheKey: string): ResolvedAuthorScope | null {
  const inMem = authorScopeCache.get(cacheKey)?.value || null;
  if (inMem?.authorProfileId) return inMem;
  return (loadAuthorScopeStale(cacheKey) as ResolvedAuthorScope | null) || null;
}

function writeCachedAuthorScope(cacheKey: string, value: ResolvedAuthorScope) {
  authorScopeCache.set(cacheKey, { expiresAt: Date.now() + AUTHOR_SCOPE_CACHE_TTL_MS, value });
  saveAuthorScope(cacheKey, value);
}

function sortProfileRows(rows: ProfileIdRow[] = [], preferredUsernames: string[] = []) {
  const preferred = new Set(preferredUsernames);
  const deduped = Array.from(new Map(rows.filter((row) => row?.id).map((row) => [row.id as string, row])).values());

  return deduped.sort((a, b) => {
    const aPreferred = a.username && preferred.has(String(a.username).toLowerCase()) ? 1 : 0;
    const bPreferred = b.username && preferred.has(String(b.username).toLowerCase()) ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;

    const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

export function resetAuthorResolutionCache() {
  authorScopeCache.clear();
}

function isAbortError(err: any) {
  return cacheIsAbortLikeError(err);
}

async function getProfilesForAuthUser(authUserId: string): Promise<ProfileIdRow[]> {
  try {
    const { data, error } = await withTimeout<any>(
      Promise.resolve(
        (supabase as any)
          .from("profiles")
          .select("id,user_id,username,updated_at,created_at")
          .eq("user_id", authUserId)
          .limit(20),
      ),
      6000,
    );

    if (error) throw error;
    return sortProfileRows((data || []) as ProfileIdRow[]);
  } catch (error) {
    if (isAbortError(error)) { markNetworkFailure(); throw error; }
    console.warn("[getProfilesForAuthUser] falha ao listar perfis do auth user", error);
    return [];
  }
}

async function getProfilesByUsernames(usernames: string[]): Promise<ProfileIdRow[]> {
  if (usernames.length === 0) return [];

  try {
    const { data, error } = await withTimeout<any>(
      Promise.resolve(
        (supabase as any)
          .from("profiles")
          .select("id,user_id,username,updated_at,created_at")
          .in("username", usernames)
          .limit(Math.max(20, usernames.length * 4)),
      ),
      6000,
    );

    if (error) throw error;
    return (data || []) as ProfileIdRow[];
  } catch (error) {
    if (isAbortError(error)) { markNetworkFailure(); throw error; }
    console.warn("[getProfilesByUsernames] falha ao listar perfis por username", error);
    return [];
  }
}

export function mergeResolvedOwnerIds(profileId?: string | null, authUserId?: string | null, scope?: ResolvedAuthorScope | null) {
  const ids = new Set<string>();

  if (profileId) ids.add(profileId);
  if (authUserId) ids.add(authUserId);

  if (scope?.authorProfileId) ids.add(scope.authorProfileId);
  if (scope?.creatorId) ids.add(scope.creatorId);
  for (const id of scope?.allProfileIds || []) {
    if (id) ids.add(id);
  }

  return Array.from(ids).filter(Boolean);
}

/**
 * Resolve os identificadores canônicos de autor para qualquer INSERT em
 * `public.posts`. Garante que:
 *   - `author_id` aponte para `profiles.id` real do usuário (FK válida);
 *   - `creator_id` aponte para `auth.users.id` (necessário p/ RLS owner-only).
 *
 * Funciona mesmo quando `profiles.id !== auth.uid` (perfis relinkados que
 * preservam o id original). Cai em fallback seguro para evitar quebra,
 * mas o trigger DB `trg_posts_enforce_author_id` ainda normaliza no servidor.
 */
export async function getCanonicalAuthorIds(authUserId: string): Promise<CanonicalAuthorIds> {
  if (!authUserId) {
    throw new Error("getCanonicalAuthorIds: authUserId é obrigatório");
  }

  const cached = readCachedAuthorScope(buildAuthorScopeCacheKey(authUserId));
  if (cached?.authorProfileId && cached?.creatorId) {
    return { authorProfileId: cached.authorProfileId, creatorId: cached.creatorId };
  }

  let authorProfileId = authUserId;
  try {
    const relatedProfiles = await getProfilesForAuthUser(authUserId);
    if (relatedProfiles[0]?.id) {
      authorProfileId = relatedProfiles[0].id as string;
    } else {
      const { data: profById } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("id", authUserId)
        .maybeSingle();
      if (profById?.id) authorProfileId = profById.id as string;
    }
  } catch (e) {
    console.warn("[getCanonicalAuthorIds] fallback para auth.uid", e);
  }
  return { authorProfileId, creatorId: authUserId };
}

/**
 * Resolve o escopo completo do autor:
 * - profile canônico atual do usuário
 * - auth user id canônico
 * - todos os profile ids históricos vinculados ao mesmo user_id
 *
 * Isso permite buscar posts antigos que ainda apontam para profiles.id legados
 * em `posts.author_id`, sem depender apenas do profile atual.
 */
export async function getResolvedAuthorScope(authUserId: string, options?: ResolvedAuthorOptions): Promise<ResolvedAuthorScope> {
  const usernameHints = uniqueUsernames(options?.usernames || []);
  const cacheKey = buildAuthorScopeCacheKey(authUserId, usernameHints);
  const cached = readCachedAuthorScope(cacheKey);
  if (cached) return cached;

  const pending = pendingAuthorScopeRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const canonical = await getCanonicalAuthorIds(authUserId);
    let authorProfileId = canonical.authorProfileId;
    const creatorId = canonical.creatorId;

    const profileIds = new Set<string>();
    if (authorProfileId) profileIds.add(authorProfileId);
    const matchedUsernames = new Set<string>();

    const relatedProfiles = sortProfileRows(await getProfilesForAuthUser(authUserId), usernameHints);
    // Se a 1ª consulta estourou o tempo (comum no 4G), getCanonicalAuthorIds cai
    // no auth.uid. Corrige com o perfil real assim que ele chegar, para não
    // gravar no cache um id que não é o do perfil.
    if (authorProfileId === authUserId && relatedProfiles[0]?.id && relatedProfiles[0].id !== authUserId) {
      authorProfileId = relatedProfiles[0].id as string;
      profileIds.add(authorProfileId);
    }
    const canonicalUsername = normalizeUsernameCandidate(relatedProfiles[0]?.username);
    for (const row of relatedProfiles) {
      if (row?.id) profileIds.add(row.id);
      const normalizedUsername = normalizeUsernameCandidate(row?.username);
      if (normalizedUsername && usernameHints.includes(normalizedUsername)) matchedUsernames.add(normalizedUsername);
    }

    const usernameProfiles = sortProfileRows(await getProfilesByUsernames(usernameHints), usernameHints);
    for (const row of usernameProfiles) {
      const normalizedUsername = normalizeUsernameCandidate(row?.username);
      const belongsToCurrentUser = row?.user_id === authUserId || row?.id === authUserId || row?.user_id == null;
      if (belongsToCurrentUser && row?.id) profileIds.add(row.id);
      if (normalizedUsername) matchedUsernames.add(normalizedUsername);
    }

    try {
      const { data: profileById } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("id", authUserId)
        .maybeSingle();
      if (profileById?.id) profileIds.add(profileById.id as string);
    } catch (e) {
      console.warn("[getResolvedAuthorScope] falha no fallback por id", e);
    }

    const resolved = {
      authorProfileId,
      creatorId,
      allProfileIds: Array.from(profileIds),
      matchedUsernames: Array.from(matchedUsernames),
      canonicalUsername,
      hasLegacyProfiles: profileIds.size > 1,
    } satisfies ResolvedAuthorScope;

    // Resultado incompleto (rede falhou e só sobrou o auth.uid): usa, mas não
    // grava no cache — a próxima tentativa resolve o perfil certo.
    const incomplete = relatedProfiles.length === 0 && profileIds.size <= 1 && authorProfileId === authUserId;
    if (!incomplete) {
      writeCachedAuthorScope(cacheKey, resolved);
      writeCachedAuthorScope(buildAuthorScopeCacheKey(authUserId), resolved);
    }
    return resolved;
  })();

  pendingAuthorScopeRequests.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    // Stale-while-error: se a rede falhou/abortou, devolve o último escopo
    // conhecido em vez de quebrar o feed. Só propaga se nunca tivermos cache.
    const stale = readStaleAuthorScope(cacheKey) ||
      readStaleAuthorScope(buildAuthorScopeCacheKey(authUserId));
    if (stale?.authorProfileId) {
      if (isAbortError(error)) markNetworkFailure();
      return stale;
    }
    throw error;
  } finally {
    pendingAuthorScopeRequests.delete(cacheKey);
  }
}

export async function getResolvedOwnerIds(profileId?: string | null, authUserId?: string | null, options?: ResolvedAuthorOptions) {
  if (!authUserId) {
    return mergeResolvedOwnerIds(profileId, authUserId, null);
  }

  try {
    const scope = await getResolvedAuthorScope(authUserId, options);
    return mergeResolvedOwnerIds(profileId, authUserId, scope);
  } catch (error) {
    // Tenta uma última vez o cache stale antes de cair em ids básicos.
    const usernameHints = uniqueUsernames(options?.usernames || []);
    const stale = readStaleAuthorScope(buildAuthorScopeCacheKey(authUserId, usernameHints))
      || readStaleAuthorScope(buildAuthorScopeCacheKey(authUserId));
    if (stale) {
      if (isAbortError(error)) markNetworkFailure();
      return mergeResolvedOwnerIds(profileId, authUserId, stale);
    }
    if (!isAbortError(error)) {
      console.warn("[getResolvedOwnerIds] fallback para ids básicos", error);
    }
    return mergeResolvedOwnerIds(profileId, authUserId, null);
  }
}
