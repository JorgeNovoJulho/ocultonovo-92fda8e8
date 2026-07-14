/**
 * Social Universe — feed barrel.
 * Onda B: apenas namespace estável. Não move feed atual. Onda C unificará
 * RealFeed/SpyFeedPage via `mode: 'normal' | 'spy'`.
 */
export const FEED_MODES = ['normal', 'spy'] as const;
export type FeedMode = (typeof FEED_MODES)[number];
