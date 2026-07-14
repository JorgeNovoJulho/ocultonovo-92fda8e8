import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export interface AuraRankRow {
  rank: number;
  profile_id: string;
  user_id: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  aura_xp: number;
  aura_level: number;
  aura_streak_days: number;
  achievements_count: number;
  visits_received: number;
  is_self: boolean;
}

export interface AuraMyRank extends AuraRankRow {
  total: number;
}

const MAX_RANK = 100;

/**
 * Top Auras paginado.
 * - View "top10"  → rank 1..10
 * - View "top20"  → rank 1..20
 * - View "paged"  → 20 itens por página a partir de offset 20
 *                   (21..40, 41..60, 61..80, 81..100)
 *
 * Atualiza automaticamente em tempo real conforme usuários ganham XP.
 */
export function useAuraTopRanking(_initialLimit = 10) {
  const [rows, setRows] = useState<AuraRankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<AuraMyRank | null>(null);

  // offset/limit definem a janela atual do ranking.
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(10);

  const debounceRef = useRef<number | null>(null);

  const fetchRanking = useCallback(async (off: number, lim: number) => {
    setLoading(true);
    const [topRes, mineRes] = await Promise.all([
      (supabase as any).rpc('aura_top_ranking', { p_limit: lim, p_offset: off }),
      (supabase as any).rpc('aura_my_rank'),
    ]);
    if (!topRes.error && Array.isArray(topRes.data)) setRows(topRes.data as AuraRankRow[]);
    if (!mineRes.error && Array.isArray(mineRes.data) && mineRes.data[0]) {
      const r = mineRes.data[0];
      setMyRank({ ...r, is_self: true });
    } else {
      setMyRank(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRanking(offset, limit); }, [fetchRanking, offset, limit]);

  // Realtime: qualquer mudança em aura_xp em profiles dispara refresh
  // (debounce 1.5s para não inundar a UI com micro-atualizações).
  useEffect(() => {
    const debounced = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        fetchRanking(offset, limit);
      }, 1500);
    };
    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      const oldXp = payload?.old?.aura_xp ?? null;
      const newXp = payload?.new?.aura_xp ?? null;
      const oldVbs = payload?.old?.voice_bio_score ?? null;
      const newVbs = payload?.new?.voice_bio_score ?? null;
      if (oldXp !== newXp || oldVbs !== newVbs) debounced();
    }, { events: ['UPDATE'] });
    const unsubVoice = subscribeTable('oculto_voice_bio_reactions', () => debounced());
    const unsubQuests = subscribeTable('oculto_aura_daily_quests', () => debounced());
    const unsubVisits = subscribeTable('profile_visits', () => debounced());
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      unsubProfiles();
      unsubVoice();
      unsubQuests();
      unsubVisits();
    };
  }, [fetchRanking, offset, limit]);

  const refresh = useCallback(() => fetchRanking(offset, limit), [fetchRanking, offset, limit]);

  // Helpers de navegação
  const showTop10 = useCallback(() => { setOffset(0); setLimit(10); }, []);
  const showTop20 = useCallback(() => { setOffset(0); setLimit(20); }, []);
  const goToPage = useCallback((pageIdx: number) => {
    // pageIdx: 1 = 21..40, 2 = 41..60, 3 = 61..80, 4 = 81..100
    const safePage = Math.max(1, Math.min(4, pageIdx));
    setOffset(safePage * 20);
    setLimit(20);
  }, []);

  const view: 'top10' | 'top20' | 'paged' =
    offset === 0 && limit === 10 ? 'top10'
    : offset === 0 && limit === 20 ? 'top20'
    : 'paged';

  const pageIdx = offset === 0 ? 0 : Math.floor(offset / 20); // 1..4
  const canGoNext = offset + limit < MAX_RANK;
  const canGoPrev = view === 'paged';

  return {
    rows,
    loading,
    refresh,
    myRank,
    // estado/janela atual
    offset,
    limit,
    view,
    pageIdx,
    canGoNext,
    canGoPrev,
    maxRank: MAX_RANK,
    // navegação
    showTop10,
    showTop20,
    goToPage,
  };
}
