/**
 * useOcultoPlayAutoModeration — Etapa 10
 *
 * Fila de itens auto-ocultos por volume de denúncias (Master only).
 * Tudo via RPCs SECURITY DEFINER no externo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export type OcultoPlayAutoHiddenAction = 'restore' | 'keep_hidden' | 'purge';

export interface OcultoPlayAutoHiddenRow {
  item_id: string;
  kind: string;
  title: string | null;
  caption: string | null;
  thumb_url: string | null;
  media_url: string | null;
  visibility: string | null;
  is_published: boolean;
  report_count: number | null;
  auto_hidden_at: string;
  auto_hidden_reason: string | null;
  auto_hidden_count: number | null;
  pending_reports: number;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
}

const LIST_KEY = ['oculto-play', 'auto-hidden'] as const;

export function useOcultoPlayAutoHidden() {
  return useQuery<OcultoPlayAutoHiddenRow[]>({
    queryKey: LIST_KEY,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_auto_hidden_list', { p_limit: 100 });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        pending_reports: Number(r.pending_reports ?? 0),
      })) as OcultoPlayAutoHiddenRow[];
    },
  });
}

export function useOcultoPlayAutoHiddenDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; action: OcultoPlayAutoHiddenAction }) => {
      const { data, error } = await supabase.rpc('oculto_play_auto_hidden_decide', {
        p_item_id: input.itemId,
        p_action: input.action,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'reports'] });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'admin-stats'] });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
    },
  });
}
