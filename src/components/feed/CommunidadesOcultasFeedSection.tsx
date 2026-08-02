/**
 * Comunidades Ocultas — sessão de destaque no feed.
 * Carrossel horizontal com várias comunidades:
 *   - Mobile: scroll invisível, swipe livre (snap por card).
 *   - Desktop: barra inferior colorida (fucsia/pink/âmbar).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Users2,
  MessageSquare,
  Clock,
  ArrowRight,
  Plus,
  LogIn,
  Loader2,
  Globe,
  Lock,
  Crown,
  Star,
  Sparkles,
  Tags,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import {
  useCommunities,
  useMyMembership,
  useJoinCommunity,
  useCommunityMemberPreviews,
  useCommunityCategories,
  type Community,
} from '@/hooks/useCommunities';
import { useCommunityRecentTopicCounts } from '@/hooks/useCommunityRecentTopicCounts';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import { CarouselScrollbar } from './CarouselScrollbar';
import { useFeedExperienceMode } from '@/hooks/useFeedExperienceMode';

function visibilityMeta(v: Community['visibility']) {
  switch (v) {
    case 'private':           return { label: 'Privada',   icon: Lock,     cls: 'bg-slate-900/70 text-slate-100 border-slate-500/50' };
    case 'premium_only':      return { label: 'Premium',   icon: Star,     cls: 'bg-cyan-900/70 text-cyan-100 border-cyan-400/50' };
    case 'vip_only':          return { label: 'VIP',       icon: Crown,    cls: 'bg-amber-900/70 text-amber-100 border-amber-400/50' };
    case 'creator_exclusive': return { label: 'Criadores', icon: Sparkles, cls: 'bg-pink-900/70 text-pink-100 border-pink-400/50' };
    default:                  return { label: 'Pública',   icon: Globe,    cls: 'bg-emerald-900/70 text-emerald-100 border-emerald-400/50' };
  }
}

function timeAgo(iso: string | null) {
  if (!iso) return 'novo';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mês`;
}

function communityTypeLabel(pick: Community, categoryName?: string | null) {
  if (pick.is_adult) return '+18';
  const raw = (categoryName || '').trim();
  if (raw) return raw.length > 18 ? raw.slice(0, 18).trim() + '…' : raw;
  const text = `${pick.title} ${pick.description ?? ''}`.toLowerCase();
  if (/humor|meme|piada|engraç/.test(text)) return 'Humor';
  if (/vida real|relato|história|casal/.test(text)) return 'Vida Real';
  if (/mist[eé]rio|segredo|curiosidade/.test(text)) return 'Mistérios';
  return 'Comunidade';
}

// Sem limite: mostra TODAS as comunidades ativas e públicas no carrossel.
const MAX_CARDS = Number.POSITIVE_INFINITY;

type CardProps = {
  pick: Community;
  previews?: Array<{ user_id: string; username: string | null; avatar_url: string | null }>;
  newTopicsCount: number;
  categoryName?: string | null;
};

function CommunityHeroCard({ pick, previews, newTopicsCount, categoryName }: CardProps) {
  const navigate = useNavigate();
  const v = visibilityMeta(pick.visibility);
  const VIcon = v.icon;
  const isPrivate = pick.visibility === 'private' || pick.require_join_approval;
  const typeLabel = communityTypeLabel(pick, categoryName);
  const accent = pick.accent_color || '#a855f7';

  const { data: membership } = useMyMembership(pick.id);
  const join = useJoinCommunity(pick.id);
  const isMember = membership?.status === 'active';
  const isPending = membership?.status === 'pending';

  const handleEntrar = () => {
    if (isMember) {
      navigate(`/comunidades/${pick.slug}`);
      return;
    }
    if (isPending) return;
    join.mutate(undefined, {
      onSuccess: () => navigate(`/comunidades/${pick.slug}`),
    });
  };

  return (
    <article
      className="group/com relative shrink-0 snap-start rounded-2xl overflow-hidden border text-white transition-all duration-200 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-black w-[80vw] max-w-[380px] sm:w-[340px] h-[426px] sm:h-[438px] flex flex-col"
      style={{
        background: `linear-gradient(160deg, ${accent} 0%, ${accent}cc 35%, #1a0b2e 100%)`,
        borderColor: `${accent}80`,
        boxShadow: `0 10px 30px -12px ${accent}99`,
        // @ts-expect-error custom property
        '--tw-ring-color': accent,
      }}
    >
      {/* Cover: edge-to-edge, fixed aspect ratio for consistency */}
      <div className="relative w-full h-[168px] sm:h-[182px] overflow-hidden bg-purple-950/40">
        {pick.cover_url ? (
          <>
            <img
              src={buildSupabaseImageThumb(pick.cover_url, { width: 96, quality: 50 }) ?? pick.cover_url}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-60"
            />
            <img
              src={buildSupabaseImageThumb(pick.cover_url, { width: 720, quality: 80 }) ?? pick.cover_url}
              alt={`Banner da comunidade ${pick.title}`}
              loading="lazy"
              decoding="async"
              className="relative h-full w-full object-cover transition-transform duration-700 ease-out group-hover/com:scale-[1.03]"
              style={{ objectPosition: `${pick.cover_position_x ?? 50}% ${pick.cover_position_y ?? 50}%` }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${accent}66, transparent 70%)` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30 pointer-events-none" />

        {/* Top badges row */}
        <div className="absolute top-3 left-3 right-3 flex h-6 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span className={`inline-flex h-6 max-w-[112px] shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-black uppercase tracking-wide ${v.cls}`}>
              <VIcon className="h-3 w-3 shrink-0" /> <span className="truncate">{v.label}</span>
            </span>
            <span className="inline-flex h-6 min-w-0 max-w-[132px] items-center gap-1 rounded-full border border-white/30 bg-black/55 px-2 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur-sm">
              <Tags className="h-3 w-3 shrink-0" /> <span className="truncate">{typeLabel}</span>
            </span>
          </div>
          <span
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm"
            style={{ backgroundColor: `${accent}cc`, borderColor: '#ffffff66' }}
          >
            <Sparkles className="h-3 w-3 shrink-0" /> <span className="whitespace-nowrap">Em Alta</span>
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="relative px-4 pt-3 pb-4 flex-1 flex flex-col">
        {/* Header: avatar + title aligned */}
        <div className="flex min-h-[58px] items-start gap-3">
          <div
            className="shrink-0 -mt-9 h-14 w-14 rounded-xl overflow-hidden bg-purple-950 ring-2 ring-white/80"
            style={{ boxShadow: `0 0 0 2px ${accent}, 0 6px 18px -4px ${accent}99` }}
            aria-hidden
          >
            {pick.avatar_url ? (
              <img
                src={pick.avatar_url}
                alt={`Foto da comunidade ${pick.title}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full grid place-items-center" style={{ background: `linear-gradient(135deg, ${accent}, #1a0b2e)` }}>
                <Users2 className="h-6 w-6 text-white/90" />
              </div>
            )}
          </div>
          <h3
            className="flex-1 min-w-0 text-base sm:text-lg font-black leading-tight line-clamp-2 min-h-[2.75rem] tracking-normal break-words [overflow-wrap:anywhere] pt-0.5"
            style={{
              background: 'linear-gradient(90deg, #ffffff 0%, #fde68a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {pick.title}
          </h3>
        </div>

        <p className="text-sm text-white/85 mt-2 line-clamp-2 min-h-[2.5rem] leading-snug">
          {pick.description || 'Comunidade sem descrição.'}
        </p>

        {/* Members preview + new today */}
        <div className="mt-3 flex min-h-[2rem] items-center gap-2 overflow-hidden">
          {previews && previews.length > 0 && (
            <>
              <div className="flex -space-x-2">
                {previews.slice(0, 4).map((m) => (
                  <div
                    key={m.user_id}
                    className="h-7 w-7 shrink-0 rounded-full border-2 border-white/50 overflow-hidden bg-purple-950 flex items-center justify-center"
                    title={m.username ?? ''}
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" width={28} height={28} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-3 w-3 text-purple-200" />
                    )}
                  </div>
                ))}
              </div>
              {pick.members_count > previews.length && (
                <span className="text-[11px] font-bold text-white/85">+{pick.members_count - previews.length}</span>
              )}
            </>
          )}
          {newTopicsCount > 0 && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_12px_-2px_rgba(251,191,36,0.6)]"
              title={`${newTopicsCount} ${newTopicsCount === 1 ? 'novo tópico' : 'novos tópicos'} nas últimas 24h`}
            >
              <MessageSquare className="h-3 w-3" />
              <span className="whitespace-nowrap">{newTopicsCount} {newTopicsCount === 1 ? 'novo' : 'novos'} hoje</span>
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-3 flex min-h-[18px] items-center gap-4 text-[12px] font-bold tracking-normal text-white/90">
          <span className="inline-flex min-w-0 items-center gap-1"><Users className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{pick.members_count}</span></span>
          <span className="inline-flex min-w-0 items-center gap-1"><MessageSquare className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{pick.topics_count}</span></span>
          <span className="inline-flex min-w-0 items-center gap-1"><Clock className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{timeAgo(pick.last_activity_at)}</span></span>
        </div>

        {/* CTA */}
        <Button
          className="mt-auto w-full h-10 bg-white hover:bg-amber-50 font-black text-[13px] sm:text-sm border-0 uppercase tracking-wide transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.99] px-3 whitespace-nowrap rounded-xl"
          style={{
            color: accent,
            boxShadow: `0 8px 20px -8px ${accent}cc`,
            // @ts-expect-error custom property
            '--tw-ring-color': accent,
          }}
          disabled={join.isPending || isPending}
          onClick={handleEntrar}
        >
          {join.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isMember ? (
            <><ArrowRight className="h-4 w-4 mr-1.5 shrink-0" /> Abrir</>
          ) : isPending ? (
            'Enviado'
          ) : (
            <><LogIn className="h-4 w-4 mr-1.5 shrink-0" /> {isPrivate ? 'Solicitar' : 'Entrar'}</>
          )}
        </Button>
      </div>
    </article>
  );
}

