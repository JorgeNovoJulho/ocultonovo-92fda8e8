/**
 * OcultoPlayPublicItemPage — landing pública /play/p/:id
 *
 * Acessível SEM login. Reproduz automaticamente o item compartilhado
 * (vídeo/áudio/meme público). Itens VIP/Premium ficam bloqueados com
 * overlay convidando à criação de conta.
 *
 * Qualquer ação (curtir, salvar, comentar, compartilhar, coleções,
 * abrir perfil do autor) abre o GuestSignupGateModal explicando que o
 * OCULTO também é uma rede social adulta (+18) e exige cadastro grátis.
 *
 * Também escreve OpenGraph/Twitter meta no <head> para gerar prévia
 * com capa + título em qualquer link externo (WhatsApp, Telegram, etc.).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Heart, Bookmark, Share2, FolderPlus, MessageCircle,
  Eye, Play, Pause, Loader2, Crown, Lock, ShieldCheck, Volume2, VolumeX,
} from 'lucide-react';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { setPlaySeekHint } from '@/lib/ocultoPlaySeekHint';
import { parseEmbeddedVideo } from '@/lib/embeddedVideoUrl';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import { resolveOcultoPlayMediaUrl } from '@/lib/ocultoPlayRepairedMedia';
import { useAuth } from '@/hooks/useAuth';
import { ocultoPlayShareUrl } from '@/lib/ocultoPlayShareUrl';
import { OcultoPlayLinkPlayer } from '@/components/oculto-play/OcultoPlayLinkPlayer';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';

const KIND_LABEL: Record<string, string> = {
  short_video: 'Vídeo curto',
  meme: 'Meme',
  audio: 'Áudio',
  vip_teaser: 'Teaser VIP',
  community_post: 'Comunidade',
  challenge: 'Desafio',
  link: 'Filme',
};

interface GuestItem {
  id: string;
  kind: string;
  title: string | null;
  caption: string | null;
  thumb_url: string | null;
  media_url: string | null;
  audio_url: string | null;
  source_url: string | null;
  visibility: string;
  duration_sec: number | null;
  view_count: number;
  like_count: number;
  share_count: number;
  comment_count: number;
  published_at: string;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  locked: boolean;
  trailer_url?: string | null;
  trailer_trim_start_seconds?: number | null;
  trailer_trim_end_seconds?: number | null;
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function playOgImageUrl(itemId: string, version?: string | number | null): string {
  const suffix = version ? `?v=${encodeURIComponent(String(version))}` : '';
  return `https://ocultoswing.com.br/play/og-image/${encodeURIComponent(itemId)}.png${suffix}`;
}

export default function OcultoPlayPublicItemPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();


  const [item, setItem] = useState<GuestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [viewRegistered, setViewRegistered] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRetryTimerRef = useRef<number | null>(null);
  const videoRetryCountRef = useRef(0);
  const videoDecoderRecoveryCountRef = useRef(0);
  const lastVideoProgressAtRef = useRef(0);
  const lastVideoTimeRef = useRef(0);
  const lastVideoFrameAtRef = useRef(0);
  const lastVideoFrameMediaTimeRef = useRef(0);
  const frameCallbackIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (videoRetryTimerRef.current) window.clearTimeout(videoRetryTimerRef.current);
      const a = audioRef.current;
      if (a) {
        try { a.pause(); } catch { /* noop */ }
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    videoRetryCountRef.current = 0;
    videoDecoderRecoveryCountRef.current = 0;
    lastVideoProgressAtRef.current = performance.now();
    lastVideoFrameAtRef.current = performance.now();
    lastVideoTimeRef.current = 0;
    lastVideoFrameMediaTimeRef.current = 0;
    if (videoRetryTimerRef.current) {
      window.clearTimeout(videoRetryTimerRef.current);
      videoRetryTimerRef.current = null;
    }
  }, [item?.id, item?.media_url]);

  // Anti-download: bloqueia menu de contexto e atalhos de salvar na página inteira
  useEffect(() => {
    const blockCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'VIDEO' || t.tagName === 'AUDIO' || t.tagName === 'IMG')) {
        e.preventDefault();
      }
    };
    const blockKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'S', 'u', 'U'].includes(e.key)) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', blockCtx);
    document.addEventListener('keydown', blockKeys);
    return () => {
      document.removeEventListener('contextmenu', blockCtx);
      document.removeEventListener('keydown', blockKeys);
    };
  }, []);

  const tParam = Number(params.get('t') ?? '0') || 0;
  useEffect(() => {
    if (id && tParam > 0) setPlaySeekHint(id, tParam);
  }, [id, tParam]);

  // Carrega o item via fetch DIRETO com a anon key — NUNCA usa o cliente
  // supabase aqui para evitar que um token JWT expirado em localStorage
  // seja enviado como Authorization (PostgREST trataria como JWT inválido
  // em vez de anon, devolvendo erro). Link público tem que funcionar em
  // qualquer sessão: logado, deslogado, sessão expirada, navegador in-app.
  useEffect(() => {
    let alive = true;
    if (!id) return;
    // Limpa o marker `?app=1` legado das URLs antigas para manter o link
    // copiado/compartilhado sempre canônico (`/play/p/:id`). Crawlers já
    // são desviados para `/api/og-play` por user-agent no vercel.json.
    if (params.get('app') === '1') {
      const clean = new URLSearchParams(params);
      clean.delete('app');
      const qs = clean.toString();
      navigate(`/play/p/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`, { replace: true });
    }
    setLoading(true);
    (async () => {
      try {
        const resp = await fetch(
          `${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/oculto_play_guest_item`,
          {
            method: 'POST',
            headers: {
              apikey: EXTERNAL_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({ p_item_id: id }),
          },
        );
        if (!alive) return;
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          console.warn('[OcultoPlayPublic] guest item HTTP', resp.status, txt);
          setItem(null);
          setLoading(false);
          return;
        }
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const txt = await resp.text().catch(() => '');
          console.warn('[OcultoPlayPublic] guest item non-json', contentType, txt.slice(0, 120));
          setItem(null);
          setLoading(false);
          return;
        }
        const data = await resp.json().catch(() => null);
        const row = Array.isArray(data) && data[0] ? (data[0] as GuestItem) : null;
        setItem(row ? { ...row, media_url: resolveOcultoPlayMediaUrl(row.id, row.media_url) } : null);
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        console.warn('[OcultoPlayPublic] guest item failed:', err);
        setItem(null);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, navigate, params]);

  // Atualiza <head> com OG/Twitter para gerar prévia em apps externos
  useEffect(() => {
    if (!item) return;
    const handle = item.author_username
      ? `@${item.author_username}`
      : item.author_display_name || '';
    const title = `${item.title || KIND_LABEL[item.kind] || 'Conteúdo'}${handle ? ` — ${handle}` : ''} · OCULTO PLAY`;
    const desc = item.caption?.slice(0, 160)
      || `Assista no OCULTO PLAY${handle ? ` — postado por ${handle}` : ''}. Rede social adulta +18.`;
    const url = ocultoPlayShareUrl(item.id);
    const img = item.thumb_url ? playOgImageUrl(item.id, item.published_at ? new Date(item.published_at).getTime() : Date.now()) : '';

    document.title = title;
    setMeta('description', desc);
    setMeta('og:title', title, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:type', 'video.other', 'property');
    setMeta('og:site_name', 'OCULTO PLAY', 'property');
    if (img) {
      setMeta('og:image', img, 'property');
      setMeta('og:image:secure_url', img, 'property');
      setMeta('og:image:type', 'image/png', 'property');
      setMeta('og:image:width', '1200', 'property');
      setMeta('og:image:height', '630', 'property');
      setMeta('og:image:alt', title, 'property');
    }
    setMeta('twitter:card', img ? 'summary_large_image' : 'summary');
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
    if (img) setMeta('twitter:image', img);
    // canonical
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [item]);

  // Auto-play assim que o item carrega.
  // - Vídeo: tenta COM SOM; se bloqueado, cai pra muted; se ainda bloqueado,
  //   inicia no primeiro toque/tecla do usuário (mantém promise dentro do gesto).
  // - Áudio: pré-criamos o Audio com preload=auto IMEDIATAMENTE para já estar
  //   bufferizado; tentamos play(); se o navegador bloquear, qualquer toque
  //   na página dispara o play instantaneamente (sem precisar achar botão).
  useEffect(() => {
    if (!item || item.locked) return;

    let cleanup: (() => void) | null = null;

    const attachGestureFallback = (startFn: () => Promise<void> | void) => {
      const handler = () => {
        document.removeEventListener('pointerdown', handler);
        document.removeEventListener('touchstart', handler);
        document.removeEventListener('keydown', handler);
        try { Promise.resolve(startFn()).catch(() => {}); } catch { /* noop */ }
      };
      document.addEventListener('pointerdown', handler, { once: true });
      document.addEventListener('touchstart', handler, { once: true });
      document.addEventListener('keydown', handler, { once: true });
      cleanup = () => {
        document.removeEventListener('pointerdown', handler);
        document.removeEventListener('touchstart', handler);
        document.removeEventListener('keydown', handler);
      };
    };

    if (item.kind === 'audio') {
      const audioSrc = item.audio_url || item.media_url;
      if (!audioSrc) return;
      // Pré-carrega já — mobile costuma demorar para iniciar; com preload=auto
      // o navegador começa a baixar imediatamente e o play() fica instantâneo.
      let a = audioRef.current;
      if (!a || a.src !== audioSrc) {
        if (a) { try { a.pause(); } catch { /* noop */ } }
        a = new Audio();
        a.preload = 'auto';
        a.crossOrigin = 'anonymous';
        // @ts-expect-error - controlsList não tipado em todos os browsers
        a.controlsList = 'nodownload noremoteplayback noplaybackrate';
        a.src = audioSrc;
        try { a.load(); } catch { /* noop */ }
        a.addEventListener('play', () => { setPlaybackError(null); setPlaying(true); });
        a.addEventListener('pause', () => setPlaying(false));
        a.addEventListener('ended', () => setPlaying(false));
        a.addEventListener('timeupdate', () => setAudioTime(a!.currentTime || 0));
        a.addEventListener('loadedmetadata', () => setAudioDuration(a!.duration || 0));
        a.addEventListener('error', () => setPlaying(false));
        audioRef.current = a;
      }
      a.muted = false;
      a.volume = 1;
      setMuted(false);
      const start = () => a!.play().then(() => setPlaying(true));
      start().catch(() => {
        // Bloqueado sem gesto — inicia no primeiro toque na página
        attachGestureFallback(() => audioRef.current?.play().then(() => setPlaying(true)) ?? Promise.resolve());
      });
      return () => { if (cleanup) cleanup(); };
    }

    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    setMuted(false);
    v.play()
      .then(() => { setPlaying(true); registerGuestPlayView(); })
      .catch(() => {
        // Tenta mudo (permitido pela política de autoplay da maioria)
        v.muted = true;
        setMuted(true);
        v.play()
          .then(() => { setPlaying(true); registerGuestPlayView(); })
          .catch(() => {
            // Último recurso: dispara no primeiro gesto do usuário
            attachGestureFallback(() => {
              const vid = videoRef.current;
              if (!vid) return;
              vid.muted = false;
              setMuted(false);
              return vid.play().then(() => { setPlaying(true); registerGuestPlayView(); });
            });
          });
      });

    return () => { if (cleanup) cleanup(); };
  }, [item]);



  // Registra visualização SOMENTE quando o usuário aperta play (não na abertura
  // da página). Função reutilizável invocada por togglePlayPause logo após o
  // play() do <video> ou <audio> resolver com sucesso.
  const registerGuestPlayView = useCallback(async () => {
    if (!item || item.locked || viewRegistered) return;
    setViewRegistered(true);
    try {
      const resp = await fetch(
        `${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/oculto_play_guest_register_view`,
        {
          method: 'POST',
          headers: {
            apikey: EXTERNAL_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({ p_item_id: item.id }),
        },
      );
      if (!resp.ok) return;
      const data = await resp.json().catch(() => null);
      if (typeof data === 'number' && data > 0) {
        setItem((cur) => (cur ? { ...cur, view_count: data } : cur));
      }
    } catch { /* noop */ }
  }, [item, viewRegistered]);

  const guestBlock = (reason: string) => {
    if (user) {
      // Logado: navega para o feed real do PLAY com o item em foco
      navigate(`/oculto-play?item=${id}`);
      return;
    }
    // Visitante: NÃO abre modal — apenas um toast discreto que não interrompe
    // a reprodução. O único caminho para cadastro é o botão "Criar conta".
    try { sessionStorage.setItem('oculto_play_return_item', id || ''); } catch { /* noop */ }
    toast(`Crie sua conta grátis para ${reason}.`, {
      duration: 2800,
      action: {
        label: 'Criar conta',
        onClick: () => navigate(`/signup?from=play${id ? `&item=${id}` : ''}`),
      },
    });
  };

  const togglePlayPause = () => {
    if (!item || item.locked) {
      guestBlock('assistir a este conteúdo exclusivo');
      return;
    }
    setPlaybackError(null);
    if (item.kind === 'audio') {
      const audioSrc = item.audio_url || item.media_url;
      if (!audioSrc) {
        setPlaybackError('Áudio indisponível. Tente atualizar a página.');
        return;
      }
      setPlaying(true);
      let a = audioRef.current;
      if (!a || a.src !== audioSrc) {
        if (a) { try { a.pause(); } catch { /* noop */ } }
        a = new Audio(audioSrc);
        a.preload = 'auto';
        a.crossOrigin = 'anonymous';
        // @ts-expect-error - controlsList ainda não tipado em todos os browsers
        a.controlsList = 'nodownload noremoteplayback noplaybackrate';
        a.addEventListener('play', () => { setPlaybackError(null); setPlaying(true); });
        a.addEventListener('pause', () => setPlaying(false));
        a.addEventListener('ended', () => setPlaying(false));
        a.addEventListener('timeupdate', () => setAudioTime(a!.currentTime || 0));
        a.addEventListener('loadedmetadata', () => setAudioDuration(a!.duration || 0));
        a.addEventListener('error', () => {
          setPlaying(false);
          setPlaybackError('Não foi possível carregar este áudio.');
        });
        audioRef.current = a;
      }
      a.muted = false;
      a.volume = 1;
      setMuted(false);
      if (a.paused) {
        a.play()
          .then(() => { setPlaying(true); registerGuestPlayView(); })
          .catch(() => {
            setPlaying(false);
            setPlaybackError('Não foi possível iniciar o áudio. Toque novamente para reproduzir.');
          });
      }
      else { a.pause(); setPlaying(false); }
    } else {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        v.play()
          .then(() => { setPlaying(true); registerGuestPlayView(); })
          .catch(() => {
            setPlaying(false);
            setPlaybackError('Não foi possível iniciar o vídeo. Toque novamente para reproduzir.');
          });
      }
      else { v.pause(); setPlaying(false); }
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
    if (a) a.muted = next;
  };

  const isVideo = item?.kind === 'short_video' || item?.kind === 'vip_teaser';
  const isAudio = item?.kind === 'audio';
  const isMeme = item?.kind === 'meme';
  const isLink = item?.kind === 'link';


  const recoverVideoPlayback = useCallback((reason: 'error' | 'waiting' | 'stalled') => {
    const v = videoRef.current;
    if (!v || item?.locked || !item?.media_url) return;
    if (videoRetryTimerRef.current) return;
    const attempt = videoRetryCountRef.current + 1;
    if (attempt > 3) {
      setPlaying(false);
      setPlaybackError('Este vídeo foi publicado em um formato instável. Publique novamente usando o corte automático do PLAY.');
      return;
    }
    videoRetryCountRef.current = attempt;
    const resumeAt = Math.max(0, v.currentTime || lastVideoTimeRef.current || 0);
    const delay = reason === 'error' ? 500 + attempt * 600 : 900;
    videoRetryTimerRef.current = window.setTimeout(() => {
      videoRetryTimerRef.current = null;
      const el = videoRef.current;
      if (!el || !item?.media_url) return;
      try {
        el.muted = muted;
        if (reason === 'error' || attempt >= 2 || el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
          el.src = item.media_url;
          el.load();
        } else if (resumeAt > 0 && Number.isFinite(resumeAt)) {
          el.currentTime = resumeAt + 0.03;
        }
      } catch { /* noop */ }
      const play = () => {
        try { if (resumeAt > 0 && Number.isFinite(resumeAt)) el.currentTime = resumeAt; } catch { /* noop */ }
        el.play()
          .then(() => { setPlaying(true); setPlaybackError(null); registerGuestPlayView(); })
          .catch(() => setPlaying(false));
      };
      if (el.readyState >= 1) play();
      else el.addEventListener('loadedmetadata', play, { once: true });
    }, delay);
  }, [item?.locked, item?.media_url, muted, registerGuestPlayView]);

  const recoverFrozenVideoFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || item?.locked || !item?.media_url || v.paused || v.ended) return;
    const attempt = videoDecoderRecoveryCountRef.current + 1;
    videoDecoderRecoveryCountRef.current = attempt;
    const resumeAt = Math.max(0, v.currentTime || lastVideoTimeRef.current || 0);
    if (attempt > 5) {
      v.pause();
      setPlaying(false);
      setPlaybackError('Este vídeo tinha falhas de quadros e foi estabilizado. Toque para tentar novamente.');
      return;
    }
    try {
      if (attempt <= 4) {
        const jumps = [0.08, 1.5, 4, 8];
        const jump = jumps[Math.min(jumps.length - 1, attempt - 1)] ?? 0.08;
        const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Number.POSITIVE_INFINITY;
        v.currentTime = Math.max(0, Math.min(duration - 0.08, resumeAt + jump));
      } else {
        v.pause();
        v.src = item.media_url;
        v.load();
        const restore = () => {
          try { v.currentTime = resumeAt; } catch { /* noop */ }
          v.play().then(() => { setPlaying(true); setPlaybackError(null); }).catch(() => setPlaying(false));
        };
        if (v.readyState >= 1) restore();
        else v.addEventListener('loadedmetadata', restore, { once: true });
        return;
      }
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } catch { /* noop */ }
  }, [item?.locked, item?.media_url]);

  useEffect(() => {
    const v = videoRef.current as (HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, metadata: { mediaTime: number }) => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    }) | null;
    if (!v || !isVideo) return;
    const rvfc = v.requestVideoFrameCallback;
    if (typeof rvfc !== 'function') return;
    let cancelled = false;
    const loop = (now: number, metadata: { mediaTime: number }) => {
      if (cancelled) return;
      lastVideoFrameAtRef.current = now;
      lastVideoFrameMediaTimeRef.current = Number(metadata.mediaTime || 0);
      try { frameCallbackIdRef.current = rvfc.call(v, loop); } catch { frameCallbackIdRef.current = null; }
    };
    try { frameCallbackIdRef.current = rvfc.call(v, loop); } catch { frameCallbackIdRef.current = null; }
    const monitor = window.setInterval(() => {
      const el = videoRef.current;
      if (!el || el.paused || el.ended || document.hidden) return;
      const now = performance.now();
      const current = Math.max(0, el.currentTime || 0);
      if (current > lastVideoFrameMediaTimeRef.current + 1.1 && now - lastVideoFrameAtRef.current > 2600) {
        recoverFrozenVideoFrame();
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(monitor);
      if (frameCallbackIdRef.current != null && v.cancelVideoFrameCallback) {
        try { v.cancelVideoFrameCallback(frameCallbackIdRef.current); } catch { /* noop */ }
      }
      frameCallbackIdRef.current = null;
    };
  }, [isVideo, item?.media_url, recoverFrozenVideoFrame]);

  const resolvedItemId = item?.id || id || '';
  const backTarget = user ? '/feed' : '/';

  const handleShareClick = async () => {
    const url = ocultoPlayShareUrl(resolvedItemId);
    const shareTitle = item?.title || 'OCULTO PLAY';
    try {
      if ('share' in navigator && typeof navigator.share === 'function') {
        await navigator.share({ title: shareTitle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      // Compartilhar é PERMITIDO para visitante (espalha o link)
    } catch { /* noop */ }
  };

  const playerArea = useMemo(() => {
    if (!item) return null;
    if (item.locked) {
      return (
        <div className="absolute inset-0 grid place-items-center bg-black/80 backdrop-blur-md">
          <div className="text-center p-4 max-w-xs">
            <Crown className="h-10 w-10 mx-auto text-amber-400" />
            <p className="mt-2 text-sm font-semibold text-white">Conteúdo exclusivo</p>
            <p className="mt-1 text-xs text-white/80">
              Este item é {item.visibility === 'vip' ? 'VIP' : 'Premium'}. Crie sua conta gratuita
              para ver as opções de acesso.
            </p>
            <Button
              size="sm"
              className="mt-3 bg-gradient-to-r from-fuchsia-500 to-rose-500"
              onClick={() => guestBlock('acessar conteúdo exclusivo')}
            >
              Criar conta grátis
            </Button>
          </div>
        </div>
      );
    }
    const trailerStart = Number(item.trailer_trim_start_seconds ?? 0) || 0;
    const trailerEnd = Number(item.trailer_trim_end_seconds ?? 0) || 0;
    const hasPrimaryTrailerTrim = trailerEnd > trailerStart;
    // Trailer pronto enviado: usado somente quando não há janela de recorte da mídia principal.
    // Pode ser arquivo direto (.mp4/.webm) OU link externo (YouTube/Vimeo/TikTok/embed).
    if (item.trailer_url && !hasPrimaryTrailerTrim) {
      const parsedTrailer = parseEmbeddedVideo(item.trailer_url);
      const isDirectFile = !parsedTrailer || parsedTrailer.kind === 'direct';
      if (!isDirectFile) {
        return (
          <div className="absolute inset-0 bg-black">
            <OcultoPlayLinkPlayer
              sourceUrl={item.trailer_url}
              thumbUrl={item.thumb_url}
              itemId={item.id}
              autoPlay
              lazyClickToPlay={false}
              className="!aspect-auto h-full w-full"
              onPlayedThreshold={registerGuestPlayView}
            />
          </div>
        );
      }
      return (
        <div className="absolute inset-0 bg-black">
          <video
            ref={videoRef}
            src={item.trailer_url}
            poster={item.thumb_url ?? undefined}
            playsInline
            loop
            autoPlay
            preload="auto"
            muted={muted}
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            className="absolute inset-0 w-full h-full object-contain bg-black"
            onPlaying={() => { setPlaybackError(null); setPlaying(true); registerGuestPlayView(); }}
            onPause={() => setPlaying(false)}
            onClick={togglePlayPause}
          />
        </div>
      );
    }
    if (item.kind === 'link' && (item.source_url || item.media_url)) {
      const src = item.source_url || item.media_url || '';
      return (
        <div className="absolute inset-0 bg-black">
          {hasPrimaryTrailerTrim && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 backdrop-blur">
              Trailer · {Math.round(trailerEnd - trailerStart)}s
            </div>
          )}
          <OcultoPlayLinkPlayer
            sourceUrl={src}
            thumbUrl={item.thumb_url}
            itemId={item.id}
            autoPlay
            lazyClickToPlay={false}
            className="!aspect-auto h-full w-full"
            onPlayedThreshold={registerGuestPlayView}
            startSeconds={trailerStart}
            endSeconds={trailerEnd}
          />
        </div>
      );
    }

    if (isVideo && item.media_url) {
      return (
        <video
          ref={videoRef}
          src={item.media_url}
          poster={item.thumb_url ?? undefined}
          playsInline
          loop
          autoPlay
          preload="auto"
          crossOrigin="anonymous"
          muted={muted}
          controlsList="nodownload noremoteplayback noplaybackrate nofullscreen"
          disablePictureInPicture
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (trailerStart > 0) { try { v.currentTime = trailerStart; } catch { /* noop */ } }
            lastVideoProgressAtRef.current = performance.now();
            lastVideoTimeRef.current = Math.max(0, v.currentTime || 0);
          }}
          onPlaying={(e) => {
            videoRetryCountRef.current = 0;
            videoDecoderRecoveryCountRef.current = 0;
            lastVideoProgressAtRef.current = performance.now();
            lastVideoFrameAtRef.current = performance.now();
            lastVideoTimeRef.current = Math.max(0, e.currentTarget.currentTime || 0);
            setPlaybackError(null);
            setPlaying(true);
          }}
          onTimeUpdate={(e) => {
            lastVideoProgressAtRef.current = performance.now();
            lastVideoTimeRef.current = Math.max(0, e.currentTarget.currentTime || 0);
            if (trailerEnd > 0 && e.currentTarget.currentTime >= trailerEnd) {
              try { e.currentTarget.currentTime = trailerStart || 0; } catch { /* noop */ }
            }
          }}
          onWaiting={(e) => {
            const v = e.currentTarget;
            window.setTimeout(() => {
              if (!videoRef.current || videoRef.current !== v || v.paused || v.ended) return;
              const noProgress = performance.now() - lastVideoProgressAtRef.current > 2200;
              if (noProgress && v.readyState < 3) recoverVideoPlayback('waiting');
            }, 2300);
          }}
          onStalled={() => recoverVideoPlayback('stalled')}
          onError={() => recoverVideoPlayback('error')}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 w-full h-full object-contain bg-black select-none"
          onClick={togglePlayPause}
        />
      );
    }


    if (isAudio) {
      const audioSrc = item.audio_url || item.media_url;
      const fmt = (s: number) => {
        if (!isFinite(s) || s <= 0) return '0:00';
        const m = Math.floor(s / 60);
        const r = Math.floor(s % 60);
        return `${m}:${r.toString().padStart(2, '0')}`;
      };
      const pct = audioDuration > 0 ? Math.min(100, (audioTime / audioDuration) * 100) : 0;
      const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const a = audioRef.current;
        if (!a || !audioDuration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        a.currentTime = ratio * audioDuration;
        setAudioTime(a.currentTime);
      };
      return (
        <>
          {item.thumb_url ? (
            <img
              src={item.thumb_url}
              alt={item.title ?? ''}
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/70">
              <Play className="h-16 w-16" />
            </div>
          )}
          {!audioSrc && (
            <div className="absolute inset-x-3 top-12 rounded-xl border border-rose-400/40 bg-black/80 px-3 py-2 text-xs text-white backdrop-blur">
              Áudio indisponível.
            </div>
          )}
          {audioSrc && (
            <div className="absolute left-3 right-3 bottom-16 z-20 rounded-full bg-black/70 backdrop-blur px-3 py-2 flex items-center gap-2 border border-white/10">
              <button
                onClick={togglePlayPause}
                aria-label={playing ? 'Pausar' : 'Reproduzir'}
                className="h-7 w-7 grid place-items-center rounded-full bg-fuchsia-500 text-white shrink-0"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" />}
              </button>
              <span className="text-[10px] text-white/90 tabular-nums shrink-0">{fmt(audioTime)}</span>
              <div
                role="slider"
                aria-label="Progresso do áudio"
                aria-valuenow={Math.round(pct)}
                onClick={onSeek}
                className="flex-1 h-1.5 rounded-full bg-white/15 cursor-pointer overflow-hidden"
              >
                <div className="h-full bg-gradient-to-r from-fuchsia-400 to-rose-400" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-white/70 tabular-nums shrink-0">{fmt(audioDuration)}</span>
            </div>
          )}
        </>
      );
    }
    if (isMeme && item.thumb_url) {
      return (
        <img
          src={item.thumb_url}
          alt={item.title ?? ''}
          className="absolute inset-0 w-full h-full object-contain bg-black"
        />
      );
    }
    return item.thumb_url ? (
      <img src={item.thumb_url} alt={item.title ?? ''} className="absolute inset-0 w-full h-full object-cover" />
    ) : (
      <div className="absolute inset-0 grid place-items-center text-muted-foreground">
        <Play className="h-12 w-12" />
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, muted, playing, audioTime, audioDuration, isVideo, isAudio, isMeme, registerGuestPlayView]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-black via-zinc-950 to-black flex flex-col">
      {/* Header minimal */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/50 border-b border-white/10">
        <div className="max-w-md mx-auto flex items-center justify-between px-3 py-2">
          <Link to={backTarget} replace className="flex items-center gap-2">
            <Logo className="h-7 w-auto" />
            <span className="text-xs font-bold text-white/90 tracking-wider">PLAY</span>
          </Link>
          {user ? (
            <Link to={`/oculto-play${resolvedItemId ? `?item=${resolvedItemId}` : ''}`}>
              <Button size="sm" variant="ghost" className="text-white h-8 text-xs">
                Abrir PLAY completo
              </Button>
            </Link>
          ) : (
            <div className="flex gap-1">
              <Link to={`/login?from=play${resolvedItemId ? `&item=${resolvedItemId}` : ''}`}>
                <Button size="sm" variant="ghost" className="text-white h-8 text-xs">Entrar</Button>
              </Link>
              <Link to={`/signup?from=play${resolvedItemId ? `&item=${resolvedItemId}` : ''}`}>
                <Button size="sm" className="h-8 text-xs bg-gradient-to-r from-fuchsia-500 to-rose-500">
                  Criar conta
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto px-3 py-4 space-y-3">
        {/* Player card */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-[3/4] shadow-2xl">
          {loading && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          )}
          {!loading && !item && (
            <div className="absolute inset-0 grid place-items-center text-white/70 text-sm p-5 text-center">
              Conteúdo indisponível. Atualize o acesso público do PLAY no banco e tente novamente.
            </div>
          )}
          {playerArea}

          {playbackError && (
            <div className="absolute left-3 right-3 top-12 z-20 rounded-xl border border-rose-400/40 bg-black/80 px-3 py-2 text-xs text-white backdrop-blur">
              {playbackError}
            </div>
          )}

          {/* Tags topo */}
          {item && (
            <div className="absolute top-2 left-2 flex gap-1 z-10">
              <span className="text-[10px] uppercase tracking-wider bg-black/65 text-white px-2 py-0.5 rounded backdrop-blur-sm">
                {KIND_LABEL[item.kind] || item.kind}
              </span>
              {item.visibility === 'vip' && (
                <span className="text-[10px] bg-amber-500/90 text-black px-2 py-0.5 rounded font-bold">VIP</span>
              )}
              {item.visibility === 'premium' && (
                <span className="text-[10px] bg-fuchsia-500/90 text-white px-2 py-0.5 rounded font-bold">PREMIUM</span>
              )}
            </div>
          )}

          {/* Controles play/pause + mute */}
          {item && !item.locked && (isVideo || isAudio) && (
            <div className="absolute bottom-3 right-3 z-10 flex gap-2">
              {isVideo && (
                <button
                  onClick={toggleMute}
                  className="h-9 w-9 grid place-items-center rounded-full bg-black/70 text-white border border-white/20"
                  aria-label={muted ? 'Ativar som' : 'Silenciar'}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={togglePlayPause}
                className="h-11 w-11 grid place-items-center rounded-full bg-fuchsia-500 text-white shadow-lg"
                aria-label={playing ? 'Pausar' : 'Reproduzir'}
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
              </button>
            </div>
          )}

          {/* Métricas rodapé */}
          {item && (
            <div className="absolute bottom-0 inset-x-0 p-3 pr-20 bg-gradient-to-t from-black/85 to-transparent text-white">
              {item.title && <p className="text-sm font-semibold line-clamp-2">{item.title}</p>}
              <div className="flex items-center gap-3 mt-1 text-[11px] text-white/85">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {item.view_count}</span>
                <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {item.like_count}</span>
                <span className="flex items-center gap-1"><Share2 className="h-3 w-3" /> {item.share_count}</span>
              </div>
            </div>
          )}
        </div>

        {/* Autor */}
        {item && (
          <button
            type="button"
            onClick={() => guestBlock('ver o perfil do criador')}
            className="w-full flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-2 text-left"
          >
            {item.author_avatar_url ? (
              <img
                src={buildSupabaseImageThumb(item.author_avatar_url, { width: 96, height: 96, quality: 75, resize: 'cover' }) ?? item.author_avatar_url}
                alt=""
                loading="lazy"
                decoding="async"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full object-cover object-center bg-white/10"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-muted" />
            )}
            <div className="text-sm text-white flex-1">
              <div className="font-medium">
                {item.author_username ? `@${item.author_username}` : item.author_display_name || 'Criador'}
              </div>
              <div className="text-[11px] text-white/60">
                {(() => {
                  if (!item.published_at) return 'Publicado recentemente';
                  const d = new Date(item.published_at);
                  return isNaN(d.getTime()) ? 'Publicado recentemente' : d.toLocaleDateString('pt-BR');
                })()}
              </div>
            </div>
            <span className="text-[11px] text-white/60">Ver perfil →</span>
          </button>
        )}

        {/* Caption */}
        {item?.caption && (
          <p className="text-sm text-white/85 px-1">{item.caption}</p>
        )}

        {/* Ações */}
        {item && (
          <div className="grid grid-cols-5 gap-2">
            <ActionButton icon={<Heart className="h-4 w-4" />} label="Curtir" onClick={() => guestBlock('curtir')} />
            <ActionButton icon={<MessageCircle className="h-4 w-4" />} label="Comentar" onClick={() => guestBlock('comentar')} />
            <ActionButton icon={<Bookmark className="h-4 w-4" />} label="Salvar" onClick={() => guestBlock('salvar')} />
            <ActionButton icon={<FolderPlus className="h-4 w-4" />} label="Coleção" onClick={() => guestBlock('adicionar à sua coleção')} />
            <ActionButton icon={<Share2 className="h-4 w-4" />} label="Enviar" onClick={handleShareClick} />
          </div>
        )}

        {/* Banner +18 / convite cadastro (somente visitante) */}
        {!user && item && (
          <div className="rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 via-pink-500/5 to-rose-500/10 p-3 text-sm text-white">
            <p className="flex items-center gap-1.5 font-semibold text-fuchsia-200">
              <ShieldCheck className="h-4 w-4" /> OCULTO é uma rede social adulta +18
            </p>
            <p className="text-white/80 text-xs mt-1">
              Crie sua conta gratuita para curtir, comentar, salvar em coleções, mandar mensagens e
              explorar todo o universo do OCULTO PLAY.
            </p>
            <Link to={`/signup?from=play${resolvedItemId ? `&item=${resolvedItemId}` : ''}`}>
              <Button className="mt-3 w-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500">
                Criar minha conta grátis
              </Button>
            </Link>
          </div>
        )}

        <Link to={backTarget} replace className="block text-center text-xs text-white/40 mt-4 hover:text-white/70">
          <ArrowLeft className="inline h-3 w-3 mr-1" /> {user ? 'Voltar ao feed' : 'Voltar ao início'}
        </Link>
      </main>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px]"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
