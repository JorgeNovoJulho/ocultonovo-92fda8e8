import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Post, Creator } from '@/data/mockData';

export type PostVisibility = 'public' | 'friends' | 'vip';

interface Subscription {
  creatorId: string;
  subscribedAt: string;
}

export interface PostShareRecord {
  postId: string;
  channel: 'native' | 'clipboard' | 'link';
  sharedAt: string;
}

export interface PostInteractionState {
  liked: boolean;
  disliked: boolean;
  saved: boolean;
  likes: number;
  dislikes: number;
  comments: number;
  saves: number;
  shares: number;
}

interface CreatorEarnings {
  totalRevenue: number;
  activeSubscribers: number;
  platformFee: number;
  pendingWithdraw: number;
  withdrawStatus: 'idle' | 'processing' | 'completed';
}

export type FeedExperienceModeValue = 'adult_only' | 'complete' | 'oculto_only';

interface ViewState {
  viewedPosts: number;
  maxFreePosts: number;
  isPremium: boolean;
  feedSafeBlurOn: boolean;
  revealedAdultPostIds: string[];
  feedExperienceMode: FeedExperienceModeValue | null;
  posts: Post[];
  subscriptions: Subscription[];
  friends: string[];
  creatorEarnings: CreatorEarnings;
  postShares: PostShareRecord[];
  postInteractions: Record<string, PostInteractionState>;
  incrementView: () => void;
  resetViews: () => void;
  setPremium: (value: boolean) => void;
  setFeedSafeBlurOn: (value: boolean) => void;
  toggleFeedSafeBlur: () => boolean;
  revealAdultPost: (postId: string) => void;
  hideAllAdultPosts: () => void;
  isAdultPostRevealed: (postId: string) => boolean;
  setFeedExperienceMode: (value: FeedExperienceModeValue) => void;
  canViewPost: (post: Post, index: number) => boolean;
  addPost: (post: Omit<Post, 'id' | 'creator' | 'likes' | 'comments' | 'shares' | 'isLiked' | 'createdAt'> & { visibility: PostVisibility }) => void;
  toggleLike: (postId: string) => void;
  toggleDislike: (postId: string) => void;
  toggleSave: (postId: string) => void;
  registerShare: (postId: string, channel: PostShareRecord['channel']) => void;
  getInteraction: (post: Post) => PostInteractionState;
  subscribeToCreator: (creatorId: string) => void;
  isSubscribedTo: (creatorId: string) => boolean;
  isFriendWith: (creatorId: string) => boolean;
  requestWithdraw: () => void;
}

const defaultCreator: Creator = {
  id: 'current-user',
  name: 'Usuário',
  handle: '@usuario',
  avatar: '',
  banner: '',
  bio: '',
  isVerified: false,
  followers: 0,
  following: 0,
  posts: 0,
  views: 0,
  recommendations: 0,
  profileType: 'single',
  gender: 'homem',
  location: '',
  isOnline: true,
  interests: [],
  joinDate: '',
};

const SAFE_BLUR_LS_KEY = 'oculto:safeBlurOn';
const LEGACY_SAFE_BLUR_LS_KEY = 'oculto:feed_safe_blur';
const REVEALED_LS_KEY = 'oculto:revealedAdultPostIds';
const FEED_MODE_LS_KEY = 'oculto:feedExperienceMode';

const readFeedExperienceModeFallback = (): FeedExperienceModeValue | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FEED_MODE_LS_KEY);
    return raw === 'adult_only' || raw === 'complete' ? raw : null;
  } catch {
    return null;
  }
};

const writeFeedExperienceModeFallback = (value: FeedExperienceModeValue | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (value === 'adult_only' || value === 'complete') {
      window.localStorage.setItem(FEED_MODE_LS_KEY, value);
    } else {
      window.localStorage.removeItem(FEED_MODE_LS_KEY);
    }
  } catch {
    /* noop */
  }
};

