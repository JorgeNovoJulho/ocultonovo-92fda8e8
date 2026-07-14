/**
 * useViewedMatches - tracks which match IDs have been seen/clicked
 * Persists in localStorage. Counter shows only NEW (unseen) matches.
 */
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'viewed_match_ids';

function getStoredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage errors
  }
}

export function useViewedMatches(allMatchIds: string[]) {
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => getStoredIds());

  // When new matches come in, don't auto-mark them — keep the badge alive
  const unviewedCount = allMatchIds.filter(id => !viewedIds.has(id)).length;

  const markAsViewed = useCallback((id: string) => {
    setViewedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      persistIds(next);
      return next;
    });
  }, []);

  const markAllViewed = useCallback(() => {
    const next = new Set(allMatchIds);
    persistIds(next);
    setViewedIds(next);
  }, [allMatchIds]);

  return { unviewedCount, markAsViewed, markAllViewed, viewedIds };
}
