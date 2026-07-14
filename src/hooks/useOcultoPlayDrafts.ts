/**
 * useOcultoPlayDrafts — Etapa 13
 *
 * Rascunhos + agendamento de itens do OCULTO PLAY.
 * Tudo via RPC SECURITY DEFINER no Supabase externo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import type {
  OcultoPlayKind, OcultoPlaySection, OcultoPlayVisibility,
} from './useOcultoPlayContent';

export interface OcultoPlayDraft {
  id: string;
  kind: OcultoPlayKind;
  section: OcultoPlaySection;
  visibility: OcultoPlayVisibility;
  title: string | null;
  caption: string | null;
  media_url: string | null;
  thumb_url: string | null;
  audio_url: string | null;
  tags: string[];
  is_draft: boolean;
  is_published: boolean;
  scheduled_for: string | null;
  schedule_error: string | null;
  created_at: string;
}

const KEY = ['oculto-play', 'drafts'] as const;

export function useOcultoPlayDrafts(enabled = true) {
  return useQuery<OcultoPlayDraft[]>({
    queryKey: KEY,
    enabled,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_my_drafts', { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as OcultoPlayDraft[];
    },
  });
}

export function useOcultoPlayDraftActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
  };

  const saveDraft = useMutation({
    mutationFn: async (input: {
      kind: OcultoPlayKind;
      section: OcultoPlaySection;
      visibility: OcultoPlayVisibility;
      title?: string | null;
      caption?: string | null;
      media_url?: string | null;
      thumb_url?: string | null;
      audio_url?: string | null;
      tags?: string[] | null;
      scheduled_for?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('oculto_play_save_draft', {
        p_kind: input.kind,
        p_section: input.section,
        p_visibility: input.visibility,
        p_title: input.title ?? null,
        p_caption: input.caption ?? null,
        p_media_url: input.media_url ?? null,
        p_thumb_url: input.thumb_url ?? null,
        p_audio_url: input.audio_url ?? null,
        p_tags: input.tags ?? null,
        p_scheduled_for: input.scheduled_for ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao salvar.'),
  });

  const publishNow = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.rpc('oculto_play_publish_draft', { p_item_id: itemId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Publicado no PLAY!'); },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao publicar.'),
  });

  const schedule = useMutation({
    mutationFn: async (input: { itemId: string; when: Date }) => {
      const { data, error } = await supabase.rpc('oculto_play_schedule_item', {
        p_item_id: input.itemId,
        p_when: input.when.toISOString(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Agendado.'); },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao agendar.'),
  });

  const cancelSchedule = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.rpc('oculto_play_cancel_schedule', { p_item_id: itemId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Agendamento cancelado.'); },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao cancelar.'),
  });

  const remove = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('oculto_play_items').delete().eq('id', itemId);
      if (error) throw error;
      return itemId;
    },
    onSuccess: () => { invalidate(); toast.success('Removido.'); },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao remover.'),
  });

  return { saveDraft, publishNow, schedule, cancelSchedule, remove };
}
