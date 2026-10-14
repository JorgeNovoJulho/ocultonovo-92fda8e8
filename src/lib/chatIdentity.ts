import { supabase } from '@/lib/supabaseExternal';

export interface ChatIdentity {
  authUserId: string;
  profileId: string | null;
  selfIds: string[];
}

const buildIdSet = (...values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

// ─────────────────────────────────────────────────────────────
// Cache leve (TTL) para resolver identidade/perfis no realtime
// sem disparar 2-4 queries para CADA mensagem recebida.
// Isso é o que diferencia "delay perceptível" de "instantâneo
// estilo WhatsApp" no destinatário.
// ─────────────────────────────────────────────────────────────
const IDENTITY_TTL_MS = 60_000;
const PROFILE_TTL_MS = 60_000;

const identityCache = new Map<string, { value: ChatIdentity; at: number }>();
const identityInflight = new Map<string, Promise<ChatIdentity>>();
const profileCache = new Map<string, { value: any; at: number }>();
const profileInflight = new Map<string, Promise<any>>();
const CHAT_BLOCK_TTL_MS = 10_000;
const chatBlockCache = new Map<string, { value: boolean; at: number }>();

const isMissingRpc = (error: any) => {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return text.includes('pgrst202') || text.includes('schema cache') || text.includes('function');
};

/**
 * Busca TODAS as linhas de perfil ligadas a um id (profiles.id OU user_id).
 *
 * IMPORTANTE: não usar `.maybeSingle()` aqui. Existem contas com mais de uma
 * linha em `profiles` (duplicatas antigas); com `.maybeSingle()` a consulta
 * devolve ERRO (várias linhas) e `data = null` em silêncio — o chat passava
 * a procurar as conversas só pelo auth id e a lista aparecia VAZIA.
 */
async function fetchProfileRowsByAnyId(anyId: string, columns = 'id, user_id'): Promise<any[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(columns.includes('created_at') ? columns : `${columns}, created_at`)
    .or(`id.eq.${anyId},user_id.eq.${anyId}`)
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data as any[]) ?? [];
}

const resolveAnyChatIds = async (anyId?: string | null) => {
  const fallback = buildIdSet(anyId);
  if (!anyId) return fallback;

  try {
    const rows = await fetchProfileRowsByAnyId(anyId);
    return buildIdSet(anyId, ...rows.flatMap((r) => [r?.id, r?.user_id]));
  } catch {
    return fallback;
  }
};

const getCurrentAuthId = async (authUserId?: string | null) => {
  if (authUserId) return authUserId;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
};

const isChatBlockedFallback = async (otherId: string, authUserId?: string | null): Promise<boolean> => {
  const currentAuthId = await getCurrentAuthId(authUserId);
  if (!currentAuthId) return false;

  const [meIds, otherIds] = await Promise.all([
    resolveAnyChatIds(currentAuthId),
    resolveAnyChatIds(otherId),
  ]);

  if (meIds.length === 0 || otherIds.length === 0) return false;

  try {
    const [ownBlock, reverseBlock] = await Promise.all([
      supabase
        .from('blocked_contacts')
        .select('id')
        .eq('block_type', 'blocked')
        .in('user_id', meIds)
        .in('blocked_user_id', otherIds)
        .limit(1),
      supabase
        .from('blocked_contacts')
        .select('id')
        .eq('block_type', 'blocked')
        .in('user_id', otherIds)
        .in('blocked_user_id', meIds)
        .limit(1),
    ]);

    return Boolean((ownBlock.data && ownBlock.data.length > 0) || (reverseBlock.data && reverseBlock.data.length > 0));
  } catch {
    return false;
  }
};

export function invalidateChatIdentityCache(authUserId?: string | null) {
  if (!authUserId) { identityCache.clear(); return; }
  identityCache.delete(authUserId);
}

export function invalidateChatBlockCache() {
  chatBlockCache.clear();
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('oculto:chat-blocks:changed'));
  } catch { /* noop */ }
}

export async function isChatBlockedBetween(otherId?: string | null, authUserId?: string | null): Promise<boolean> {
  if (!otherId) return false;
  const cacheKey = `${authUserId || 'current'}:${otherId}`;
  const cached = chatBlockCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CHAT_BLOCK_TTL_MS) return cached.value;

  const { data, error } = await (supabase as any)
    .rpc('is_chat_blocked_between', { _other_id: otherId });
  if (error) {
    if (!isMissingRpc(error)) console.warn('[chatIdentity] block check failed:', error.message);
    const fallbackValue = await isChatBlockedFallback(otherId, authUserId);
    chatBlockCache.set(cacheKey, { value: fallbackValue, at: Date.now() });
    return fallbackValue;
  }

  const value = Boolean(data) || await isChatBlockedFallback(otherId, authUserId);
  chatBlockCache.set(cacheKey, { value, at: Date.now() });
  return value;
}