export function CommunidadesOcultasFeedSection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: communities = [], isLoading } = useCommunities();
  const { data: categories = [] } = useCommunityCategories();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useHorizontalDragScroll(scrollRef);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const child = el.children.item(i) as HTMLElement | null;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      if (kids.length === 0) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      kids.forEach((k, i) => {
        const c = k.offsetLeft + k.offsetWidth / 2;
        const d = Math.abs(c - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      setActiveIndex(best);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const onCarouselKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const total = scrollRef.current?.children.length ?? 0;
    if (!total) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollToIndex(Math.min(total - 1, activeIndex + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollToIndex(Math.max(0, activeIndex - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToIndex(total - 1);
    }
  };

  const { isOcultoOnly } = useFeedExperienceMode();
  const eligible = useMemo<Community[]>(() => {
    const list = (communities ?? []).filter((c) => {
      const active = c.status === 'active' && c.visibility !== 'private';
      if (isOcultoOnly && c.is_adult) return false;
      return active;
    });
    return Number.isFinite(MAX_CARDS) ? list.slice(0, MAX_CARDS) : list;
  }, [communities, isOcultoOnly]);

  // Garante que, no primeiro acesso pós-cadastro, a comunidade
  // "Alienígenas e Mistérios" apareça em primeiro lugar.
  const orderedEligible = useMemo<Community[]>(() => {
    if (eligible.length === 0) return eligible;
    const flagKey = user?.id ? `oculto:first-community-shown:${user.id}` : null;
    const alreadyShown = flagKey
      ? (() => { try { return localStorage.getItem(flagKey) === '1'; } catch { return true; } })()
      : true;
    if (alreadyShown) return eligible;
    const idx = eligible.findIndex((c) => {
      const hay = `${c.slug ?? ''} ${c.title ?? ''}`.toLowerCase();
      return hay.includes('alienig') || (hay.includes('acredito') && hay.includes('mist'));
    });
    if (idx <= 0) return eligible;
    const copy = eligible.slice();
    const [first] = copy.splice(idx, 1);
    copy.unshift(first);
    try { if (flagKey) localStorage.setItem(flagKey, '1'); } catch { /* noop */ }
    return copy;
  }, [eligible, user?.id]);

  const ids = useMemo(() => orderedEligible.map((c) => c.id), [orderedEligible]);
  const { data: previewsMap } = useCommunityMemberPreviews(ids);
  const { data: recentTopicMap } = useCommunityRecentTopicCounts(ids);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  if (isLoading) {
    return (
      <div className="my-4 mx-3 rounded-2xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-background p-5 h-[340px] animate-pulse" />
    );
  }

  if (orderedEligible.length === 0) {
    return (
      <div className="my-4 mx-3 rounded-2xl overflow-hidden border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-background text-white">
        <div className="flex items-center gap-2 px-3 pt-3">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/70 via-purple-600/60 to-amber-500/50 ring-1 ring-fuchsia-200/40" aria-hidden>
            <Users2 className="h-4 w-4 text-white" />
          </span>
          <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.2em] bg-gradient-to-r from-fuchsia-100 via-pink-100 to-amber-200 bg-clip-text text-transparent">
            Comunidades Ocultas
          </h3>
        </div>
        <div className="px-5 pb-5 pt-3">
          <h3 className="text-lg font-bold">Crie a primeira comunidade do Oculto</h3>
          <p className="text-sm text-purple-100/90 mt-1">
            Reúna pessoas com os mesmos interesses, abra tópicos e conduza conversas em um espaço só seu.
          </p>
          <Button
            className="mt-4 w-full h-12 bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-base font-semibold border-0"
            onClick={() => navigate('/comunidades?create=1')}
          >
            <Plus className="h-5 w-5 mr-2" /> Crie sua Comunidade
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 mx-3 rounded-2xl overflow-hidden border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-background">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/70 via-purple-600/60 to-amber-500/50 ring-1 ring-fuchsia-200/40 shadow-[0_0_20px_-4px_rgba(232,121,249,0.55)]"
            aria-hidden
          >
            <Users2 className="h-4 w-4 text-white" />
          </span>
          <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.2em] bg-gradient-to-r from-fuchsia-100 via-pink-100 to-amber-200 bg-clip-text text-transparent">
            Comunidades Ocultas
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => navigate('/comunidades?create=1')}
            className="rounded-full h-8 sm:h-auto sm:px-3 sm:py-1.5 px-3 text-[11px] font-extrabold inline-flex items-center justify-center gap-1 transition-colors bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white"
          >
            <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Criar</span>
          </button>
          <button
            onClick={() => navigate('/comunidades')}
            className="rounded-full h-8 sm:h-auto sm:px-3 sm:py-1.5 px-3 text-[11px] font-extrabold inline-flex items-center justify-center gap-1 transition-colors bg-gradient-to-r from-amber-400 to-fuchsia-500 hover:from-amber-300 hover:to-fuchsia-400 text-black"
          >
            <span className="hidden sm:inline">Ver todas</span> <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          id="comunidades-ocultas-scroll"
          tabIndex={0}
          role="region"
          aria-roledescription="carrossel"
          aria-label="Carrossel de comunidades ocultas. Use as setas esquerda e direita para navegar."
          onKeyDown={onCarouselKeyDown}
          className="feed-horizontal-scroll scrollbar-hide flex flex-row flex-nowrap items-stretch gap-3 overflow-x-auto overflow-y-hidden px-3 pt-3 pb-1 outline-none cursor-grab focus-visible:ring-2 focus-visible:ring-fuchsia-300/60 focus-visible:ring-inset"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            overscrollBehaviorX: 'contain',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
          }}
        >
          {orderedEligible.map((c, i) => (
            <div
              key={c.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${orderedEligible.length}: ${c.title ?? 'Comunidade'}`}
              className="contents"
            >
              <CommunityHeroCard
                pick={c}
                previews={previewsMap?.[c.id]}
                newTopicsCount={recentTopicMap?.get(c.id) ?? 0}
                categoryName={c.category_id ? categoryById.get(c.category_id) : null}
              />
            </div>
          ))}
        </div>

        {orderedEligible.length > 1 && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-fuchsia-950/80 via-fuchsia-950/40 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-9 w-9 rounded-full bg-black/60 backdrop-blur ring-1 ring-fuchsia-300/40 shadow-[0_0_16px_-2px_rgba(232,121,249,0.7)] animate-[peekNudge_1.8s_ease-in-out_infinite]"
            >
              <ArrowRight className="h-4 w-4 text-fuchsia-100" />
            </div>
            <style>{`
              @keyframes peekNudge {
                0%, 100% { transform: translate(0, -50%); opacity: 0.85; }
                50%      { transform: translate(-6px, -50%); opacity: 1; }
              }
            `}</style>
          </>
        )}
      </div>



      <CarouselScrollbar
        scrollRef={scrollRef}
        ariaLabel="Rolar carrossel das Comunidades Ocultas"
        controlsId="comunidades-ocultas-scroll"
        className="px-3 pb-3"
        variant="fuchsia"
      />
    </div>
  );
}
