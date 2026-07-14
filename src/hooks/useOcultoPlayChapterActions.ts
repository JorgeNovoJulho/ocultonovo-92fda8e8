/**
 * useOcultoPlayChapterActions — Etapa 47
 *
 * Mutations para CRUD de capítulos de um item do Oculto Play
 * (RPCs oculto_play_upsert_chapter / oculto_play_delete_chapter).
 * Invalida o cache do hook useOcultoPlayChapters reaproveitando
 * uma chave estável por item.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import type { PlayDbChapter } from '@/hooks/useOcultoPlayChapters';

export function useOcultoPlayChapterActions(itemId: string | null | undefined) {
  const [busy, setBusy] = useState(false);

  const list = useCallback(async (): Promise<PlayDbChapter[]> => {
    if (!itemId) return [];
    const { data, error } = await supabase.rpc('oculto_play_list_chapters', { p_item_id: itemId });
    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => ({
      id: String(r.id),
      start: Number(r.position_seconds) || 0,
      end: r.end_seconds != null ? Number(r.end_seconds) : null,
      label: String(r.label ?? ''),
      kind: (r.kind ?? 'chapter') as PlayDbChapter['kind'],
    }));
  }, [itemId]);

  const upsert = useCallback(async (input: {
    id?: string | null;
    position_seconds: number;
    end_seconds?: number | null;
    label?: string;
    kind?: PlayDbChapter['kind'];
  }) => {
    if (!itemId) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('oculto_play_upsert_chapter', {
        p_id: input.id ?? null,
        p_item_id: itemId,
        p_position_seconds: input.position_seconds,
        p_end_seconds: input.end_seconds ?? null,
        p_label: input.label ?? '',
        p_kind: input.kind ?? 'chapter',
      });
      if (error) { toast.error('Erro ao salvar capítulo'); return null; }
      toast.success('Capítulo salvo');
      return data as string;
    } finally { setBusy(false); }
  }, [itemId]);

  const remove = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('oculto_play_delete_chapter', { p_id: id });
      if (error) { toast.error('Erro ao remover'); return false; }
      toast.success('Capítulo removido');
      return true;
    } finally { setBusy(false); }
  }, []);

  return { list, upsert, remove, busy };
}
