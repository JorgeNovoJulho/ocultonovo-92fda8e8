/**
 * useOcultoPlayModeration — Etapa 5.
 *
 * Fila de denúncias + estatísticas do OCULTO PLAY (apenas Master Admin).
 * Tudo passa pelas RPCs com SECURITY DEFINER (`oculto_play_pending_reports`,
 * `oculto_play_review_report`, `oculto_play_admin_stats`) — nenhuma leitura
 * direta de tabelas.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export type OcultoPlayReportRow = {
  report_id: string;
  item_id: string;
  reporter_id: string;
  reporter_username: string | null;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed' | 'removed';
  created_at: string;
  item_kind: string | null;
  item_title: string | null;
  item_caption: string | null;
  item_media_url: string | null;
  item_thumb_url: string | null;
  item_visibility: string | null;
  item_is_published: boolean | null;
  item_report_count: number | null;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
};

export type OcultoPlayReviewAction = 'dismiss' | 'remove' | 'remove_purge';

const REPORTS_KEY = (status: string) => ['oculto-play', 'reports', status] as const;
const STATS_KEY = ['oculto-play', 'admin-stats'] as const;

export function useOcultoPlayPendingReports(status: 'pending' | 'all' | 'dismissed' | 'removed' = 'pending') {
  return useQuery<OcultoPlayReportRow[]>({
    queryKey: REPORTS_KEY(status),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_pending_reports', {
        p_status: status,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as OcultoPlayReportRow[];
    },
  });
}

export function useOcultoPlayAdminStats() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: STATS_KEY,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_admin_stats');
      if (error) throw error;
      return (data ?? {}) as Record<string, number | boolean>;
    },
  });

  // Realtime: invalida ao detectar mudança em tabelas relacionadas.
  useEffect(() => {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: STATS_KEY });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'config'] });
    };
    const ch = supabase
      .channel('oculto-play-admin-stats-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oculto_play_items' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oculto_play_reports' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oculto_play_config' }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return query;
}

export function useOcultoPlayReviewReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: string; action: OcultoPlayReviewAction }) => {
      const { data, error } = await supabase.rpc('oculto_play_review_report', {
        p_report_id: input.reportId,
        p_action: input.action,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'reports'] });
      qc.invalidateQueries({ queryKey: STATS_KEY });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
    },
  });
}