const readSafeBlurFallback = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SAFE_BLUR_LS_KEY);
    if (raw === null) {
      const legacy = window.localStorage.getItem(LEGACY_SAFE_BLUR_LS_KEY);
      if (legacy === null) return true;
      return legacy !== '0' && legacy !== 'false';
    }
    return raw === 'true';
  } catch {
    return true;
  }
};

const writeSafeBlurFallback = (value: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAFE_BLUR_LS_KEY, value ? 'true' : 'false');
    window.localStorage.setItem(LEGACY_SAFE_BLUR_LS_KEY, value ? '1' : '0');
  } catch {
    /* noop */
  }
};

const readRevealedFallback = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REVEALED_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const writeRevealedFallback = (ids: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REVEALED_LS_KEY, JSON.stringify(ids));
  } catch {
    /* noop */
  }
};

export const useViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      viewedPosts: 0,
      maxFreePosts: 20,
      isPremium: false,
      feedSafeBlurOn: readSafeBlurFallback(),
      revealedAdultPostIds: readRevealedFallback(),
      feedExperienceMode: readFeedExperienceModeFallback(),
      posts: [],
      subscriptions: [],
      friends: [],
      creatorEarnings: {
        totalRevenue: 0,
        activeSubscribers: 0,
        platformFee: 0,
        pendingWithdraw: 0,
        withdrawStatus: 'idle',
      },
      postShares: [],
      postInteractions: {},
      getInteraction: (post: Post) => {
        const state = get();
        const existing = state.postInteractions[post.id];
        if (existing) return existing;
        return {
          liked: !!post.isLiked,
          disliked: false,
          saved: false,
          likes: post.likes ?? 0,
          dislikes: 0,
          comments: post.comments ?? 0,
          saves: 0,
          shares: post.shares ?? 0,
        };
      },
      incrementView: () => set((state) => ({ viewedPosts: state.viewedPosts + 1 })),
      resetViews: () => set({ viewedPosts: 0 }),
      setPremium: (value: boolean) => set({ isPremium: value }),
      setFeedSafeBlurOn: (value: boolean) => {
        writeSafeBlurFallback(value);
        if (value) writeRevealedFallback([]);
        set((state) => ({
          feedSafeBlurOn: value,
          revealedAdultPostIds: value ? [] : state.revealedAdultPostIds,
        }));
      },
      toggleFeedSafeBlur: () => {
        const next = !get().feedSafeBlurOn;
        get().setFeedSafeBlurOn(next);
        return next;
      },
      revealAdultPost: (postId: string) => set((state) => {
        if (!postId || state.revealedAdultPostIds.includes(postId)) return state;
        const nextIds = [...state.revealedAdultPostIds, postId];
        writeRevealedFallback(nextIds);
        return { revealedAdultPostIds: nextIds };
      }),
      hideAllAdultPosts: () => {
        writeRevealedFallback([]);
        set({ revealedAdultPostIds: [] });
      },
      setFeedExperienceMode: (value: FeedExperienceModeValue) => {
        writeFeedExperienceModeFallback(value);
        set({ feedExperienceMode: value });
      },
      isAdultPostRevealed: (postId: string) => get().revealedAdultPostIds.includes(postId),
      canViewPost: (post: Post, index: number) => {
        const state = get();
        const visibility = (post as any).visibility as PostVisibility | undefined;
        if (visibility === 'vip') return state.isSubscribedTo(post.creator.id);
        if (visibility === 'friends') return state.isFriendWith(post.creator.id);
        return state.isPremium || index < state.maxFreePosts;
      },
      addPost: (newPost) => {
        const post: Post = {
          id: `post-${Date.now()}`,
          creator: defaultCreator,
          type: newPost.type,
          content: newPost.content,
          mediaUrl: newPost.mediaUrl,
          is_adult: newPost.is_adult === true,
          linkPreview: newPost.linkPreview,
          likes: 0,
          comments: 0,
          shares: 0,
          isLiked: false,
          createdAt: 'Agora',
        };
        set((state) => ({
          posts: [{ ...post, visibility: newPost.visibility } as Post, ...state.posts]
        }));
      },
      toggleLike: (postId: string) => {
        set((state) => {
          const current = state.postInteractions[postId] ?? {
            liked: false, disliked: false, saved: false,
            likes: 0, dislikes: 0, comments: 0, saves: 0, shares: 0,
          };
          const wasLiked = current.liked;
          // Mutual exclusivity: liking removes dislike
          const next: PostInteractionState = {
            ...current,
            liked: !wasLiked,
            disliked: false,
            likes: wasLiked ? Math.max(0, current.likes - 1) : current.likes + 1,
            dislikes: current.disliked ? Math.max(0, current.dislikes - 1) : current.dislikes,
          };
          return {
            postInteractions: { ...state.postInteractions, [postId]: next },
            posts: state.posts.map((p) =>
              p.id === postId ? { ...p, isLiked: next.liked, likes: next.likes } : p
            ),
          };
        });
      },
      toggleDislike: (postId: string) => {
        set((state) => {
          const current = state.postInteractions[postId] ?? {
            liked: false, disliked: false, saved: false,
            likes: 0, dislikes: 0, comments: 0, saves: 0, shares: 0,
          };
          const wasDisliked = current.disliked;
          const next: PostInteractionState = {
            ...current,
            disliked: !wasDisliked,
            liked: false,
            dislikes: wasDisliked ? Math.max(0, current.dislikes - 1) : current.dislikes + 1,
            likes: current.liked ? Math.max(0, current.likes - 1) : current.likes,
          };
          return {
            postInteractions: { ...state.postInteractions, [postId]: next },
          };
        });
      },
      toggleSave: (postId: string) => {
        set((state) => {
          const current = state.postInteractions[postId] ?? {
            liked: false, disliked: false, saved: false,
            likes: 0, dislikes: 0, comments: 0, saves: 0, shares: 0,
          };
          const wasSaved = current.saved;
          const next: PostInteractionState = {
            ...current,
            saved: !wasSaved,
            saves: wasSaved ? Math.max(0, current.saves - 1) : current.saves + 1,
          };
          return {
            postInteractions: { ...state.postInteractions, [postId]: next },
          };
        });
      },
      registerShare: (postId: string, channel: PostShareRecord['channel']) => {
        set((state) => {
          const current = state.postInteractions[postId] ?? {
            liked: false, disliked: false, saved: false,
            likes: 0, dislikes: 0, comments: 0, saves: 0, shares: 0,
          };
          const next: PostInteractionState = {
            ...current,
            shares: current.shares + 1,
          };
          return {
            postShares: [
              ...state.postShares,
              { postId, channel, sharedAt: new Date().toISOString() },
            ],
            postInteractions: { ...state.postInteractions, [postId]: next },
          };
        });
      },
      subscribeToCreator: (creatorId: string) => {
        set((state) => {
          const alreadySubscribed = state.subscriptions.some(s => s.creatorId === creatorId);
          if (alreadySubscribed) return state;
          return {
            subscriptions: [...state.subscriptions, { creatorId, subscribedAt: new Date().toISOString() }],
          };
        });
      },
      isSubscribedTo: (creatorId: string) => {
        return get().subscriptions.some(s => s.creatorId === creatorId);
      },
      isFriendWith: (creatorId: string) => {
        return get().friends.includes(creatorId);
      },
      requestWithdraw: () => {
        set((state) => ({
          creatorEarnings: {
            ...state.creatorEarnings,
            withdrawStatus: 'processing',
          },
        }));
      },
    }),
    {
      name: 'oculto-view-storage',
      partialize: (state) => ({
        viewedPosts: state.viewedPosts,
        isPremium: state.isPremium,
        feedSafeBlurOn: state.feedSafeBlurOn,
        revealedAdultPostIds: state.revealedAdultPostIds,
        feedExperienceMode: state.feedExperienceMode,
        subscriptions: state.subscriptions,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Reconcilia fallback do localStorage com o estado hidratado do Zustand
        writeSafeBlurFallback(state.feedSafeBlurOn);
        writeRevealedFallback(state.revealedAdultPostIds ?? []);
        writeFeedExperienceModeFallback(state.feedExperienceMode ?? null);
      },
    }
  )
);
