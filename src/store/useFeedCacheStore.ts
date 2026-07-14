import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Cache compartilhado de perfis + posts do feed.
 * Mantido em Zustand + localStorage para acelerar a primeira pintura
 * do feed após login (mostra dados em cache enquanto a rede atualiza).
 *
 * - Profiles: indexados por `id` (profile.id) e também por `user_id` (auth user id).
 * - Posts: lista achatada da última carga conhecida do feed.
 * - TTL: 24 horas — em rede instável é melhor mostrar conteúdo antigo do que feed vazio.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_POSTS = 120;
const MAX_PROFILES = 400;

export type CachedProfile = {
  id: string;
  user_id?: string | null;
  username?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  is_premium?: boolean | null;
  is_vip?: boolean | null;
  is_creator?: boolean | null;
  is_verified?: boolean | null;
  [key: string]: any;
};

export type CachedFeedPost = {
  id: string;
  author_id?: string | null;
  creator_id?: string | null;
  created_at?: string | null;
  [key: string]: any;
};

interface FeedCacheState {
  profiles: Record<string, CachedProfile>;
  /** posts achatados, ordenados conforme última escrita. */
  posts: CachedFeedPost[];
  updatedAt: number;
  feedOwnerId: string | null; // user id dono do cache (para invalidar troca de conta)

  getProfile: (id?: string | null) => CachedProfile | null;
  setProfiles: (profiles: CachedProfile[] | null | undefined) => void;
  setPosts: (
    posts: CachedFeedPost[] | null | undefined,
    ownerId?: string | null,
  ) => void;
  getPostsSnapshot: (ownerId?: string | null) => CachedFeedPost[];
  clear: () => void;
}

function indexProfiles(
  base: Record<string, CachedProfile>,
  incoming: CachedProfile[],
): Record<string, CachedProfile> {
  const next = { ...base };
  for (const p of incoming) {
    if (!p) continue;
    if (p.id) next[p.id] = { ...next[p.id], ...p };
    if (p.user_id) next[p.user_id] = { ...next[p.user_id], ...p };
  }
  // soft cap
  const keys = Object.keys(next);
  if (keys.length > MAX_PROFILES) {
    // descarta entradas mais antigas (sem timestamp por entrada — usa FIFO)
    for (const k of keys.slice(0, keys.length - MAX_PROFILES)) {
      delete next[k];
    }
  }
  return next;
}

export const useFeedCacheStore = create<FeedCacheState>()(
  persist(
    (set, get) => ({
      profiles: {},
      posts: [],
      updatedAt: 0,
      feedOwnerId: null,

      getProfile: (id) => {
        if (!id) return null;
        return get().profiles[id] ?? null;
      },

      setProfiles: (profiles) => {
        if (!profiles || profiles.length === 0) return;
        set((state) => ({
          profiles: indexProfiles(state.profiles, profiles),
          updatedAt: Date.now(),
        }));
      },

      setPosts: (posts, ownerId) => {
        if (!posts) return;
        const trimmed = posts.slice(0, MAX_POSTS).map((p) => ({
          id: p.id,
          author_id: p.author_id,
          creator_id: p.creator_id,
          created_at: p.created_at,
          // não persistimos blobs grandes — só o essencial p/ shell
          username: (p as any).username,
          name: (p as any).name,
          avatar_url: (p as any).avatar_url,
          content: (p as any).content,
          content_text: (p as any).content_text,
          media_url: (p as any).media_url,
          thumbnail_url: (p as any).thumbnail_url,
          preview_url: (p as any).preview_url,
          media_type: (p as any).media_type,
          is_adult: (p as any).is_adult === true,
          privacy_level: (p as any).privacy_level ?? 'public',
          is_locked: (p as any).is_locked ?? false,
          is_paid: (p as any).is_paid ?? false,
          likes_count: (p as any).likes_count ?? 0,
          comments_count: (p as any).comments_count ?? 0,
          author: (p as any).author,
        }));
        set({
          posts: trimmed,
          feedOwnerId: ownerId ?? get().feedOwnerId,
          updatedAt: Date.now(),
        });
      },

      getPostsSnapshot: (ownerId) => {
        const state = get();
        if (!state.posts?.length) return [];
        if (Date.now() - state.updatedAt > TTL_MS) return [];
        if (ownerId && state.feedOwnerId && state.feedOwnerId !== ownerId) {
          return [];
        }
        return state.posts;
      },

      clear: () =>
        set({ profiles: {}, posts: [], updatedAt: 0, feedOwnerId: null }),
    }),
    {
      name: "oculto:feed-cache:v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        profiles: state.profiles,
        posts: state.posts,
        updatedAt: state.updatedAt,
        feedOwnerId: state.feedOwnerId,
      }),
      version: 2,
    },
  ),
);

// ---------------------------------------------------------------------------
// Sincronização cross-tab: quando outra aba grava no localStorage (curtidas,
// salvos, novos posts etc.), reidratamos o store desta aba para refletir sem
// precisar recarregar. Zustand `persist` não faz isso automaticamente.
// ---------------------------------------------------------------------------
if (typeof window !== "undefined") {
  const STORAGE_KEY = "oculto:feed-cache:v2";
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      (useFeedCacheStore as any).persist?.rehydrate?.();
    } catch {
      // silencioso — cross-tab sync é best-effort
    }
  });
}
