/**
 * useOcultoPlayTracks — Etapa 37
 *
 * CRUD de tracks (.vtt) de legendas/capítulos por item do OCULTO PLAY.
 * Tudo via RPC no Supabase EXTERNO. Upload do .vtt vai pro bucket
 * `oculto-play-media`, na pasta `<userId>/tracks/`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type PlayTrackKind = 'subtitles' | 'captions' | 'chapters';

export interface PlayTrack {
  id: string;
  item_id: string;
  kind: PlayTrackKind;
  lang: string;
  label: string;
  vtt_url: string;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
}

function isSubtitleFile(file: File): boolean {
  return /\.(vtt|srt)$/i.test(file.name) || /^(text\/vtt|application\/x-subrip|text\/plain)$/i.test(file.type || '');
}

export function convertSrtToVtt(input: string): string {
  const clean = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/^WEBVTT\b/i.test(clean.trimStart())) return clean;

  const lines = clean.split('\n');
  const out: string[] = ['WEBVTT', ''];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    if (/^\s*\d+\s*$/.test(line) && /-->/.test(next)) continue;
    out.push(
      /-->/.test(line)
        ? line.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, (_m, t, ms) => `${t}.${String(ms).padEnd(3, '0').slice(0, 3)}`)
        : line,
    );
  }
  return out.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
}

export async function normalizeSubtitleFileToVtt(file: File): Promise<File> {
  if (!isSubtitleFile(file)) throw new Error('Arquivo deve ser .srt ou .vtt');
  const text = await file.text();
  const vtt = /\.srt$/i.test(file.name) ? convertSrtToVtt(text) : convertSrtToVtt(text);
  const base = file.name.replace(/\.(srt|vtt)$/i, '') || 'legenda';
  return new File([vtt], `${base}.vtt`, { type: 'text/vtt' });
}

const KEY = (itemId: string) => ['oculto-play', 'tracks', itemId] as const;

export function usePlayTracks(itemId: string | null | undefined) {
  return useQuery<PlayTrack[]>({
    queryKey: KEY(itemId ?? 'none'),
    enabled: !!itemId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('oculto_play_tracks_list', {
        p_item_id: itemId,
      });
      if (error) throw error;
      return (data ?? []) as PlayTrack[];
    },
  });
}

export function usePlayTrackActions(itemId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => qc.invalidateQueries({ queryKey: KEY(itemId) });

  const upsert = useMutation({
    mutationFn: async (input: {
      id?: string | null;
      kind: PlayTrackKind;
      lang: string;
      label: string;
      vtt_url: string;
      is_default?: boolean;
    }) => {
      const { data, error } = await (supabase as any).rpc('oculto_play_track_upsert', {
        p_id: input.id ?? null,
        p_item_id: itemId,
        p_kind: input.kind,
        p_lang: input.lang,
        p_label: input.label,
        p_vtt_url: input.vtt_url,
        p_is_default: input.is_default ?? false,
      });
      if (error) throw error;
      return data as PlayTrack;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc('oculto_play_track_delete', { p_id: id });
      if (error) throw error;
      return true;
    },
    onSuccess: invalidate,
  });

  async function uploadVtt(file: File): Promise<string> {
    if (!user) throw new Error('Faça login');
    const vttFile = await normalizeSubtitleFileToVtt(file);
    const path = `${user.id}/tracks/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.vtt`;
    const { error } = await supabase.storage
      .from('oculto-play-media')
      .upload(path, vttFile, { upsert: false, contentType: 'text/vtt' });
    if (error) throw error;
    const { data } = supabase.storage.from('oculto-play-media').getPublicUrl(path);
    return data.publicUrl;
  }

  return { upsert, remove, uploadVtt };
}

/**
 * Carrega e faz parse simples de um arquivo VTT de capítulos.
 * Retorna lista de cues { start, end, label }.
 */
export async function fetchChapters(vttUrl: string): Promise<Array<{ start: number; end: number; label: string }>> {
  try {
    const res = await fetch(vttUrl, { cache: 'force-cache' });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const out: Array<{ start: number; end: number; label: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(\d+):(\d+):(\d+)(?:\.(\d+))?\s*-->\s*(\d+):(\d+):(\d+)(?:\.(\d+))?/);
      if (m) {
        const toSec = (h: string, mn: string, s: string, ms?: string) =>
          (+h) * 3600 + (+mn) * 60 + (+s) + (ms ? +`0.${ms}` : 0);
        const start = toSec(m[1], m[2], m[3], m[4]);
        const end = toSec(m[5], m[6], m[7], m[8]);
        const label = (lines[i + 1] || '').trim() || 'Capítulo';
        out.push({ start, end, label });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface CaptionCue { start: number; end: number; text: string }

/**
 * Etapa 42 — Carrega e faz parse de um VTT de legendas/captions.
 * Aceita VTT clássico com múltiplas linhas por cue (junta com \n).
 * Suporta timestamps `mm:ss.ms` ou `hh:mm:ss.ms`.
 */
export async function fetchCaptions(vttUrl: string): Promise<CaptionCue[]> {
  try {
    const res = await fetch(vttUrl, { cache: 'force-cache' });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const re = /(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?\s*-->\s*(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/;
    const toSec = (h: string | undefined, mn: string, s: string, ms?: string) =>
      (h ? +h : 0) * 3600 + (+mn) * 60 + (+s) + (ms ? +`0.${ms}` : 0);

    const out: CaptionCue[] = [];
    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(re);
      if (m) {
        const start = toSec(m[1], m[2], m[3], m[4]);
        const end = toSec(m[5], m[6], m[7], m[8]);
        const buf: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '') {
          buf.push(lines[i].replace(/<[^>]+>/g, '').trim());
          i++;
        }
        const cueText = buf.join('\n').trim();
        if (cueText) out.push({ start, end, text: cueText });
      }
      i++;
    }
    return out;
  } catch {
    return [];
  }
}

