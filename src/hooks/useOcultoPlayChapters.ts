/**
 * useOcultoPlayChapters — Etapa 46
 *
 * Carrega capítulos persistidos no banco para um item do Oculto Play
 * (RPC oculto_play_list_chapters). Retorna lista normalizada já no
 * formato { start, end, label, kind } pronta para o player.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export type PlayDbChapter = {
  id: string;
  start: number;
  end: number | null;
  label: string;
  kind: 'intro' | 'recap' | 'chapter' | 'highlight' | 'outro';
};

export function useOcultoPlayChapters(itemId: string | null | undefined) {
  const [data, setData] = useState<PlayDbChapter[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!itemId) { setData([]); return; }
    setLoading(true);
    supabase
      .rpc('oculto_play_list_chapters', { p_item_id: itemId })
      .then(({ data: rows, error }) => {
        if (!alive) return;
        if (error || !Array.isArray(rows)) { setData([]); setLoading(false); return; }
        const mapped: PlayDbChapter[] = rows.map((r: any) => ({
          id: String(r.id),
          start: Number(r.position_seconds) || 0,
          end: r.end_seconds != null ? Number(r.end_seconds) : null,
          label: String(r.label ?? ''),
          kind: (r.kind ?? 'chapter') as PlayDbChapter['kind'],
        }));
        setData(mapped);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [itemId]);

  return { data, loading };
}