export async function resolveChatIdentity(authUserId?: string | null): Promise<ChatIdentity> {
  const safeAuthUserId = authUserId ?? '';

  if (!safeAuthUserId) {
    return { authUserId: '', profileId: null, selfIds: [] };
  }

  const cached = identityCache.get(safeAuthUserId);
  if (cached && Date.now() - cached.at < IDENTITY_TTL_MS) return cached.value;

  const inflight = identityInflight.get(safeAuthUserId);
  if (inflight) return inflight;

  const fetcher = (async (): Promise<ChatIdentity> => {
    try {
      const rows = await fetchProfileRowsByAnyId(safeAuthUserId);
      // Perfil canônico: o mais antigo ligado ao auth id (mesma regra do useProfile).
      const canonical = rows.find((r) => r?.user_id === safeAuthUserId) ?? rows[0] ?? null;
      const value: ChatIdentity = {
        authUserId: safeAuthUserId,
        profileId: canonical?.id ?? null,
        // Inclui os ids de TODAS as linhas: conversas antigas podem ter sido
        // gravadas com o id de um perfil duplicado.
        selfIds: buildIdSet(safeAuthUserId, ...rows.flatMap((r) => [r?.id, r?.user_id])),
      };
      identityCache.set(safeAuthUserId, { value, at: Date.now() });
      return value;
    } catch {
      return { authUserId: safeAuthUserId, profileId: null, selfIds: [safeAuthUserId] };
    } finally {
      identityInflight.delete(safeAuthUserId);
    }
  })();

  identityInflight.set(safeAuthUserId, fetcher);
  return fetcher;
}

export async function resolveAuthUserIdFromAnyId(anyId?: string | null): Promise<string | null> {
  if (!anyId) return null;

  try {
    const rows = await fetchProfileRowsByAnyId(anyId);
    const withAuth = rows.find((r) => r?.user_id);
    return withAuth?.user_id || anyId;
  } catch {
    return anyId;
  }
}

export async function resolveProfileByAnyId<T = Record<string, any>>(
  anyId: string | null | undefined,
  columns: string,
): Promise<T | null> {
  if (!anyId) return null;

  const cacheKey = `${anyId}::${columns}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.value as T | null;

  const inflight = profileInflight.get(cacheKey);
  if (inflight) return inflight as Promise<T | null>;

  const fetcher = (async (): Promise<T | null> => {
    try {
      // `.limit(1)` em vez de `.maybeSingle()`: com perfis duplicados o
      // maybeSingle falhava e o chat não achava a pessoa ("Usuário não encontrado").
      const [byId, byUserId] = await Promise.all([
        supabase.from('profiles').select(columns).eq('id', anyId).limit(1),
        supabase.from('profiles').select(columns).eq('user_id', anyId).order('created_at', { ascending: true }).limit(1),
      ]);
      const first = (r: any) => (Array.isArray(r?.data) && r.data.length > 0 ? r.data[0] : null);
      const value = ((first(byId) ?? first(byUserId)) as T | null) ?? null;
      profileCache.set(cacheKey, { value, at: Date.now() });
      return value;
    } finally {
      profileInflight.delete(cacheKey);
    }
  })();

  profileInflight.set(cacheKey, fetcher);
  return fetcher;
}

// Cache do peer (outro participante) por conversa — quase imutável.
// Sem ele, cada envio de mensagem dispara 1-2 queries extras só para
// montar a push notification. Com TTL longo (10 min) o envio fica instantâneo.
const PEER_TTL_MS = 10 * 60_000;
const peerCache = new Map<string, { value: string | null; at: number }>();
const peerInflight = new Map<string, Promise<string | null>>();

export function invalidateConversationPeerCache(conversationId?: string | null) {
  if (!conversationId) { peerCache.clear(); return; }
  peerCache.delete(conversationId);
}

export async function resolveConversationPeerId(
  conversationId: string | null | undefined,
  selfIds: string[],
): Promise<string | null> {
  if (!conversationId) return null;

  const cached = peerCache.get(conversationId);
  if (cached && Date.now() - cached.at < PEER_TTL_MS) return cached.value;

  const inflight = peerInflight.get(conversationId);
  if (inflight) return inflight;

  const uniqueSelfIds = Array.from(new Set(selfIds.filter(Boolean)));

  const fetcher = (async (): Promise<string | null> => {
    let resolved: string | null = null;
    try {
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId);

      const peerId = participants?.find((participant) => !uniqueSelfIds.includes(participant.user_id))?.user_id;
      if (peerId) resolved = peerId;
    } catch {
      // tenta fallback abaixo
    }

    if (!resolved) {
      try {
        const { data: legacyConversation } = await (supabase as any)
          .from('conversations')
          .select('participant_1, participant_2')
          .eq('id', conversationId)
          .maybeSingle();
        if (legacyConversation) {
          if (legacyConversation.participant_1 && !uniqueSelfIds.includes(legacyConversation.participant_1)) {
            resolved = legacyConversation.participant_1;
          } else if (legacyConversation.participant_2 && !uniqueSelfIds.includes(legacyConversation.participant_2)) {
            resolved = legacyConversation.participant_2;
          }
        }
      } catch { /* noop */ }
    }

    peerCache.set(conversationId, { value: resolved, at: Date.now() });
    peerInflight.delete(conversationId);
    return resolved;
  })();

  peerInflight.set(conversationId, fetcher);
  return fetcher;
}


export function isSelfChatId(candidateId: string | null | undefined, selfIds: string[]) {
  return Boolean(candidateId && selfIds.includes(candidateId));
}
