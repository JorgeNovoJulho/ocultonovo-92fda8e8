/**
 * useOcultoPlayTimelineReactions — Etapa 49
 *
 * Carrega reações agregadas (RPC oculto_play_list_timeline_reactions)
 * e expõe `addReaction` para gravar emoji no timestamp atual do player.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface TimelineReactionAgg {
  position_seconds: number;
  emoji: string;
  qty: number;
}

export function useOcultoPlayTimelineReactions(itemId: string | null | undefined) {
  const [data, setData] = useState<TimelineReactionAgg[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!itemId) { setData([]); return; }
    setLoading(true);
    const { data: rows, error } = await supabase.rpc(
      'oculto_play_list_timeline_reactions',
      { p_item_id: itemId },
    );
    if (error || !Array.isArray(rows)) { setData([]); setLoading(false); return; }
    setData(rows.map((r: any) => ({
      position_seconds: Number(r.position_seconds) || 0,
      emoji: String(r.emoji ?? '❤️'),
      qty: Number(r.qty) || 1,
    })));
    setLoading(false);
  }, [itemId]);

  useEffect(() => { reload(); }, [reload]);

  const addReaction = useCallback(async (positionSeconds: number, emoji: string) => {
    if (!itemId) return false;
    const { error } = await supabase.rpc('oculto_play_add_timeline_reaction', {
      p_item_id: itemId,
      p_position_seconds: positionSeconds,
      p_emoji: emoji,
    });
    if (error) return false;
    // otimismo: adiciona local imediatamente
    setData(prev => {
      const bucket = Math.floor(positionSeconds / 2) * 2;
      const idx = prev.findIndex(p => p.position_seconds === bucket && p.emoji === emoji);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { position_seconds: bucket, emoji, qty: 1 }]
        .sort((a, b) => a.position_seconds - b.position_seconds);
    });
    return true;
  }, [itemId]);

  return { data, loading, reload, addReaction };
}
