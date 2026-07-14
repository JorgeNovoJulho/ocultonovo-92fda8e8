/**
 * useMiningMessageXp — XP total acumulado por mensagem em uma sala de mineração.
 *
 * Soma TODAS as formas de pontuar associadas a um message_id:
 * per_quality_message + receive_like + receive_reaction + reply_mention +
 * receive_pulse + receive_highlight. Valores negativos (dislike) são
 * clamp-zerados na agregação (mostrador positivo).
 *
 * Estratégia em duas camadas (anti-Realme C55):
 *  1) Fetch inicial em lote via RPC aura_room_mining_message_xp(slug, ids[]).
 *  2) Increment otimista via evento local MINING_MSG_XP_UPDATE (do próprio actor)
 *     + polling leve a cada 10s, pausado quando a aba fica oculta, para capturar
 *     XP gerado por OUTROS usuários sem precisar relaxar RLS do ledger.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

interface UpdateDetail {
  slug: string;
  messageId: string;
  delta: number;
}

const POLL_INTERVAL_MS = 10_000;
const INITIAL_DEBOUNCE_MS = 250;

export function useMiningMessageXp(slug: string | null | undefined, messageIds: string[]) {
  const [map, setMap] = useState<Record<string, number>>({});
  const idsKey = useMemo(() => messageIds.slice().sort().join('|'), [messageIds]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const visibleRef = useRef(typeof document !== 'undefined' ? !document.hidden : true);

  const fetchBatch = useCallback(
    async (ids: string[]) => {
      if (!slug || ids.length === 0) return;
      const { data, error } = await (supabase as any).rpc('aura_room_mining_message_xp', {
        p_slug: slug,
        p_message_ids: ids,
      });
      if (error || !Array.isArray(data)) return;
      setMap((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{ message_id: string; total_xp: number }>) {
          if (row?.message_id != null) next[row.message_id] = row.total_xp || 0;
        }
        // Zera ids consultados que não voltaram (sem créditos ainda)
        for (const id of ids) if (next[id] == null) next[id] = 0;
        return next;
      });
    },
    [slug],
  );

  // Fetch inicial e quando muda a lista de ids visíveis (debounced).
  useEffect(() => {
    if (!slug) return;
    const ids = idsKey ? idsKey.split('|').filter(Boolean) : [];
    if (ids.length === 0) return;
    // Só busca ids ainda não conhecidos para não inundar a rede.
    const fresh = ids.filter((id) => !knownIdsRef.current.has(id));
    fresh.forEach((id) => knownIdsRef.current.add(id));
    const target = fresh.length > 0 ? fresh : ids;
    const t = window.setTimeout(() => { fetchBatch(target); }, INITIAL_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [slug, idsKey, fetchBatch]);

  // Increment local (otimista) quando o próprio cliente premia XP.
  useEffect(() => {
    if (!slug) return;
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<UpdateDetail>).detail;
      if (!detail || detail.slug !== slug || !detail.messageId) return;
      if (!detail.delta || detail.delta <= 0) return;
      setMap((prev) => ({
        ...prev,
        [detail.messageId]: (prev[detail.messageId] ?? 0) + detail.delta,
      }));
    };
    window.addEventListener('MINING_MSG_XP_UPDATE', onUpdate);
    return () => window.removeEventListener('MINING_MSG_XP_UPDATE', onUpdate);
  }, [slug]);

  // Polling leve (visibility-aware) para capturar XP gerado por outros usuários.
  useEffect(() => {
    if (!slug) return;
    const onVis = () => { visibleRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    const interval = window.setInterval(() => {
      if (!visibleRef.current) return;
      const ids = idsKey ? idsKey.split('|').filter(Boolean) : [];
      if (ids.length === 0) return;
      // Limita a 60 ids por poll para não pesar
      fetchBatch(ids.slice(-60));
    }, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(interval);
    };
  }, [slug, idsKey, fetchBatch]);

  return map;
}
