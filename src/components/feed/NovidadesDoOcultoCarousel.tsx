import { useCallback, useEffect, useMemo, useRef, useState, memo, type TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Sparkles, Music2, Film, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useProfile } from '@/hooks/useProfile';
import {
  useOcultoFeedNews,
  useLatestPlayTitles,
  useOcultoFeedCards,
  useOcultoFeedPlayPicks,
  DEFAULT_FEED_CARDS,
  type OcultoFeedCardKey,
} from '@/hooks/useOcultoFeedNews';
import { getShareBaseUrl } from '@/lib/appConfig';
import { cn } from '@/lib/utils';

const ROTATE_MS = 4000;

function useInviteLink() {
  const { profile } = useProfile();
  const username = (profile?.username || '').replace(/^@+/, '');
  const { data: baseUrl } = useQuery({
    queryKey: ['welcome-base-invite-url'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('oculto_welcome_message_settings')
        .select('base_invite_url')
        .eq('id', 1)
        .maybeSingle();
      return (data as { base_invite_url?: string } | null)?.base_invite_url || '';
    },
  });
  const base = (baseUrl || getShareBaseUrl()).replace(/\/$/, '');
  return username ? `${base}/${username.toUpperCase()}` : '';
}

function CardShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full rounded-2xl border border-primary/40 bg-card px-4 py-3 flex flex-col justify-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm sm:text-base font-semibold text-foreground">{title}</h3>
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export const NovidadesDoOcultoCarousel = memo(function NovidadesDoOcultoCarousel() {
  const navigate = useNavigate();
  const link = useInviteLink();
  const { data: news = [] } = useOcultoFeedNews(4);
  const { data: latestMusics = [] } = useLatestPlayTitles('audio', 4);
  const { data: latestMovies = [] } = useLatestPlayTitles('link', 4);
  const { data: pickedMusics = [] } = useOcultoFeedPlayPicks('audio', 4);
  const { data: pickedMovies = [] } = useOcultoFeedPlayPicks('link', 4);
  const { data: cards = DEFAULT_FEED_CARDS } = useOcultoFeedCards();

  // Curadoria do painel tem prioridade; se vazia, cai no automático.
  const musics = pickedMusics.length > 0 ? pickedMusics : latestMusics;
  const movies = pickedMovies.length > 0 ? pickedMovies : latestMovies;

  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const pausedRef = useRef(false);
  const touchStartRef = useRef<number | null>(null);
  const touchEndRef = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const handleCopy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  }, [link]);

  const slides = useMemo(() => {
    const byKey: Partial<Record<OcultoFeedCardKey, React.ReactNode>> = {};

    byKey.link = (
      <CardShell key="link" icon={<Link2 className="h-4 w-4" />} title="Divulgue seu Link exclusivo">
        <div className="flex items-center gap-2 mt-0.5">
          <span className="truncate flex-1 text-foreground/90 font-medium">
            {link || 'Complete seu perfil para gerar seu link'}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!link}
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </CardShell>
    );

    byKey.news = (
      <CardShell key="news" icon={<Sparkles className="h-4 w-4" />} title="Novidades Recentes do Oculto">
        {news.length === 0 ? (
          <p>Em breve, novas funções por aqui.</p>
        ) : (
          <ul className="space-y-0.5">
            {news.slice(0, 4).map((n) => (
              <li key={n.id} className="truncate">
                <span className="mr-1">{n.emoji || '✨'}</span>
                {n.title}
              </li>
            ))}
          </ul>
        )}
      </CardShell>
    );

    byKey.musics = (
      <CardShell key="musics" icon={<Music2 className="h-4 w-4" />} title="Novas músicas no Oculto Play">
        {musics.length === 0 ? (
          <p>Nenhuma música publicada ainda.</p>
        ) : (
          <ul className="space-y-0.5">
            {musics.map((m) => (
              <li key={m.id} className="truncate">
                <button
                  type="button"
                  className="hover:text-primary transition-colors text-left"
                  onClick={() => navigate('/oculto-play?kind=audio')}
                >
                  🎵 {m.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardShell>
    );

    byKey.movies = (
      <CardShell key="movies" icon={<Film className="h-4 w-4" />} title="Novos filmes no Oculto Play">
        {movies.length === 0 ? (
          <p>Nenhum filme publicado ainda.</p>
        ) : (
          <ul className="space-y-0.5">
            {movies.map((m) => (
              <li key={m.id} className="truncate">
                <button
                  type="button"
                  className="hover:text-primary transition-colors text-left"
                  onClick={() => navigate('/oculto-play?kind=link')}
                >
                  🎬 {m.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardShell>
    );

    return [...cards]
      .filter((c) => c.is_active)
      .sort((a, b) => a.position - b.position)
      .map((c) => byKey[c.card_key])
      .filter(Boolean) as React.ReactNode[];
  }, [link, copied, handleCopy, news, musics, movies, navigate, cards]);

  const onTouchStart = (e: TouchEvent) => {
    touchEndRef.current = null;
    touchStartRef.current = e.targetTouches[0].clientX;
    pausedRef.current = true;
  };

  const onTouchMove = (e: TouchEvent) => {
    touchEndRef.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current) return;
    const distance = touchStartRef.current - touchEndRef.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      setIndex((i) => (i + 1) % slides.length);
    } else if (isRightSwipe) {
      setIndex((i) => (i - 1 + slides.length) % slides.length);
    }
    
    setTimeout(() => {
      pausedRef.current = false;
    }, 2000);
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => (slides.length > 0 ? (i + 1) % slides.length : 0));
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  useEffect(() => {
    setIndex((i) => (slides.length === 0 ? 0 : i % slides.length));
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <section
      className="px-3 pt-2 pb-1"
      aria-label="Novidades do Oculto"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Novidades do Oculto
        </h2>
      </div>

      <div 
        className="relative overflow-hidden rounded-2xl touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-out will-change-transform"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0 min-h-[112px]">
              {slide}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ir para o card ${i + 1}`}
            onClick={() => setIndex(i)}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === index ? 'w-4 bg-primary' : 'w-1.5 bg-primary/30'
            )}
          />
        ))}
      </div>
    </section>
  );
});

export default NovidadesDoOcultoCarousel;
