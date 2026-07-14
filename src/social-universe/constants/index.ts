/**
 * Social Universe — constants compartilhadas.
 * - Query keys padronizadas (React Query) para cache compartilhado.
 * - Stale times unificados.
 */

export const SU_QUERY_KEYS = {
  identity: (userId?: string | null) => ['social-identity', userId ?? 'me'] as const,
  prestigeLevels: () => ['social-prestige-levels'] as const,
  auraDashboard: (userId?: string | null) => ['aura-dashboard', userId ?? 'me'] as const,
  auraRooms: () => ['aura-rooms-list'] as const,
  roomMetrics: () => ['aura-rooms-metrics'] as const,
  onlineCount: () => ['online-count-real'] as const,
  feedLive: (cursor?: string) => ['feed-live', cursor ?? 'top'] as const,
  matchSignals: (userId?: string | null) => ['match-signals', userId ?? 'me'] as const,
  socialAnalytics: (range: string) => ['social-analytics', range] as const,
} as const;

export const SU_STALE = {
  identity: 60_000,
  dashboard: 30_000,
  rooms: 20_000,
  metrics: 15_000,
  online: 15_000,
  feed: 10_000,
} as const;

/** Limites de performance por device profile (alinhado a PerformanceContext). */
export const SU_PERF_LIMITS = {
  low: { glow: false, particles: 0, parallel: 4 },
  mid: { glow: true, particles: 12, parallel: 8 },
  high: { glow: true, particles: 32, parallel: 16 },
} as const;
