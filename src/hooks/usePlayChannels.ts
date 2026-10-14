/**
 * Canais Play — dados de canais (Fase 1).
 *
 * Tudo passa pelas funções do banco (play_channel_*), que aplicam as regras:
 * 1 canal de vídeo + 1 de áudio por usuário, endereço único, troca de
 * endereço a cada 30 dias, +18 só para verificados.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { normalizeOcultoPlayItem, type OcultoPlayItem } from '@/hooks/useOcultoPlayContent';

export type PlayChannelKind = 'video' | 'audio';

export interface PlayChannel {
  id: string;
  owner_id: string;
  profile_id: string | null;
  kind: PlayChannelKind;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  is_official: boolean;
  status: 'active' | 'suspended';
  subscriber_count: number;
  created_at: string;
  slug_changed_at: string | null;
}

export interface PlayChannelDetail extends PlayChannel {
  owner_username: string | null;
  owner_avatar_url: string | null;
  owner_is_verified: boolean;
  items_total: number;
  shorts_count: number;
  links_count: number;
  memes_count: number;
  adult_count: number;
  audio_count: number;
  views_total: number;
}

export interface PlayChannelStripItem {
  id: string;
  slug: string;
  name: string;
  kind: PlayChannelKind;
  avatar_url: string | null;
  is_official: boolean;
  item_count: number;
  last_published_at: string | null;
}

/** Seções do Play usadas pela faixa "Canais" e pelas abas do canal. */
export type PlayChannelSection = 'shorts' | 'links' | 'links_adult' | 'memes' | 'audio';

export const PLAY_CHANNELS_KEY = ['play-channels'] as const;

/** Mensagem amigável a partir do erro do banco (as regras já falam português). */
export function channelErrorMessage(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? '';
  if (!msg) return 'Não foi possível concluir. Tente de novo.';
  if (/function .* does not exist|Could not find the function/i.test(msg)) {
    return 'Canais ainda não ativados no servidor (rode o SQL da Fase 1 no Supabase).';
  }
  return msg;
}

export function slugifyChannel(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function useMyPlayChannels() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PLAY_CHANNELS_KEY, 'mine', user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<PlayChannel[]> => {
      const { data, error } = await (supabase as any).rpc('play_my_channels');
      if (error) throw error;
      return (data ?? []) as PlayChannel[];
    },
  });
}

export function usePlayChannelBySlug(slug: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PLAY_CHANNELS_KEY, 'slug', (slug ?? '').toLowerCase()],
    enabled: !!slug && !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<PlayChannelDetail | null> => {
      const { data, error } = await (supabase as any).rpc('play_channel_by_slug', { p_slug: slug });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as PlayChannelDetail | null;
    },
  });
}

export function usePlayChannelsStrip(section: PlayChannelSection | null, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PLAY_CHANNELS_KEY, 'strip', section ?? 'all'],
    enabled: enabled && !!user?.id,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<PlayChannelStripItem[]> => {
      const { data, error } = await (supabase as any).rpc('play_channels_strip', { p_section: section, p_limit: 20 });
      if (error) {
        // Servidor sem a Fase 1 ainda: some com a faixa em silêncio.
        if (/does not exist|Could not find the function/i.test(error.message ?? '')) return [];
        throw error;
      }
      return (data ?? []) as PlayChannelStripItem[];
    },
  });
}

export function usePlayChannelsOf(userOrProfileId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PLAY_CHANNELS_KEY, 'of', userOrProfileId ?? null],
    enabled: !!userOrProfileId && !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<Pick<PlayChannel, 'id' | 'slug' | 'name' | 'kind' | 'is_official'>>> => {
      const { data, error } = await (supabase as any).rpc('play_channels_of', { p_user_or_profile: userOrProfileId });
      if (error) {
        if (/does not exist|Could not find the function/i.test(error.message ?? '')) return [];
        throw error;
      }
      return (data ?? []) as any[];
    },
  });
}

