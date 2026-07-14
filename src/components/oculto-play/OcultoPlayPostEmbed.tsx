/**
 * OcultoPlayPostEmbed — bloco que aparece dentro do RealPostCard (feed) e dos
 * tópicos de comunidade quando o post/tópico está vinculado a um item do
 * OCULTO PLAY (`oculto_play_item_id` / `play_item_id`).
 *
 * Mostra:
 *  - Capa do item, SEM corte (object-contain)
 *  - Player que toca os primeiros 30s da prévia (ou o range definido pelo
 *    criador em preview_start_seconds / preview_end_seconds quando vier).
 *  - Botão "Ouvir completa no OCULTO PLAY" → abre /oculto-play?item=<id>,
 *    que faz a página principal abrir automaticamente o focus modal do item
 *    (com autoplay).
 *
 * Resiliência: usa a RPC `oculto_play_guest_item` (security definer) que
 * devolve `audio_url`/`media_url` mesmo quando o leitor não é dono do item.
 * Cai para SELECT direto se a RPC não existir.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Play, Pause, Music, ArrowUpRight, Loader2, Film, Maximize2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OcultoPlayLinkPlayer } from '@/components/oculto-play/OcultoPlayLinkPlayer';

interface PlayItemLite {
  id: string;
  title: string | null;
  caption: string | null;
  thumb_url: string | null;
  audio_preview_url: string | null;
  audio_url: string | null;
  media_url: string | null;
  source_url: string | null;
  trailer_url: string | null;
  trailer_trim_start_seconds: number | null;
  trailer_trim_end_seconds: number | null;
  kind: string;
  duration_sec: number | null;
  preview_start_seconds: number | null;
  preview_end_seconds: number | null;
  author_username: string | null;
  genre_tags: string[] | null;
}

type GuestPlayItemRow = Partial<PlayItemLite> & { locked?: boolean };

interface Props {
  itemId: string;
  fallbackCover?: string | null;
  className?: string;
}

function fmt(s: number) {
  if (!isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function withPreviewFragment(url: string | null, start: number, end: number, dedicatedClip: boolean) {
  if (!url || dedicatedClip || start <= 0) return url;
  const clean = url.split('#')[0];
  const s = Number(start.toFixed(2));
  const e = end > start ? Number(end.toFixed(2)) : Number((start + 30).toFixed(2));
  return `${clean}#t=${s},${e}`;
}

async function fetchItem(itemId: string): Promise<PlayItemLite | null> {
  // 1) RPC resiliente — funciona mesmo se RLS bloqueia SELECT direto.
  try {
    const rpcClient = supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: GuestPlayItemRow[] | null; error: unknown }>;
    };
    const { data: rpcRows, error: rpcErr } = await rpcClient.rpc('oculto_play_guest_item', { p_item_id: itemId });
    const rpcRow = Array.isArray(rpcRows) ? rpcRows[0] : null;
    if (!rpcErr && rpcRow) {
      let audioPreviewUrl = (rpcRow as any).audio_preview_url ?? null;
      let previewStart = rpcRow.preview_start_seconds ?? null;
      let previewEnd = rpcRow.preview_end_seconds ?? null;
      // RPC pública dedicada: fonte autoritativa para o snippet de 30s.
      // Mesmo quando `oculto_play_guest_item` devolve start/end, versões
      // antigas da função não devolvem `audio_preview_url`; sem ela o feed
      // tenta dar seek no MP3 completo e alguns browsers começam do 0.
      try {
        const { data: winRows } = await rpcClient.rpc('oculto_play_preview_window', { p_item_id: rpcRow.id! });
        const winRow = Array.isArray(winRows)
          ? (winRows[0] as { audio_preview_url?: string | null; preview_start_seconds?: number; preview_end_seconds?: number } | undefined)
          : null;
        if (winRow) {
          audioPreviewUrl = winRow.audio_preview_url ?? audioPreviewUrl;
          previewStart = winRow.preview_start_seconds ?? previewStart;
          previewEnd = winRow.preview_end_seconds ?? previewEnd;
        }
      } catch { /* segue */ }
      if (previewStart == null || previewEnd == null || audioPreviewUrl == null) {
        // Fallback: SELECT direto (só funciona para o dono/RLS liberada).
        const { data: direct } = await supabase
          .from('oculto_play_items')
          .select('audio_preview_url,preview_start_seconds,preview_end_seconds')
          .eq('id', rpcRow.id)
          .maybeSingle();
        const directRow = direct as Pick<PlayItemLite, 'audio_preview_url' | 'preview_start_seconds' | 'preview_end_seconds'> | null;
        audioPreviewUrl = directRow?.audio_preview_url ?? audioPreviewUrl;
        previewStart = directRow?.preview_start_seconds ?? previewStart;
        previewEnd = directRow?.preview_end_seconds ?? previewEnd;
      }
      const base: PlayItemLite = {
        id: rpcRow.id!,
        title: rpcRow.title ?? null,
        caption: rpcRow.caption ?? null,
        thumb_url: rpcRow.thumb_url ?? null,
        audio_preview_url: audioPreviewUrl,
        audio_url: rpcRow.audio_url ?? null,
        media_url: rpcRow.media_url ?? null,
        source_url: (rpcRow as any).source_url ?? null,
        trailer_url: null,
        trailer_trim_start_seconds: null,
        trailer_trim_end_seconds: null,
        kind: rpcRow.kind ?? 'audio',
        duration_sec: rpcRow.duration_sec ?? null,
        preview_start_seconds: previewStart,
        preview_end_seconds: previewEnd,
        author_username: rpcRow.author_username ?? null,
        genre_tags: Array.isArray((rpcRow as any).genre_tags) ? (rpcRow as any).genre_tags : null,
      };
      if (base.kind === 'link') {
        try {
          const { data: prev } = await (supabase as any).rpc('oculto_play_public_preview', { p_item_id: base.id });
          const p0 = Array.isArray(prev) ? prev[0] : prev;
          if (p0) {
            base.trailer_url = p0.trailer_url ?? null;
            base.trailer_trim_start_seconds = p0.trailer_trim_start_seconds ?? null;
            base.trailer_trim_end_seconds = p0.trailer_trim_end_seconds ?? null;
            base.source_url = base.source_url ?? p0.source_url ?? null;
            base.media_url = base.media_url ?? p0.media_url ?? null;
            if (Array.isArray(p0.genre_tags)) base.genre_tags = p0.genre_tags;
          }
        } catch { /* noop */ }
        if (!base.genre_tags) {
          try {
            const { data: gt } = await supabase
              .from('oculto_play_items')
              .select('genre_tags')
              .eq('id', base.id)
              .maybeSingle();
            if (gt && Array.isArray((gt as any).genre_tags)) base.genre_tags = (gt as any).genre_tags;
          } catch { /* noop */ }
        }
      }
      return base;
    }
  } catch { /* fallback */ }

  // 2) Fallback: SELECT direto (pode falhar se RLS bloquear).
  const { data, error } = await supabase
    .from('oculto_play_items')
    .select(
      'id,title,caption,thumb_url,audio_preview_url,audio_url,media_url,source_url,trailer_url,trailer_trim_start_seconds,trailer_trim_end_seconds,kind,duration_sec,preview_start_seconds,preview_end_seconds,author_username,genre_tags',
    )
    .eq('id', itemId)
    .maybeSingle();
  if (error) return null;
  return (data as PlayItemLite | null) ?? null;
}

