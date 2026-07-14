/**
 * PlayCreatorInsightsPanel — Etapa 9
 *
 * Painel pessoal de desempenho no OCULTO PLAY.
 * Mostra resumo, série diária (barras leves) e top itens do criador.
 */
import { useMemo } from 'react';
import {
  BarChart3, Eye, Heart, Bookmark, Share2, Sparkles, Loader2, TrendingUp, Layers,
} from 'lucide-react';
import {
  useOcultoPlayCreatorSummary,
  useOcultoPlayCreatorDaily,
  useOcultoPlayCreatorTop,
} from '@/hooks/useOcultoPlayCreatorInsights';
import { useOcultoPlayCreatorPlaylistPresence } from '@/hooks/useOcultoPlayCreatorPlaylistPresence';
import { cn } from '@/lib/utils';
import { PlayRetentionCard } from '@/components/oculto-play/PlayRetentionCard';

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n ?? 0);

const dayShort = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function PlayCreatorInsightsPanel({ days = 14 }: { days?: number }) {
  const sum = useOcultoPlayCreatorSummary(days);
  const daily = useOcultoPlayCreatorDaily(days);
  const top = useOcultoPlayCreatorTop(6);
  const presence = useOcultoPlayCreatorPlaylistPresence();

  const maxViews = useMemo(
    () => Math.max(1, ...(daily.data ?? []).map((d) => d.views)),
    [daily.data],
  );

  if (sum.isLoading || daily.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = sum.data;
  const empty = !s || s.total_items === 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-fuchsia-500/20 text-fuchsia-300">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold">Seus insights no PLAY</h2>
          <p className="text-[11px] text-muted-foreground">
            Últimos {days} dias — apenas você vê isto.
          </p>
        </div>
      </div>

      {empty ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center">
          <Sparkles className="h-6 w-6 text-fuchsia-300 mx-auto mb-2" />
          <p className="text-sm font-medium">Nada publicado ainda neste período.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Envie um vídeo, meme ou áudio pelo botão "Enviar" para começar a ver dados aqui.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="Views" value={s!.total_views} icon={<Eye className="h-3.5 w-3.5" />} accent="text-sky-300 bg-sky-500/15" />
            <Kpi label="Curtidas" value={s!.total_likes} icon={<Heart className="h-3.5 w-3.5" />} accent="text-rose-300 bg-rose-500/15" />
            <Kpi label="Salvos" value={s!.total_saves} icon={<Bookmark className="h-3.5 w-3.5" />} accent="text-amber-300 bg-amber-500/15" />
            <Kpi label="Compartilhamentos" value={s!.total_shares} icon={<Share2 className="h-3.5 w-3.5" />} accent="text-emerald-300 bg-emerald-500/15" />
          </div>

          {/* Secundário */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-md bg-card border border-border/40 text-muted-foreground">
              {s!.total_items} publicações
            </span>
            <span className="px-2 py-1 rounded-md bg-card border border-border/40 text-muted-foreground">
              {s!.items_last_24h} nas últimas 24h
            </span>
            {s!.top_item_views > 0 && (
              <span className="px-2 py-1 rounded-md bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-500/30 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Top: {s!.top_item_title ?? 'sem título'} — {fmt(s!.top_item_views)} views
              </span>
            )}
            {presence.data && presence.data.playlists_count > 0 && (
              <span
                className="px-2 py-1 rounded-md bg-purple-500/15 text-purple-200 border border-purple-500/30 flex items-center gap-1"
                title={
                  presence.data.top_playlists.length
                    ? presence.data.top_playlists.map((p) => `${p.title} (${p.item_count})`).join(' · ')
                    : undefined
                }
              >
                <Layers className="h-3 w-3" />
                Aparecendo em {presence.data.playlists_count} playlist{presence.data.playlists_count === 1 ? '' : 's'}
                {presence.data.items_in_playlists > 0 && ` · ${presence.data.items_in_playlists} item${presence.data.items_in_playlists === 1 ? '' : 's'}`}
              </span>
            )}
          </div>

          {/* Série diária */}
          <div className="rounded-xl border border-border/50 bg-card/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground/90">Views por dia</p>
              <p className="text-[10px] text-muted-foreground">pico {fmt(maxViews)}</p>
            </div>
            <div className="flex items-end gap-1 h-24">
              {(daily.data ?? []).map((d) => {
                const h = Math.max(2, Math.round((d.views / maxViews) * 100));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                    <div
                      className={cn(
                        'w-full rounded-t-sm transition-all',
                        d.views > 0
                          ? 'bg-gradient-to-t from-fuchsia-500/70 to-primary/70 group-hover:from-fuchsia-400 group-hover:to-primary'
                          : 'bg-border/30',
                      )}
                      style={{ height: `${h}%` }}
                      title={`${dayShort(d.day)} — ${d.views} views`}
                    />
                    <span className="text-[8px] text-muted-foreground/70 leading-none">
                      {dayShort(d.day).slice(0, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top itens */}
          {(top.data ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-foreground/90">Seus melhores itens</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {top.data!.map((it, idx) => (
                  <div
                    key={it.id}
                    className="space-y-2"
                  >
                    <div className="relative rounded-lg overflow-hidden border border-border/40 bg-card aspect-[3/4]">
                      {it.thumb_url || it.media_url ? (
                        <img
                          src={it.thumb_url ?? it.media_url!}
                          alt={it.title ?? 'item'}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center bg-fuchsia-500/10 text-fuchsia-300">
                          <Sparkles className="h-5 w-5" />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">
                        #{idx + 1}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="flex items-center justify-between text-[10px] text-white/90">
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{fmt(it.view_count)}</span>
                          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{fmt(it.like_count)}</span>
                        </div>
                      </div>
                    </div>
                    <PlayRetentionCard itemId={it.id} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label, value, icon, accent,
}: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-3">
      <div className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium mb-1', accent)}>
        {icon}{label}
      </div>
      <p className="text-lg font-bold leading-none">{fmt(value)}</p>
    </div>
  );
}