/**
 * Itens de um canal, filtrados pela aba. O servidor devolve também os
 * CONGELADOS quando quem vê é o dono (ou o master).
 */
export function usePlayChannelItems(channel: PlayChannelDetail | null | undefined, tab: PlayChannelSection | 'home') {
  return useQuery({
    queryKey: [...PLAY_CHANNELS_KEY, 'items', channel?.id ?? null, tab],
    enabled: !!channel?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<OcultoPlayItem[]> => {
      const decorate = (r: any) => normalizeOcultoPlayItem({
        ...r,
        author_username: channel!.owner_username,
        author_display_name: channel!.name,
        author_avatar_url: channel!.avatar_url ?? channel!.owner_avatar_url,
        channel_id: channel!.id,
        channel_name: channel!.name,
        channel_slug: channel!.slug,
        channel_avatar_url: channel!.avatar_url ?? channel!.owner_avatar_url,
      });
      const rpc = await (supabase as any).rpc('play_channel_items', {
        p_channel_id: channel!.id, p_tab: tab, p_limit: tab === 'home' ? 30 : 120,
      });
      if (!rpc.error) return ((rpc.data ?? []) as any[]).map(decorate);
      if (!/does not exist|Could not find the function/i.test(rpc.error.message ?? '')) throw rpc.error;

      // Servidor ainda sem a Fase 1b: leitura direta (só publicados).
      let q = (supabase as any)
        .from('oculto_play_items')
        .select('*')
        .eq('channel_id', channel!.id)
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(tab === 'home' ? 24 : 120);
      if (tab === 'shorts') q = q.in('kind', ['short_video', 'vip_teaser']).or('is_adult.is.null,is_adult.eq.false');
      else if (tab === 'links') q = q.eq('kind', 'link').or('is_adult.is.null,is_adult.eq.false');
      else if (tab === 'memes') q = q.eq('kind', 'meme').or('is_adult.is.null,is_adult.eq.false');
      else if (tab === 'links_adult') q = q.eq('is_adult', true);
      else if (tab === 'audio') q = q.eq('kind', 'audio');
      else q = q.or('is_adult.is.null,is_adult.eq.false');
      const { data, error } = await q;
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as any[])
        .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
        .map(decorate);
    },
  });
}

/** Congelar / descongelar um item (só quem publicou ou o master). */
export function useSetPlayItemFrozen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, frozen }: { itemId: string; frozen: boolean }) => {
      const { error } = await (supabase as any).rpc('play_item_set_frozen', { p_item_id: itemId, p_frozen: frozen });
      if (error) throw error;
      return { itemId, frozen };
    },
    onSuccess: ({ itemId, frozen }) => {
      // Some/volta do feed de todo mundo na hora (cache local).
      if (frozen) {
        qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: ['oculto-play'] }, (old) =>
          Array.isArray(old) ? old.filter((x) => x?.id !== itemId) : old);
      }
      qc.invalidateQueries({ queryKey: PLAY_CHANNELS_KEY });
      qc.invalidateQueries({ queryKey: ['oculto-play'] });
    },
  });
}

export function useCreatePlayChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: PlayChannelKind; name: string; slug?: string; description?: string }) => {
      const { data, error } = await (supabase as any).rpc('play_channel_create', {
        p_kind: input.kind,
        p_name: input.name,
        p_slug: input.slug || null,
        p_description: input.description || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as PlayChannel;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: PLAY_CHANNELS_KEY }); },
  });
}

export function useUpdatePlayChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string; name?: string; slug?: string; description?: string;
      avatar_url?: string; banner_url?: string; accent_color?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('play_channel_update', {
        p_id: input.id,
        p_name: input.name ?? null,
        p_slug: input.slug ?? null,
        p_description: input.description ?? null,
        p_avatar_url: input.avatar_url ?? null,
        p_banner_url: input.banner_url ?? null,
        p_accent_color: input.accent_color ?? null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as PlayChannel;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: PLAY_CHANNELS_KEY }); },
  });
}