export function OcultoPlayPostEmbed({ itemId, fallbackCover, className }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ['oculto-play-embed', itemId],
    queryFn: () => fetchItem(itemId),
    staleTime: 5 * 60 * 1000,
  });

  // Filme (link): renderiza player de trailer + botão "Assistir completo".
  if (item?.kind === 'link') {
    return (
      <MoviePlayEmbed item={item} fallbackCover={fallbackCover} className={className} />
    );
  }


  // Range da prévia. Quando existe `audio_preview_url`, ela JÁ É o trecho
  // recortado salvo no upload; portanto nunca devemos tocar `audio_url` do
  // começo da faixa completa.
  const hasDedicatedPreviewClip = !!item?.audio_preview_url;
  const savedStart = Math.max(0, Number(item?.preview_start_seconds ?? 0));
  const savedEndRaw = Number(item?.preview_end_seconds ?? 0);
  const savedLen = savedEndRaw > savedStart ? savedEndRaw - savedStart : 30;
  const previewStart = hasDedicatedPreviewClip ? 0 : savedStart;
  const previewEndRaw = hasDedicatedPreviewClip
    ? Math.max(5, Math.min(30, savedLen || 30))
    : savedEndRaw;
  const previewEnd = previewEndRaw > previewStart ? previewEndRaw : previewStart + 30;
  const previewLen = Math.max(0, previewEnd - previewStart);

  const audioSrc = item?.audio_preview_url ?? item?.audio_url ?? (item?.kind === 'audio' ? item?.media_url : null);
  const audioElementSrc = withPreviewFragment(audioSrc, previewStart, previewEnd, hasDedicatedPreviewClip);
  const canPlayPreview = !!audioSrc;
  const resolvedPlayItemId = item?.id ?? itemId;

  const waitForMetadata = (el: HTMLAudioElement) => new Promise<void>((resolve, reject) => {
    if (el.readyState >= 1) { resolve(); return; }
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('canplay', onMeta);
      el.removeEventListener('error', onError);
      window.clearTimeout(timer);
      if (ok) resolve();
      else reject(new Error('metadata'));
    };
    const onMeta = () => finish(true);
    const onError = () => finish(false);
    const timer = window.setTimeout(() => finish(true), 1800);
    el.addEventListener('loadedmetadata', onMeta, { once: true });
    el.addEventListener('canplay', onMeta, { once: true });
    el.addEventListener('error', onError, { once: true });
    try { el.load(); } catch { finish(true); }
  });

  const toggle = async () => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    if (!el.paused && !el.ended) {
      el.pause();
      return;
    }
    try {
      setLoading(true);
      await waitForMetadata(el).catch(() => undefined);
      const needsOffsetSeek = !hasDedicatedPreviewClip && previewStart > 0.25;
      const originalVolume = (() => {
        try { return Number.isFinite(el.volume) && el.volume > 0 ? el.volume : 1; } catch { return 1; }
      })();
      let restored = false;
      const inPreviewWindow = () => {
        try { return el.currentTime >= previewStart - 0.05 && el.currentTime < previewEnd; } catch { return false; }
      };
      const restoreVolume = () => {
        if (restored) return;
        restored = true;
        try { el.volume = originalVolume; } catch { /* noop */ }
        el.removeEventListener('timeupdate', keepInsideWindow);
        el.removeEventListener('seeked', restoreWhenSeeked);
      };
      const keepInsideWindow = () => {
        if (!needsOffsetSeek) { restoreVolume(); return; }
        if (inPreviewWindow()) { restoreVolume(); return; }
        try {
          if (el.readyState >= 1 && el.currentTime < previewStart - 0.05) el.currentTime = previewStart;
        } catch { /* noop */ }
      };
      const restoreWhenSeeked = () => {
        if (!needsOffsetSeek || inPreviewWindow()) restoreVolume();
      };
      if (needsOffsetSeek) {
        try { el.volume = 0; } catch { /* noop */ }
        el.addEventListener('timeupdate', keepInsideWindow);
        el.addEventListener('seeked', restoreWhenSeeked);
        window.setTimeout(restoreVolume, 1500);
      }
      // SEMPRE força o cursor de volta ao início da prévia ao iniciar a
      // reprodução, garantindo que o player nunca toque o começo da música
      // quando o criador definiu um trecho diferente.
      try { el.currentTime = previewStart; } catch { /* play mesmo sem seek */ }
      await el.play();
      // Em alguns browsers mobile o seek antes do play() é ignorado se o
      // áudio ainda não terminou o buffering inicial — reaplica logo após.
      try {
        if (Math.abs(el.currentTime - previewStart) > 0.4) {
          el.currentTime = previewStart;
        }
      } catch { /* noop */ }
      keepInsideWindow();
    } catch (err) {
      console.warn('[OcultoPlayPostEmbed] play falhou', err);
    } finally {
      setLoading(false);
    }
  };

  // Quando os dados do snippet (preview_start/end) chegam DEPOIS do áudio já
  // estar carregado/parado no zero, reposiciona para a janela correta.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused && (el.currentTime < previewStart || el.currentTime >= previewEnd)) {
      try { el.currentTime = previewStart; } catch { /* noop */ }
    }
  }, [previewStart, previewEnd, audioElementSrc]);

  // Listeners — reanexam quando o áudio muda
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => { setPlaying(true); setLoading(false); };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onError = () => { setLoading(false); setPlaying(false); };
    const onTime = () => {
      setCurrent(el.currentTime);
      if (previewEnd > 0 && el.currentTime >= previewEnd) {
        el.pause();
        el.currentTime = previewStart;
      }
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onError);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onPause);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('error', onError);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onPause);
    };
  }, [previewStart, previewEnd, audioElementSrc]);

  const elapsed = Math.max(0, current - previewStart);
  const pct = previewLen > 0 ? Math.min(1, elapsed / previewLen) : 0;

  const cover = item?.thumb_url || fallbackCover || null;
  const title = item?.title || item?.caption || 'OCULTO PLAY';
  const handle = item?.author_username ? `@${item.author_username}` : null;

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden border border-fuchsia-500/25 bg-gradient-to-b from-fuchsia-950/40 via-violet-950/30 to-slate-950/50',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Capa sem corte */}
      <div className="relative w-full bg-black flex items-center justify-center" style={{ minHeight: 220 }}>
        {cover ? (
          <img
            src={cover}
            alt={title}
            loading="lazy"
            decoding="async"
            className="max-h-[60vh] w-full object-contain"
            style={{ maxHeight: 480 }}
          />
        ) : (
          <div className="grid place-items-center h-56 w-full text-fuchsia-200/80">
            <Music className="h-10 w-10" />
          </div>
        )}

        <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 text-black text-[10px] font-extrabold uppercase tracking-wide shadow">
          <Music className="h-3 w-3" /> Oculto Play
        </div>
      </div>

      {/* Player de prévia */}
      <div className="p-3 space-y-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate" title={title}>
            {title}
          </div>
          {handle && (
            <div className="text-[11px] text-white/70 truncate">{handle}</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading || !canPlayPreview}
            aria-label={playing ? 'Pausar prévia' : 'Tocar prévia'}
            title={!canPlayPreview && !isLoading ? 'Prévia indisponível' : undefined}
            className={cn(
              'grid place-items-center h-10 w-10 rounded-full shrink-0 transition-colors',
              'bg-fuchsia-500 hover:bg-fuchsia-400 text-white disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isLoading || loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : playing
                ? <Pause className="h-5 w-5" fill="currentColor" />
                : <Play className="h-5 w-5" fill="currentColor" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="relative h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-400 to-amber-300 transition-[width] duration-150"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/55 tabular-nums mt-1">
              <span>{fmt(elapsed)}</span>
              <span>prévia · {fmt(previewLen)}</span>
            </div>
          </div>
        </div>

        <Button asChild size="sm" className="w-full bg-amber-400 hover:bg-amber-300 text-black font-semibold">
          <Link to={`/oculto-play?item=${resolvedPlayItemId}`}>
            <ArrowUpRight className="h-4 w-4 mr-1" />
            Ouvir completa no OCULTO PLAY
          </Link>
        </Button>
      </div>

      <audio
        ref={audioRef}
        src={audioElementSrc ?? undefined}
        preload="metadata"
        playsInline
      />
    </div>
  );
}

function MoviePlayEmbed({
  item,
  fallbackCover,
  className,
}: {
  item: PlayItemLite;
  fallbackCover?: string | null;
  className?: string;
}) {
  const cover = item.thumb_url || fallbackCover || null;
  const title = item.title || item.caption || 'Filme no OCULTO PLAY';
  const handle = item.author_username ? `@${item.author_username}` : null;

  // Fonte do trailer: prioriza trailer_url (URL/embed externo); senão usa a
  // mídia principal com recorte trailer_trim_start/end (janela salva).
  const trailerSource = item.trailer_url || item.source_url || item.media_url || '';
  const hasTrailerUrl = !!item.trailer_url;
  const startSeconds = hasTrailerUrl ? null : item.trailer_trim_start_seconds ?? null;
  const endSeconds = hasTrailerUrl ? null : item.trailer_trim_end_seconds ?? null;
  const canPlayTrailer = !!trailerSource;

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden border border-amber-500/25 bg-gradient-to-b from-amber-950/40 via-orange-950/30 to-slate-950/60',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full bg-black">
        {canPlayTrailer ? (
          <OcultoPlayLinkPlayer
            sourceUrl={trailerSource}
            thumbUrl={cover}
            className="w-full aspect-video"
            lazyClickToPlay
            itemId={item.id}
            startSeconds={startSeconds}
            endSeconds={endSeconds}
            preferThumb
            coverFit="contain"
          />
        ) : cover ? (
          <img
            src={cover}
            alt={title}
            loading="lazy"
            decoding="async"
            className="w-full aspect-video object-contain bg-black"
          />
        ) : (
          <div className="grid place-items-center aspect-video w-full text-amber-200/80">
            <Film className="h-10 w-10" />
          </div>
        )}
        <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 text-black text-[10px] font-extrabold uppercase tracking-wide shadow">
          <Film className="h-3 w-3" /> Oculto Play · Trailler
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div className="min-w-0">
          <div className="text-base font-bold text-white leading-tight" title={title}>
            {title}
          </div>
          {handle && (
            <div className="text-[11px] text-white/70 truncate mt-0.5">{handle}</div>
          )}
          {item.genre_tags && item.genre_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.genre_tags.map((g) => (
                <span
                  key={g}
                  className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/30"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {item.caption && item.caption.trim() && (
          <div className="rounded-lg bg-black/30 border border-white/5 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-amber-300/80 font-bold mb-1">
              Sinopse
            </div>
            <p
              className="oculto-sinopse-scroll text-[13px] text-white/85 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {item.caption}
            </p>
            <style>{`.oculto-sinopse-scroll::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
          </div>
        )}

        <Button

          asChild
          size="sm"
          className="w-full bg-amber-400 hover:bg-amber-300 text-black font-semibold"
        >
          <Link to={`/oculto-play?item=${item.id}`}>
            <Maximize2 className="h-4 w-4 mr-1" />
            Assistir completo no OCULTO PLAY
          </Link>
        </Button>
      </div>
    </div>
  );
}

