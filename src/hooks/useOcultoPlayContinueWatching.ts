/**
 * useOcultoPlayContinueWatching — Etapa 33
 *
 * Lista a fila "Continuar Assistindo" e expõe um `saveProgress` para
 * persistir o ponto de reprodução do usuário em qualquer item Play.
 *
 * Tabela: oculto_play_playback_progress (RLS por user_id)
 * RPCs:   oculto_play_continue_watching_list, oculto_play_save_progress
 */
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface ContinueWatchingItem {
  item_id: string;
  kind: string;
  title: string | null;
  thumb_url: string | null;
  media_url: string | null;
  author_id: string | null;
  progress_seconds: number;
  duration_seconds: number | null;
  progress_ratio: number | null;
  updated_at: string;
}

export function useOcultoPlayContinueWatching(opts?: { limit?: number; enabled?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const limit = opts?.limit ?? 24;
  const enabled = (opts?.enabled ?? true) && !!user;

  const query = useQuery({
    queryKey: ['oculto-play-continue-watching', user?.id, limit],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ContinueWatchingItem[]> => {
      const { data, error } = await supabase.rpc('oculto_play_continue_watching_list', {
        p_limit: limit,
      });
      if (error) {
        console.warn('[useOcultoPlayContinueWatching] list error', error);
        return [];
      }
      return (data ?? []) as ContinueWatchingItem[];
    },
  });

  const remove = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error('Faça login.');
      const { error } = await (supabase as any)
        .from('oculto_play_playback_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play-continue-watching', user?.id] });
      toast.success('Removido da fila');
    },
    onError: (e: any) =>
      toast.error('Não foi possível remover', { description: e?.message }),
  });

  /** Marca como concluído (sai automaticamente da lista). */
  const markCompleted = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error('Faça login.');
      const { error } = await supabase.rpc('oculto_play_save_progress', {
        p_item_id: itemId,
        p_progress_seconds: 0,
        p_duration_seconds: null,
        p_completed: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play-continue-watching', user?.id] });
      toast.success('Marcado como assistido');
    },
    onError: (e: any) =>
      toast.error('Erro ao marcar como assistido', { description: e?.message }),
  });

  /** Reinicia o progresso (apaga registro — começa do zero na próxima play). */
  const resetProgress = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error('Faça login.');
      const { error } = await (supabase as any)
        .from('oculto_play_playback_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play-continue-watching', user?.id] });
      toast.success('Progresso reiniciado', {
        description: 'A próxima reprodução começa do início.',
      });
    },
    onError: (e: any) =>
      toast.error('Erro ao reiniciar', { description: e?.message }),
  });

  const saveProgress = useCallback(
    async (params: {
      itemId: string;
      progressSeconds: number;
      durationSeconds?: number | null;
      completed?: boolean;
    }) => {
      if (!user?.id) return;
      const { error } = await supabase.rpc('oculto_play_save_progress', {
        p_item_id: params.itemId,
        p_progress_seconds: Math.max(0, Math.floor(params.progressSeconds)),
        p_duration_seconds: params.durationSeconds ?? null,
        p_completed: params.completed ?? null,
      });
      if (error) {
        console.warn('[useOcultoPlayContinueWatching] save error', error);
        return;
      }
      qc.invalidateQueries({ queryKey: ['oculto-play-continue-watching', user?.id] });
    },
    [user?.id, qc],
  );

  const progressMap = new Map<string, { progressSeconds: number; durationSeconds: number | null; ratio: number | null }>();
  (query.data ?? []).forEach((it) => {
    progressMap.set(it.item_id, {
      progressSeconds: Number(it.progress_seconds) || 0,
      durationSeconds: it.duration_seconds != null ? Number(it.duration_seconds) : null,
      ratio: it.progress_ratio != null ? Number(it.progress_ratio) : null,
    });
  });

  return { ...query, remove, markCompleted, resetProgress, saveProgress, progressMap };
}


/**
 * Salva progresso via RPC (sem React Query). Usado pelos handlers do <video>.
 */
async function persistProgress(params: {
  itemId: string;
  progressSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
}) {
  try {
    await supabase.rpc('oculto_play_save_progress', {
      p_item_id: params.itemId,
      p_progress_seconds: Math.max(0, Math.floor(params.progressSeconds)),
      p_duration_seconds: params.durationSeconds,
      p_completed: params.completed,
    });
  } catch (e) {
    console.warn('[persistProgress] error', e);
  }
}

/**
 * Hook leve para anexar autosave de progresso a um <video>.
 * - timeupdate: throttle 5s (após 6s de reprodução).
 * - pause/ended: salva IMEDIATAMENTE (sem throttle, sem gate de tempo).
 * - visibilitychange/pagehide: flush imediato se o vídeo já tocou >2s.
 */
export function usePlaybackProgressAutoSave(itemId: string | null | undefined) {
  return useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || !itemId) return;
      if (el.dataset.ocultoPlayBound === itemId) return;
      el.dataset.ocultoPlayBound = itemId;

      let lastSent = 0;
      let lastToast = 0;
      const flushToast = (msg: string, desc?: string) => {
        const now = Date.now();
        if (now - lastToast < 4000) return;
        lastToast = now;
        toast(msg, desc ? { description: desc } : undefined);
      };
      const flush = (completed = false, reason: 'time' | 'pause' | 'ended' | 'hide' = 'time') => {
        if (el.currentTime < 2 && !completed) return;
        persistProgress({
          itemId,
          progressSeconds: completed && isFinite(el.duration) ? el.duration : el.currentTime,
          durationSeconds: isFinite(el.duration) ? el.duration : null,
          completed,
        });
        if (reason === 'pause') flushToast('Progresso salvo', 'Você pode continuar de onde parou.');
        else if (reason === 'ended') flushToast('Marcado como assistido');
        else if (reason === 'hide') flushToast('Progresso salvo automaticamente');
      };

      const onTime = () => {
        const now = Date.now();
        if (now - lastSent < 5000) return;
        if (el.currentTime < 6) return; // só entra na fila após 6s
        lastSent = now;
        flush(false, 'time');
      };
      const onPause = () => flush(false, 'pause');
      const onEnded = () => flush(true, 'ended');
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') flush(false, 'hide');
      };
      const onPageHide = () => flush(false, 'hide');

      el.addEventListener('timeupdate', onTime);
      el.addEventListener('pause', onPause);
      el.addEventListener('ended', onEnded);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);

      // cleanup ao remover do DOM
      const mo = new MutationObserver(() => {
        if (!document.body.contains(el)) {
          flush(false);
          el.removeEventListener('timeupdate', onTime);
          el.removeEventListener('pause', onPause);
          el.removeEventListener('ended', onEnded);
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('pagehide', onPageHide);
          mo.disconnect();
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    },
    [itemId],
  );
}



