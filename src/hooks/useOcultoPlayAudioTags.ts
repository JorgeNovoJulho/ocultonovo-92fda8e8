/**
 * useOcultoPlayAudioTags — catálogo global de tags de áudio (gênero/IA).
 * Compartilhado entre todos os usuários, persistido no Supabase externo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export type AudioTagKind = 'genre' | 'ai';

export interface AudioTag {
  id: string;
  name: string;
  slug: string;
  kind: AudioTagKind;
  usage_count: number;
  is_preset: boolean;
  created_at: string;
}

export function useOcultoPlayAudioTags(kind: AudioTagKind) {
  return useQuery<AudioTag[]>({
    queryKey: ['oculto-play', 'audio-tags', kind],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_play_audio_tags')
        .select('*')
        .eq('kind', kind)
        .order('is_preset', { ascending: false })
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AudioTag[];
    },
  });
}

export function useUpsertAudioTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; kind: AudioTagKind }) => {
      const { data, error } = await supabase.rpc('oculto_play_upsert_audio_tag', {
        p_name: input.name,
        p_kind: input.kind,
      });
      if (error) throw error;
      return data as AudioTag;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'audio-tags', vars.kind] });
    },
  });
}

export async function bumpAudioTagUsage(kind: AudioTagKind, slugs: string[]) {
  if (!slugs.length) return;
  try {
    await supabase.rpc('oculto_play_bump_audio_tags', { p_kind: kind, p_slugs: slugs });
  } catch {
    /* noop */
  }
}
