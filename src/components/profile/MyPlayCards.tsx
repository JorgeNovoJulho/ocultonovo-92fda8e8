/**
 * MyPlayCards — cards do Oculto Play do dono do perfil.
 *
 * Lista todos os itens publicados pelo usuário no Oculto Play, com:
 * título, data, visualizações, curtidas, dislikes e compartilhamentos.
 * Ao clicar, leva para `/play/p/:id` (página pública do item).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Eye, Heart, ThumbsDown, Share2, Music, Image as ImageIcon, Video, Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOcultoPlayItemsByCreator, type PlayItemByCreator } from '@/hooks/useOcultoPlayExtras';
import { supabase } from '@/lib/supabaseExternal';
import { cn } from '@/lib/utils';

interface Counts {
  view_count: number;
  like_count: number;
  dislike_count: number;
  share_count: number;
}

interface Props { creatorId: string; }

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function kindIcon(kind: string) {
  if (kind === 'audio') return Music;
  if (kind === 'short_video') return Video;
  if (kind === 'vip_teaser') return Crown;
  return ImageIcon;
}

export function MyPlayCards({ creatorId }: Props) {
  const { data = [], isLoading } = useOcultoPlayItemsByCreator(creatorId, 60);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [countsLoading, setCountsLoading] = useState(false);
  const SORT_KEY = 'my-play-cards-sort-dir';
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>(() => {
    try {
      const v = localStorage.getItem(SORT_KEY);
      return v === 'asc' ? 'asc' : 'desc';
    } catch { return 'desc'; }
  });
  useEffect(() => {
    try { localStorage.setItem(SORT_KEY, sortDir); } catch { /* noop */ }
  }, [sortDir]);

  const sortedData = [...data].sort((a, b) => {
    const ta = new Date(a.published_at ?? 0).getTime();
    const tb = new Date(b.published_at ?? 0).getTime();
    return sortDir === 'desc' ? tb - ta : ta - tb;
  });

  useEffect(() => {
    if (!data.length) return;
    const ids = data.map((it) => it.id);
    let cancelled = false;
    setCountsLoading(true);
    (async () => {
      try {
        const { data: rows } = await (supabase as any).rpc('oculto_play_item_counts', { p_item_ids: ids });
        if (cancelled || !Array.isArray(rows)) return;
        const map: Record<string, Counts> = {};
        for (const r of rows) {
          map[r.item_id] = {
            view_count: Number(r.view_count ?? 0),
            like_count: Number(r.like_count ?? 0),
            dislike_count: Number(r.dislike_count ?? 0),
            share_count: Number(r.share_count ?? 0),
          };
        }
        setCounts(map);
      } catch { /* noop */ }
      finally { if (!cancelled) setCountsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-3 flex gap-3">
            <Skeleton className="h-20 w-20 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <Card className="p-8 text-center mt-4">
        <Play className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Você ainda não publicou nada no Oculto Play.
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-start gap-2 p-3 mb-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5">
        <Play className="h-4 w-4 text-fuchsia-300 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
          <span className="font-semibold text-foreground">Oculto Play.</span>{' '}
          Todo conteúdo que você publicou no Play. Toque em um card para abrir.
        </p>
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200/90 hover:text-fuchsia-100 border border-fuchsia-500/40 rounded-full px-2 py-0.5 transition-colors"
          title="Alternar ordenação"
        >
          {sortDir === 'desc' ? 'Mais novos' : 'Mais antigos'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sortedData.map((it: PlayItemByCreator) => {
          const KIcon = kindIcon(it.kind);
          const c = counts[it.id] ?? {
            view_count: it.view_count ?? 0,
            like_count: it.like_count ?? 0,
            dislike_count: 0,
            share_count: 0,
          };
          return (
            <Link
              key={it.id}
              to={`/play/p/${it.id}`}
              state={{ from: 'profile-play', highlightId: it.id }}
              className="group relative flex gap-3 p-2.5 rounded-xl border border-border/50 bg-card hover:border-fuchsia-400/60 hover:bg-fuchsia-500/5 hover:shadow-[0_4px_18px_-6px_rgba(217,70,239,0.4)] hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 ease-out will-change-transform"
            >
              <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-lg overflow-hidden bg-muted/40">
                {it.thumb_url ? (
                  <img
                    src={it.thumb_url}
                    alt={it.title ?? ''}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-muted-foreground">
                    <KIcon className="h-7 w-7" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                <div className="absolute bottom-1 left-1 grid place-items-center h-5 w-5 rounded-full bg-fuchsia-500/90 text-white">
                  <Play className="h-3 w-3 fill-current" />
                </div>
                {it.visibility === 'vip' && (
                  <div className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-amber-400/95 text-black">
                    <Crown className="h-3 w-3" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <h4 className="text-sm font-semibold line-clamp-2 break-words text-foreground">
                  {it.title || it.caption || 'Sem título'}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDate(it.published_at)}
                </p>
                <div className={cn(
                  'mt-auto pt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-muted-foreground transition-opacity',
                  countsLoading && !counts[it.id] ? 'opacity-50 animate-pulse' : 'opacity-100',
                )}>
                  <Stat icon={Eye} value={c.view_count} label="views" className="text-sky-300/90" />
                  <Stat icon={Heart} value={c.like_count} label="curtidas" className="text-rose-300/90" />
                  <Stat icon={ThumbsDown} value={c.dislike_count} label="dislikes" className="text-zinc-300/90" />
                  <Stat icon={Share2} value={c.share_count} label="compart." className="text-emerald-300/90" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, value, label, className,
}: { icon: React.ElementType; value: number; label: string; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={`${value} ${label}`}>
      <Icon className={cn('h-3 w-3', className)} />
      <span className="font-semibold text-foreground">{value}</span>
      <span className="hidden xs:inline text-muted-foreground/80">{label}</span>
    </span>
  );
}
