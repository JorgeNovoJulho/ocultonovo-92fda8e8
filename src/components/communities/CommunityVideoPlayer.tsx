/**
 * CommunityVideoPlayer — player leve para vídeos publicados em comunidades.
 *
 * Pensado para devices fracos (Realme C55 e inferiores):
 *  • Renderiza apenas a CAPA (poster) até o usuário tocar.
 *  • Ao tocar pela primeira vez monta o <video> com preload="metadata".
 *  • Libera memória ao sair do viewport.
 *  • Registra UMA visualização por sessão (RPC by_url).
 *  • Realtime no view_count.
 *
 * Suporte a:
 *  • Corte (trim_start_seconds / trim_end_seconds) — pula direto pro início
 *    do corte e pausa no fim.
 *  • Outro/marca d'água final — imagem exibida em overlay durante os últimos
 *    2 segundos do corte (ou do vídeo, se não houver corte).
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Play, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { extractVideoFrame } from '@/lib/videoFrameExtractor';
import { cn } from '@/lib/utils';
import outroAsset from '@/assets/oculto-video-outro.png.asset.json';

interface Props {
  url: string;
  coverUrl?: string | null;
  className?: string;
}

const sessionViewed = new Set<string>();
const DEFAULT_OUTRO_URL = (outroAsset as { url: string }).url;
const OUTRO_DURATION_SEC = 2;

export const CommunityVideoPlayer = memo(function CommunityVideoPlayer({
  url,
  coverUrl,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activated, setActivated] = useState(false);
  const [poster, setPoster] = useState<string | null>(coverUrl ?? null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Metadados de corte/outro vindos do banco OU do fragmento #t=start,end
  const [trimStart, setTrimStart] = useState<number | null>(null);
  const [trimEnd, setTrimEnd] = useState<number | null>(null);
  const [outroUrl, setOutroUrl] = useState<string>(DEFAULT_OUTRO_URL);
  const [showOutro, setShowOutro] = useState(false);

  // Parse fragmento #t=start[,end] — aplica corte mesmo sem DB lookup.
  useEffect(() => {
    const hashIdx = url.indexOf('#t=');
    if (hashIdx < 0) return;
    const frag = url.slice(hashIdx + 3);
    const parts = frag.split(',').map((x) => Number(x));
    if (parts[0] != null && Number.isFinite(parts[0])) setTrimStart(parts[0]);
    if (parts[1] != null && Number.isFinite(parts[1])) setTrimEnd(parts[1]);
  }, [url]);

  useEffect(() => {
    if (poster) return;
    let alive = true;
    extractVideoFrame(url, { seekTo: 0.5, maxWidth: 480, quality: 0.65 })
      .then((dataUrl) => { if (alive && dataUrl) setPoster(dataUrl); })
      .catch(() => { /* ignora */ });
    return () => { alive = false; };
  }, [url, poster]);

  // Busca id + view_count + trim + outro pela URL (sem fragmento).
  useEffect(() => {
    let cancelled = false;
    const cleanUrl = url.split('#')[0];
    (async () => {
      try {
        const { data } = await supabase
          .from('oculto_community_media')
          .select('id,view_count,trim_start_seconds,trim_end_seconds,outro_url,cover_url')
          .eq('url', cleanUrl)
          .eq('kind', 'video')
          .limit(1)
          .maybeSingle();
        if (cancelled || !data) return;
        const d = data as any;
        setMediaId(d.id);
        setViewCount(Number(d.view_count ?? 0));
        setTrimStart((cur) => (cur != null ? cur : (d.trim_start_seconds != null ? Number(d.trim_start_seconds) : null)));
        setTrimEnd((cur) => (cur != null ? cur : (d.trim_end_seconds != null ? Number(d.trim_end_seconds) : null)));
        if (d.outro_url) setOutroUrl(String(d.outro_url));
        if (!poster && d.cover_url) setPoster(String(d.cover_url));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [url, poster]);

  useEffect(() => {
    if (!mediaId) return;
    const channel = supabase
      .channel(`community_media_${mediaId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'oculto_community_media',
          filter: `id=eq.${mediaId}`,
        },
        (payload) => {
          const next = Number((payload.new as any)?.view_count ?? 0);
          if (Number.isFinite(next)) setViewCount((cur) => (next > cur ? next : cur));
        },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* noop */ } };
  }, [mediaId]);

  useEffect(() => {
    if (!activated) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting && videoRef.current && !videoRef.current.paused) {
            try { videoRef.current.pause(); } catch { /* noop */ }
          }
        }
      },
      { rootMargin: '200px 0px', threshold: 0 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [activated]);

  const registerView = async () => {
    const cleanUrl = url.split('#')[0];
    if (sessionViewed.has(cleanUrl)) return;
    sessionViewed.add(cleanUrl);
    setViewCount((c) => c + 1);
    try { await supabase.rpc('community_media_register_view_by_url', { _url: cleanUrl }); }
    catch { /* noop */ }
  };

  const handleActivate = () => {
    setActivated(true);
    setLoading(true);
    setShowOutro(false);
    setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* user gesture? */ });
    }, 0);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    if (trimStart != null && trimStart > 0 && trimStart < v.duration) {
      try { v.currentTime = trimStart; } catch { /* noop */ }
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const endRef = trimEnd != null && trimEnd > 0
      ? Math.min(trimEnd, v.duration || trimEnd)
      : (isFinite(v.duration) ? v.duration : null);
    if (endRef == null) return;
    const ct = v.currentTime;
    if (ct >= endRef - OUTRO_DURATION_SEC) {
      if (!showOutro) setShowOutro(true);
    } else if (showOutro) {
      setShowOutro(false);
    }
    if (ct >= endRef - 0.05) {
      try { v.pause(); } catch { /* noop */ }
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-lg bg-black/70 border border-border',
        className,
      )}
      style={{ aspectRatio: '16 / 9' }}
    >
      {!activated ? (
        <button
          type="button"
          onClick={handleActivate}
          className="absolute inset-0 flex items-center justify-center group"
          aria-label="Reproduzir vídeo"
        >
          {poster ? (
            <img
              src={poster}
              alt="Capa do vídeo"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black" />
          )}
          <span className="absolute inset-0 bg-black/25 group-hover:bg-black/15 transition-colors" />
          <span className="relative z-10 h-14 w-14 rounded-full bg-white/15 backdrop-blur-sm ring-2 ring-white/60 grid place-items-center group-hover:scale-105 transition-transform">
            <Play className="h-7 w-7 text-white fill-white translate-x-[1px]" />
          </span>
        </button>
      ) : (
        <video
          ref={videoRef}
          src={url}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          {...({ disableRemotePlayback: true } as Record<string, unknown>)}
          controlsList="nodownload noplaybackrate"
          onContextMenu={(e) => e.preventDefault()}
          onLoadedData={() => setLoading(false)}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => registerView()}
          className="absolute inset-0 w-full h-full object-contain bg-black"
        />
      )}

      {/* Overlay de outro (marca d'água final) — visível por 2s ao fim */}
      {activated && showOutro && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-black/80 animate-in fade-in duration-200">
          <img
            src={outroUrl}
            alt="OCULTO"
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
          />
        </div>
      )}

      {loading && activated && (
        <div className="absolute inset-0 grid place-items-center bg-black/30 pointer-events-none">
          <Loader2 className="h-7 w-7 text-white animate-spin" />
        </div>
      )}

      <div
        className="absolute bottom-2 left-2 z-20 px-2 py-1 rounded-md bg-black/65 backdrop-blur-sm text-[11px] text-white font-semibold flex items-center gap-1 pointer-events-none"
        aria-label={`${viewCount} visualizações`}
      >
        <Eye className="h-3 w-3" />
        <span className="tabular-nums">{viewCount.toLocaleString('pt-BR')}</span>
      </div>
    </div>
  );
});
