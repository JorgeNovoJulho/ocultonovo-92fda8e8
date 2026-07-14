/**
 * useViewedLikes — rastreia IDs de curtidas já visualizadas (localStorage).
 * O contador no menu lateral mostra apenas curtidas NOVAS (não vistas).
 */
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'viewed_like_ids';

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
    /* noop */
  }
}

export function useViewedLikes(allLikeIds: string[]) {
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => getStoredIds());

  const unviewedCount = allLikeIds.filter((id) => !viewedIds.has(id)).length;

  const markAsViewed = useCallback((id: string) => {
    setViewedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistIds(next);
      return next;
    });
  }, []);

  const markAllViewed = useCallback(() => {
    const next = new Set(allLikeIds);
    persistIds(next);
    setViewedIds(next);
  }, [allLikeIds]);

  return { unviewedCount, markAsViewed, markAllViewed, viewedIds };
}
