/**
 * PlayActivePlaylistsStrip — Etapa 24.
 * Renderiza carrosséis horizontais de playlists editoriais ativas
 * no topo do OCULTO PLAY (aba "Para Você"). Cada carrossel mostra
 * até 10 itens via join com oculto_play_items.
 */
import { useQuery } from '@tanstack/react-query';
import { Play, Sparkles, Layers } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Playlist {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  position: number;
}

interface PlaylistItem {
  item_id: string;
  position: number;
  item: {
    id: string;
    kind: string;
    title: string | null;
    thumb_url: string | null;
    media_url: string | null;
    view_count: number;
    like_count: number;
  } | null;
}

const MAX_PLAYLISTS = 4;
const MAX_ITEMS_PER_PLAYLIST = 10;

function useActivePlaylists() {
  return useQuery({
    queryKey: ['oculto-play', 'active-playlists'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_play_playlists' as never)
        .select('id, slug, title, description, cover_url, position')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(MAX_PLAYLISTS);
      if (error) return [];
      return (data ?? []) as Playlist[];
    },
  });
}

function usePlaylistItems(playlistId: string) {
  return useQuery({
    queryKey: ['oculto-play', 'playlist-items-with-meta', playlistId],
    staleTime: 60_000,
    queryFn: async () => {
      // 1. Buscar item_ids ordenados
      const { data: rels, error: relErr } = await supabase
        .from('oculto_play_playlist_items' as never)
        .select('item_id, position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true })
        .limit(MAX_ITEMS_PER_PLAYLIST);
      if (relErr || !rels?.length) return [] as PlaylistItem[];

      const ids = (rels as any[]).map((r) => r.item_id);

      // 2. Buscar metadata dos itens publicados
      const { data: items, error: itemErr } = await supabase
        .from('oculto_play_items' as never)
        .select('id, kind, title, thumb_url, media_url, view_count, like_count, is_published')
        .in('id', ids)
        .eq('is_published', true);
      if (itemErr) return [] as PlaylistItem[];

      const byId = new Map((items as any[] ?? []).map((i) => [i.id, i]));
      return (rels as any[])
        .map((r) => ({ item_id: r.item_id, position: r.position, item: byId.get(r.item_id) ?? null }))
        .filter((r) => r.item !== null) as PlaylistItem[];
    },
  });
}

export function PlayActivePlaylistsStrip() {
  const { data: playlists, isLoading } = useActivePlaylists();

  if (isLoading) {
    return (
      <div className="space-y-4 mb-4">
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (!playlists?.length) return null;

  return (
    <div className="space-y-5 mb-5">
      {playlists.map((p) => <PlaylistRow key={p.id} playlist={p} />)}
    </div>
  );
}

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  const { data: items, isLoading } = usePlaylistItems(playlist.id);

  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-fuchsia-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate">{playlist.title}</h3>
          {playlist.description && (
            <p className="text-[11px] text-muted-foreground truncate">{playlist.description}</p>
          )}
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1 pb-1">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-24 rounded-lg shrink-0" />
            ))
          : items!.map((row) => <PlaylistItemCard key={row.item_id} row={row} />)}
      </div>
    </section>
  );
}

function PlaylistItemCard({ row }: { row: PlaylistItem }) {
  const item = row.item;
  if (!item) return null;
  const src = item.thumb_url || item.media_url;

  return (
    <a
      href={`#play-item-${item.id}`}
      className={cn(
        'group relative block shrink-0 w-24 sm:w-28 aspect-[3/4] rounded-lg overflow-hidden',
        'bg-card border border-border/40 hover:border-fuchsia-500/50 transition',
      )}
      title={item.title ?? ''}
    >
      {src ? (
        <img
          src={src}
          alt={item.title ?? ''}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground bg-black/30">
          <Layers className="h-6 w-6" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      {item.kind === 'short_video' && (
        <div className="absolute top-1.5 right-1.5 grid place-items-center h-5 w-5 rounded-full bg-black/60 text-white">
          <Play className="h-2.5 w-2.5 fill-white" />
        </div>
      )}
      {item.title && (
        <p className="absolute bottom-1 left-1 right-1 text-[10px] font-medium text-white line-clamp-2 drop-shadow">
          {item.title}
        </p>
      )}
    </a>
  );
}

export default PlayActivePlaylistsStrip;
