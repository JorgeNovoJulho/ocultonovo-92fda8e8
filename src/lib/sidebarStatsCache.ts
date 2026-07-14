/**
 * sidebarStatsCache — Per-session cache for sidebar counters.
 * Prevents the "flash of zeros" when navigating between pages while
 * react-query reloads/rehydrates. Stored per profile id.
 */
export interface SidebarStatsSnapshot {
  totalFollowers?: number;
  totalFollowing?: number;
  totalPosts?: number;
  totalViews?: number;
  receivedLikes?: number;
  ratingAvg?: number;
  ratingCount?: number;
  auraXp?: number;
  updatedAt: number;
}

const PREFIX = 'oculto:sidebar-stats:';
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readSidebarStats(profileId?: string | null): SidebarStatsSnapshot | null {
  if (!profileId) return null;
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + profileId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SidebarStatsSnapshot;
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSidebarStats(
  profileId: string | null | undefined,
  patch: Partial<Omit<SidebarStatsSnapshot, 'updatedAt'>>
) {
  if (!profileId) return;
  const s = safeStorage();
  if (!s) return;
  try {
    const prev = readSidebarStats(profileId) || ({} as SidebarStatsSnapshot);
    const next: SidebarStatsSnapshot = { ...prev, ...patch, updatedAt: Date.now() };
    s.setItem(PREFIX + profileId, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
