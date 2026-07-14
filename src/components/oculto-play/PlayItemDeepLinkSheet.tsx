/**
 * PlayItemDeepLinkSheet — Etapa 25.
 * Abre um item do Play em modal quando a URL contém o hash
 * `#play-item-<id>`. Permite compartilhar links diretos para itens
 * (ex: feeds externos, notificações, playlists editoriais).
 *
 * 100% frontend: escuta `hashchange`, busca o item via supabase
 * externo e renderiza mídia + metadados. Fechar limpa o hash.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Heart, Loader2, Play as PlayIcon, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { usePlaybackProgressAutoSave } from '@/hooks/useOcultoPlayContinueWatching';
import { cn } from '@/lib/utils';

const HASH_PREFIX = '#play-item-';

interface PlayItem {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  thumb_url: string | null;
  media_url: string | null;
  view_count: number;
  like_count: number;
  author_id: string | null;
  is_published: boolean;
}

function parseHash(hash: string): string | null {
  if (!hash || !hash.startsWith(HASH_PREFIX)) return null;
  const id = hash.slice(HASH_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

function useHashItemId(): string | null {
  const [id, setId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : parseHash(window.location.hash),
  );
  useEffect(() => {
    const handler = () => setId(parseHash(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return id;
}

function clearHash() {
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
  // Garante reflow do listener
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function PlayItemDeepLinkSheet() {
  const itemId = useHashItemId();
  const open = !!itemId;
  const { user } = useAuth();
  const bindAutoSave = usePlaybackProgressAutoSave(itemId);

  const { data: item, isLoading } = useQuery({
    queryKey: ['oculto-play', 'deep-link-item', itemId],
    enabled: !!itemId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!itemId) return null;
      const { data, error } = await supabase
        .from('oculto_play_items' as never)
        .select('id, kind, title, description, thumb_url, media_url, view_count, like_count, author_id, is_published')
        .eq('id', itemId)
        .maybeSingle();
      if (error) return null;
      return (data as PlayItem | null) ?? null;
    },
  });

  // Busca progresso salvo para retomar exatamente do mesmo ponto.
  const { data: savedProgress } = useQuery({
    queryKey: ['oculto-play', 'deep-link-progress', itemId, user?.id],
    enabled: !!itemId && !!user?.id,
    staleTime: 10_000,
    queryFn: async () => {
      if (!itemId || !user?.id) return 0;
      const { data } = await (supabase as any)
        .from('oculto_play_playback_progress')
        .select('progress_seconds, completed')
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .maybeSingle();
      if (!data || data.completed) return 0;
      return Number(data.progress_seconds) || 0;
    },
  });

  const seekTo = (el: HTMLVideoElement | HTMLAudioElement | null) => {
    if (!el || !savedProgress || savedProgress < 2) return;
    const apply = () => {
      try {
        if (Math.abs((el.currentTime || 0) - savedProgress) > 1) {
          el.currentTime = savedProgress;
        }
      } catch {}
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener('loadedmetadata', apply, { once: true });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) clearHash(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background border-border/60">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base flex items-center gap-2">
            <PlayIcon className="h-4 w-4 text-fuchsia-400" />
            {item?.title || 'Item do Play'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !item && (
          <div className="px-4 pb-6 text-sm text-muted-foreground">
            Este item não está mais disponível.
          </div>
        )}

        {!isLoading && item && (
          <div className="flex flex-col">
            <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
              {item.kind === 'short_video' && item.media_url ? (
                <video
                  ref={(el) => { bindAutoSave(el); seekTo(el); }}
                  src={item.media_url}
                  poster={item.thumb_url ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                />
              ) : item.kind === 'audio' && item.media_url ? (
                <div className="w-full p-4">
                  <audio
                    ref={(el) => seekTo(el)}
                    src={item.media_url}
                    controls
                    className="w-full"
                  />
                </div>
              ) : item.thumb_url || item.media_url ? (
                <img
                  src={item.thumb_url || item.media_url || ''}
                  alt={item.title || 'Play item'}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-muted-foreground text-xs">Sem prévia</div>
              )}
            </div>

            <div className="px-4 py-3 space-y-2">
              {item.description && (
                <p className="text-sm text-foreground/90 line-clamp-3">{item.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> {item.view_count ?? 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" /> {item.like_count ?? 0}
                </span>
                <span className={cn(
                  "ml-auto px-1.5 py-0.5 rounded-md border text-[10px] uppercase tracking-wide",
                  item.is_published
                    ? "border-emerald-500/40 text-emerald-300/90 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-300/90 bg-amber-500/10",
                )}>
                  {item.is_published ? 'Publicado' : 'Rascunho'}
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => clearHash()}
                >
                  Fechar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-gradient-to-r from-fuchsia-500 to-primary"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.share) {
                      navigator.share({
                        title: item.title || 'OCULTO PLAY',
                        url: `${window.location.origin}${window.location.pathname}${HASH_PREFIX}${item.id}`,
                      }).catch(() => {});
                    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(
                        `${window.location.origin}${window.location.pathname}${HASH_PREFIX}${item.id}`,
                      );
                    }
                  }}
                >
                  <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                  Compartilhar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Helper opcional: abre item do Play.
 * - Primeiro, dispara o evento `oculto-play:open-focus` (a página /oculto-play
 *   escuta e abre o focus modal rico). Se algum listener chamar preventDefault,
 *   paramos por aqui.
 * - Caso contrário, faz fallback para hash (`#play-item-<id>`), usado fora
 *   da página principal (notificações, links externos).
 */
export function openPlayItemDeepLink(id: string) {
  if (!id || typeof window === 'undefined') return;
  try {
    const ev = new CustomEvent('oculto-play:open-focus', {
      detail: { id },
      cancelable: true,
    });
    const accepted = !window.dispatchEvent(ev);
    if (accepted) return;
  } catch { /* noop */ }
  window.location.hash = `play-item-${id}`;
}
