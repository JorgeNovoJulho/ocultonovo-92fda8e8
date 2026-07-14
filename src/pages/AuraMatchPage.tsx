import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePerfectPair, getMatchedProfileIds, type PairCard } from '@/hooks/usePerfectPair';
import { calculateCompatibility } from '@/data/tagsData';
import { detectHardware, computePerformanceProfile } from '@/services/deviceManager';
import { AuraField } from '@/components/aura-match/AuraField';
import { AuraQuickPanel } from '@/components/aura-match/AuraQuickPanel';
import { SuperDmPaymentModal } from '@/components/aura-match/SuperDmPaymentModal';
import { SuperLikeReceivedListener } from '@/components/aura-match/SuperLikeReceivedModal';
import { PerfectPairMatchModal } from '@/components/perfect-pair/PerfectPairMatchModal';
import { AuraSocialBanner } from '@/components/aura-match/AuraSocialBanner';
import { AuraProgressBadge } from '@/components/aura-match/AuraProgressBadge';
import { AuraDailyQuests } from '@/components/aura-match/AuraDailyQuests';
import { LazyMount } from '@/components/aura-match/LazyMount';
import { AuraQuestsSummary } from '@/components/aura-match/AuraQuestsSummary';
const AuraQuestsHistory = lazy(() => import('@/components/aura-match/AuraQuestsHistory').then(m => ({ default: m.AuraQuestsHistory })));
import { RareConnectionsRow } from '@/components/aura-match/RareConnectionsRow';
import { AuraAchievements } from '@/components/aura-match/AuraAchievements';
const AuraTopRanking = lazy(() => import('@/components/aura-match/AuraTopRanking').then(m => ({ default: m.AuraTopRanking })));
const AuraWeeklyChest = lazy(() => import('@/components/aura-match/AuraWeeklyChest').then(m => ({ default: m.AuraWeeklyChest })));
import { AuraBoostCard } from '@/components/aura-match/AuraBoostCard';
import { BoostLiveRegion } from '@/components/aura-match/BoostLiveRegion';
import { AuraStreakCard } from '@/components/aura-match/AuraStreakCard';
import { SocialIdentityCard } from '@/components/social/SocialIdentityCard';
import { AuraStatsTopBar } from '@/components/aura-match/AuraStatsTopBar';
import { NoiteOcultaBanner } from '@/components/social/NoiteOcultaBanner';
import { PresencePulseStrip } from '@/components/social/PresencePulseStrip';
import { SeasonProgressCard } from '@/components/social/SeasonProgressCard';
import { DestinoSocialCard } from '@/components/social/DestinoSocialCard';
import { MagneticEnergyToggle } from '@/components/social/MagneticEnergyToggle';
import { VipPassBadge } from '@/components/social/VipPassBadge';
import { ConexoesOcultasCard } from '@/components/social/ConexoesOcultasCard';
import { ExperienciasReaisStrip } from '@/components/social/ExperienciasReaisStrip';
import { useSocialBoosts } from '@/hooks/useSocialBoosts';
const AuraDuelsCard = lazy(() => import('@/components/aura-match/AuraDuelsCard').then(m => ({ default: m.AuraDuelsCard })));
const AuraSharedBondCard = lazy(() => import('@/components/aura-match/AuraSharedBondCard').then(m => ({ default: m.AuraSharedBondCard })));
const AuraAttentionsHistory = lazy(() => import('@/components/aura-match/AuraAttentionsHistory').then(m => ({ default: m.AuraAttentionsHistory })));
const AuraSignalHistory = lazy(() => import('@/components/aura-match/AuraSignalHistory').then(m => ({ default: m.AuraSignalHistory })));
import { AuraStormBanner } from '@/components/aura-match/AuraStormBanner';
import { AuraRoomsStrip } from '@/components/aura-match/AuraRoomsStrip';
import { AuraPassersbyCard } from '@/components/aura-match/AuraPassersbyCard';
import { AuraDailyCycleBanner } from '@/components/aura-match/AuraDailyCycleBanner';
import { useAuraEvent } from '@/hooks/useAuraEvent';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { useAuraDailyQuests } from '@/hooks/useAuraDailyQuests';
import { useAuraStorm } from '@/hooks/useAuraStorm';
import { useOnlineCount } from '@/hooks/useOnlineCount';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, Sparkles, Shuffle, UserCheck, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { bumpAuraInteraction, getAuraBoost } from '@/lib/auraMemory';
import { fireAuraMicroReward } from '@/lib/auraMicroReward';
import { toast } from 'sonner';
import { useAdminBypass } from '@/hooks/useAdminBypass';
import { useActiveAuraRoom } from '@/hooks/useActiveAuraRoom';
import { useFollowingIds } from '@/hooks/useFollows';
import { logger } from '@/lib/logger';

const LEGEND_ITEMS = [
  { label: 'Provocação', hue: 0 },
  { label: 'Tensão sutil', hue: 25 },
  { label: 'Atração intensa', hue: 50 },
  { label: 'Química proibida', hue: 135 },
] as const;

function AuraLegend() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: `hsl(${item.hue}, 90%, 55%)`,
              boxShadow: `0 0 6px hsl(${item.hue}, 90%, 55%)`,
            }}
          />
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// Cap de bolhas por rodada (todos os tiers): até 20 usuários reais por entrada,
// randomizados a cada visita ao Aura Match.
const AURAS_PER_TIER: Record<'low' | 'medium' | 'high', number> = {
  low: 20,
  medium: 20,
  high: 20,
};

const MASTER_PRIORITY_USERNAMES = new Set(['ocultomaster', 'casaltomate', 'casal tomate']);

const normalizePriorityName = (value: string | null | undefined) =>
  (value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').trim().toLowerCase();

function prioritizeAuraCards(cards: PairCard[], scoreOf?: (c: PairCard) => number) {
  return [...cards].sort((a, b) => {
    const aPriority = MASTER_PRIORITY_USERNAMES.has(normalizePriorityName(a.username || a.name));
    const bPriority = MASTER_PRIORITY_USERNAMES.has(normalizePriorityName(b.username || b.name));
    if (aPriority !== bPriority) return aPriority ? -1 : 1;

    // Auras verdes (>=90% afinidade) sobem antes de qualquer outro critério
    if (scoreOf) {
      const aGreen = scoreOf(a) >= 90;
      const bGreen = scoreOf(b) >= 90;
      if (aGreen !== bGreen) return aGreen ? -1 : 1;
    }

    const aHasMedia = !!a.avatar_url || (a.pair_photos?.length || 0) > 0;
    const bHasMedia = !!b.avatar_url || (b.pair_photos?.length || 0) > 0;
    if (aHasMedia !== bHasMedia) return aHasMedia ? -1 : 1;

    return (b.shared_tags_count ?? 0) - (a.shared_tags_count ?? 0);
  });
}

function computeScore(card: PairCard): number {
  // Affinity-first: shared tags weigh up to 60 points
  let score = 25;
  const shared = card.shared_tags_count ?? card.shared_tags?.length ?? 0;
  score += Math.min(60, shared * 12);
  if (card.distance_km != null) {
    if (card.distance_km < 5) score += 12;
    else if (card.distance_km < 25) score += 8;
    else if (card.distance_km < 100) score += 4;
  }
  const plan = (card.plan_type || '').toLowerCase();
  if (plan.includes('vip')) score += 4;
  else if (plan.includes('premium')) score += 2;
  return Math.max(5, Math.min(100, Math.round(score)));
}

function computeSharedTags(
  card: PairCard,
  selfSocial: string[],
  selfAdult: string[]
): string[] {
  const norm = (s: string) => (s || '').trim().toLowerCase();
  const selfSet = new Set([...selfSocial, ...selfAdult].map(norm).filter(Boolean));
  if (selfSet.size === 0) return [];
  const cardTags = [...(card.tags_social || []), ...(card.tags_adult || [])];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of cardTags) {
    const k = norm(t);
    if (!k || seen.has(k)) continue;
    if (selfSet.has(k)) {
      out.push(t);
      seen.add(k);
    }
  }
  return out;
}

export default function AuraMatchPage() {
  const location = useLocation();
  const pp = usePerfectPair({ mode: 'light', skipInitialMatchedFetch: true });
  const { profile } = useProfile();
  const { shouldBypass: isMasterAdmin } = useAdminBypass();
  const activeRoomSlug = useActiveAuraRoom((s) => s.currentSlug);
  const lastExitStatus = useActiveAuraRoom((s) => s.lastExitStatus);
  const lastExitAt = useActiveAuraRoom((s) => s.lastExitAt);
  const [auditPresence, setAuditPresence] = useState<{ slugs: string[]; checkedAt: number } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const onlineQuery = useOnlineCount();
  const onlineCount = onlineQuery.data ?? 0;
  const event = useAuraEvent(onlineCount);
  const { progress: auraProgress, awardXp: auraAwardXp } = useAuraProgress(true);
  const { progress: questProgress } = useAuraDailyQuests();
  const currentStorm = useAuraStorm();
  // Ref para "view_5_profiles" — conta apenas perfis distintos abertos nesta sessão.
  const viewedProfilesRef = useRef<Set<string>>(new Set());

  // Marca quest "visit_aura" assim que a página é montada
  useEffect(() => { questProgress('visit_aura', 1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Marca "join_storm" sempre que entramos na página durante uma Tempestade Social ativa.
  useEffect(() => {
    if (currentStorm) {
      try { questProgress('join_storm', 1); } catch {}
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [currentStorm?.id ?? null]);
  const [tier, setTier] = useState<'low' | 'medium' | 'high'>('medium');
  const [selected, setSelected] = useState<PairCard | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [extra, setExtra] = useState<PairCard[]>([]);
  const [priorityCards, setPriorityCards] = useState<PairCard[]>([]);
  // Inicia com seed aleatório → randomiza a ordem em cada entrada na página
  const [randomSeed, setRandomSeed] = useState(() => Date.now() + Math.floor(Math.random() * 1e6));
  const [randomRemaining, setRandomRemaining] = useState<number>(10);
  const [superCard, setSuperCard] = useState<PairCard | null>(null);
  const [superOpen, setSuperOpen] = useState(false);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  // Filtro: 'new' = esconde quem eu sigo (padrão); 'following' = só quem eu sigo
  const [followFilter, setFollowFilter] = useState<'new' | 'following'>('new');
  const { data: followingProfileIds = [] } = useFollowingIds();
  const followingSet = useMemo(() => new Set(followingProfileIds), [followingProfileIds]);
  const rtScheduledRef = useRef<number | null>(null);
  // ⚡ Gate de loading com teto rígido: nunca segura a tela por mais de 2.5s.
  // Mesmo que o usePerfectPair demore (RPC lenta, fallback grande), liberamos
  // o conteúdo imediatamente com o que já temos (priorityCards/extra).
  const [loadingGateExpired, setLoadingGateExpired] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLoadingGateExpired(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  const forcedRoomSlug = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('room');
  }, [location.search]);

  // Carrega IDs já com match mútuo do banco — mantém Demeter & cia. fora da seleção
  useEffect(() => {
    const pid = (profile as any)?.id;
    if (!pid) return;
    let cancelled = false;
    (async () => {
      const ids = await getMatchedProfileIds(pid);
      if (!cancelled) setMatchedIds((prev) => new Set([...prev, ...ids]));
    })();
    return () => { cancelled = true; };
  }, [profile]);

  // Quando um match novo é detectado, esconde imediatamente
  useEffect(() => {
    const m = pp.match as any;
    const id = m?.userId || m?.user_id || m?.id;
    if (id) setMatchedIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, [pp.match]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).rpc('get_aura_randomize_status');
      if (data?.remaining != null) setRandomRemaining(data.remaining);
    })();
  }, []);

  // Destaque visual do botão Randomize quando o usuário vem da missão "Ir agora".
  const [highlightRandomize, setHighlightRandomize] = useState(false);
  useEffect(() => {
    const onHighlight = () => {
      setHighlightRandomize(true);
      setTimeout(() => {
        const btn = document.querySelector<HTMLButtonElement>('[data-aura-action="randomize"]');
        btn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      // Mantém pulsando por 6s ou até o clique
      window.setTimeout(() => setHighlightRandomize(false), 6000);
    };
    window.addEventListener('aura-action:randomize', onHighlight);
    return () => window.removeEventListener('aura-action:randomize', onHighlight);
  }, []);


  const handleRandomize = async () => {
    const { data, error } = await (supabase as any).rpc('consume_aura_randomize');
    if (error) { toast.error('Erro ao randomizar'); return; }
    if (!data?.allowed) {
      toast.error('Limite diário atingido — volte amanhã (10/dia)');
      setRandomRemaining(0);
      return;
    }
    setRandomRemaining(data.remaining ?? 0);
    setRandomSeed((s) => s + 1);
    pp.refetch();
    try { questProgress('randomize_aura', 1); } catch {}
    toast.success(`Auras renovadas! (${data.remaining} restantes hoje)`);
  };

  useEffect(() => {
    try {
      const hw = detectHardware();
      const perf = computePerformanceProfile(hw);
      setTier(perf.tier);
    } catch {
      setTier('medium');
    }
  }, []);

  const cap = AURAS_PER_TIER[tier];

  // ⚡ Performance: consolidamos as DUAS varreduras de profiles (priority + pool)
  // em uma ÚNICA query paginada por updated_at. Antes: 2× (range 0-999) com .or() pesado
  // a cada randomSeed/profile.id — derrubava Realme C55. Agora: 1 query, dedupe em memória,
  // priorityCards e extra derivados da mesma fonte.
  useEffect(() => {
    if (pp.loading && priorityCards.length === 0 && extra.length === 0) {
      // permite que o pp carregue primeiro; mesmo assim seguimos.
    }
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, username, avatar_url, bio, plan_type, tags_social, tags_adult, birth_date, address_city, profile_type, gender, location_lat, location_lng, is_seed, is_invisible, banner_url')
        .or('is_invisible.is.null,is_invisible.eq.false')
        .order('updated_at', { ascending: false })
        .range(0, 119);
      if (cancelled || error || !rows) return;

      const selfId = (profile as any)?.id;
      const viewerLat = (profile as any)?.location_lat;
      const viewerLng = (profile as any)?.location_lng;

      const mapOne = (p: any): PairCard => {
        let age: number | null = null;
        if (p.birth_date) {
          const bd = new Date(p.birth_date);
          const t = new Date();
          age = t.getFullYear() - bd.getFullYear();
          if (t.getMonth() < bd.getMonth() || (t.getMonth() === bd.getMonth() && t.getDate() < bd.getDate())) age--;
        }
        let distance_km: number | null = null;
        if (viewerLat && viewerLng && p.location_lat && p.location_lng) {
          const R = 6371;
          const dLat = ((p.location_lat - viewerLat) * Math.PI) / 180;
          const dLng = ((p.location_lng - viewerLng) * Math.PI) / 180;
          const a2 =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((viewerLat * Math.PI) / 180) *
              Math.cos((p.location_lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          distance_km =
            Math.round(R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2)) * 10) / 10;
        }
        return {
          id: p.id,
          name: p.name || p.username || 'Usuário',
          username: p.username ?? null,
          avatar_url: p.avatar_url ?? null,
          bio: p.bio ?? null,
          plan_type: p.plan_type || 'free',
          tags_social: p.tags_social ?? [],
          tags_adult: p.tags_adult ?? [],
          pair_photos: null,
          pair_bio: null,
          shared_tags: [],
          age,
          distance_km,
          city: p.address_city ?? null,
          profile_type: p.profile_type ?? null,
          gender: p.gender ?? null,
          banner_url: p.banner_url ?? null,
        } as PairCard;
      };

      // Reais (não-seed) → priorityCards. Tudo (inclui seed) → fallback p/ extra.
      const reals = (rows as any[]).filter(
        (p) => p?.id && p.id !== selfId && (p.is_seed === false || p.is_seed == null),
      );
      setPriorityCards(reals.map(mapOne));

      // Pool extra: completa quando pp.cards está abaixo do cap.
      if (!pp.loading && pp.cards.length < cap) {
        const knownIds = new Set(pp.cards.map((c) => c.id));
        if (selfId) knownIds.add(selfId);
        matchedIds.forEach((id) => knownIds.add(id));
        const pool = (rows as any[]).filter(
          (p) => p?.id && !knownIds.has(p.id) && (p.is_invisible === false || p.is_invisible == null),
        );
        const shuffled = pool.map(mapOne).sort(() => Math.random() - 0.5);
        const prioritized = prioritizeAuraCards(shuffled);
        const needed = Math.max(0, cap - pp.cards.length);
        setExtra(prioritized.slice(0, needed));
      } else {
        setExtra([]);
      }
    })();
    return () => { cancelled = true; };
  }, [pp.cards, pp.loading, cap, profile?.id, (profile as any)?.location_lat, (profile as any)?.location_lng, randomSeed, matchedIds]);


  const merged = useMemo(() => {
    const seen = new Set<string>();
    const selfSocial = (profile as any)?.tags_social || [];
    const selfAdult = (profile as any)?.tags_adult || [];
    const matchedId = (pp.match as any)?.userId || (pp.match as any)?.user_id || null;
    // Priority sempre primeiro → garantem slots mesmo se pp.cards já estiver cheio
    const all = [...priorityCards, ...pp.cards, ...extra]
      .filter((c) => {
        if (!c?.id) return false;
        if (c.id === (profile as any)?.id) return false;
        if (matchedIds.has(c.id)) return false;
        if (matchedId && c.id === matchedId) return false;
        if (seen.has(c.id)) return false;
        // Filtro "seguindo": no modo 'new' esconde quem já sigo;
        // no modo 'following' mostra apenas quem sigo.
        const isFollowed = followingSet.has(c.id);
        if (followFilter === 'new' && isFollowed) return false;
        if (followFilter === 'following' && !isFollowed) return false;
        seen.add(c.id);
        return true;
      })
      .map((c) => {
        const shared = computeSharedTags(c, selfSocial, selfAdult);
        return { ...c, shared_tags: shared, shared_tags_count: shared.length } as PairCard;
      });
    return prioritizeAuraCards(all, computeScore).slice(0, cap);
  }, [pp.cards, extra, priorityCards, cap, profile, pp.match, matchedIds, followingSet, followFilter]);


  useEffect(() => {
    const scheduleRefetch = (bumpSeed = false) => {
      if (bumpSeed) setRandomSeed((s) => s + 1);
      if (rtScheduledRef.current !== null) return;
      rtScheduledRef.current = window.setTimeout(() => {
        rtScheduledRef.current = null;
        pp.refetch();
      }, 700);
    };

    const refreshMatched = () => {
      scheduleRefetch(false);
      const pid = (profile as any)?.id;
      if (!pid) return;
      void getMatchedProfileIds(pid).then((ids) => {
        setMatchedIds(new Set(ids));
      });
    };
    const unsubProfilesIns = subscribeTable('profiles', () => scheduleRefetch(true), { events: ['INSERT'] });
    const unsubProfilesUpd = subscribeTable('profiles', () => scheduleRefetch(false), { events: ['UPDATE'] });
    const unsubFollowers = subscribeTable('followers', () => scheduleRefetch(false));
    const unsubLikes = subscribeTable('profile_likes', () => scheduleRefetch(false));
    const unsubDiscovery = subscribeTable('oculto_discovery_likes', refreshMatched);
    const unsubLooking = subscribeTable('looking_now_matches', refreshMatched);

    // Eventos locais (entrar/sair de sala, enviar convite) → recalcular bolhas/níveis
    const onLocalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      // Otimista (pending OU sent): oculta a bolha imediatamente
      if ((detail?.source === 'invite-sent' || detail?.source === 'invite-pending') && detail?.to) {
        setMatchedIds((prev) => prev.has(detail.to) ? prev : new Set([...prev, detail.to]));
      }
      // Reconciliação: convite falhou → restaura bolha
      if (detail?.source === 'invite-failed' && detail?.to) {
        setMatchedIds((prev) => {
          if (!prev.has(detail.to)) return prev;
          const next = new Set(prev);
          next.delete(detail.to);
          return next;
        });
      }
      scheduleRefetch(true);
    };
    window.addEventListener('aura-match:refresh', onLocalRefresh);

    return () => {
      if (rtScheduledRef.current !== null) window.clearTimeout(rtScheduledRef.current);
      unsubProfilesIns(); unsubProfilesUpd(); unsubFollowers(); unsubLikes(); unsubDiscovery(); unsubLooking();
      window.removeEventListener('aura-match:refresh', onLocalRefresh);
    };
  }, [pp, profile]);

  const auraBoosts = useSocialBoosts(merged.map((c) => c.id), 'boost_aura');

  const scores = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of merged) {
      const boost = auraBoosts.get(c.id) ?? 1;
      const base = computeScore(c) + getAuraBoost(c.id);
      m[c.id] = Math.max(5, Math.min(100, Math.round(base * boost)));
    }
    return m;
  }, [merged, auraBoosts]);

  // V3-H — descoberta limitada: 1 aura "rara" do dia (índice estável por dia)
  const rareCardId = useMemo(() => {
    if (merged.length === 0) return null;
    const day = Math.floor(Date.now() / 86_400_000);
    const idx = day % merged.length;
    return merged[idx]?.id ?? null;
  }, [merged]);

  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const handleTap = (card: PairCard, info?: { resonant?: boolean; rare?: boolean }) => {
    // Evita re-disparos duplicados (handlePress + onDoubleClick podem chamar 2x em ~10ms)
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === card.id && now - last.at < 350) return;
    lastTapRef.current = { id: card.id, at: now };

    bumpAuraInteraction(card.id, 6); // sinal de curiosidade
    // Garante remount limpo do painel mesmo se for o mesmo card
    setPanelOpen(false);
    setSelected(null);
    requestAnimationFrame(() => {
      setSelected(card);
      setPanelOpen(true);
    });
    auraAwardXp(2, 'aura_tap');
    questProgress('tap_3_auras', 1);
    // "Veja N perfis" — conta apenas perfis distintos abertos nesta sessão.
    if (!viewedProfilesRef.current.has(card.id)) {
      viewedProfilesRef.current.add(card.id);
      questProgress('view_5_profiles', 1);
    }
    // "Toque em uma Aura Rara" — dispara quando a bolha tocada é a rara do dia.
    // Detecta tanto pelo flag vindo do AuraField quanto pelo rareCardId calculado aqui.
    if (info?.rare || (rareCardId && rareCardId === card.id)) {
      questProgress('tap_rare_aura', 1);
    }
    // Eco: tocar em uma aura em ressonância equivale a "enviar um eco".
    if (info?.resonant) {
      questProgress('send_echo', 1);
    }
    // V3-I — efeito visual leve em outras bolhas próximas (eco social)
    fireAuraMicroReward(card.id, 'view');
  };

  const handleSwipeWithXp = useCallback(
    (cardId: string, action: 'dislike' | 'like' | 'superlike') => {
      const xp = action === 'superlike' ? 15 : action === 'like' ? 5 : 1;
      auraAwardXp(xp, `aura_${action}`);
      if (action === 'superlike') questProgress('send_super_dm', 1);
      if (action !== 'dislike') fireAuraMicroReward(cardId, action === 'superlike' ? 'energy' : 'approach');
      return pp.swipe(cardId, action);
    },
    [auraAwardXp, pp, questProgress]
  );

  return (
    <div data-aura-page className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 pb-24 sm:pb-6 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sparkles className="h-5 w-5 text-fuchsia-500 dark:text-fuchsia-400" />
            Aura Match
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Sinta quem está vibrando agora. Toque em uma aura para se aproximar no escuro.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <AuraProgressBadge
            progress={auraProgress}
            plan={(profile as any)?.plan_type || (profile as any)?.plan || null}
          />
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setHighlightRandomize(false); handleRandomize(); }}
                  disabled={randomRemaining <= 0}
                  aria-label={`Randomizar Aura (${randomRemaining} restantes hoje)`}
                  data-aura-action="randomize"
                  className={highlightRandomize ? 'relative ring-2 ring-amber-400 ring-offset-2 ring-offset-background animate-pulse rounded-full shadow-[0_0_20px_hsl(45_95%_55%/0.6)]' : ''}
                >
                  <Shuffle className="h-4 w-4" />
                  {highlightRandomize && (
                    <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black shadow-lg">
                      Toque aqui ↓
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {randomRemaining > 0
                  ? `Trocar de presenças · ${randomRemaining} restantes hoje`
                  : 'Limite de presenças atingido — volte amanhã'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const nextSeed = randomSeed + 1;
                    setRandomSeed(nextSeed);
                    Promise.resolve(pp.refetch?.()).catch(() => {});
                    if (isMasterAdmin) {
                      // eslint-disable-next-line no-console
                      logger.info('[AuraMatch] reload → seed', nextSeed, '· refetch disparado');
                    }
                    toast.success(
                      isMasterAdmin ? `Bolhas atualizadas · seed ${nextSeed}` : 'Bolhas atualizadas',
                      { duration: 1200 }
                    );
                  }}
                  aria-label="Recarregar bolhas"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Recarregar bolhas em tempo real
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={followFilter === 'following' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => {
                    setFollowFilter((f) => (f === 'following' ? 'new' : 'following'));
                    toast.success(
                      followFilter === 'following'
                        ? 'Mostrando novos perfis'
                        : 'Mostrando apenas quem você segue',
                      { duration: 1400 }
                    );
                  }}
                  aria-label={followFilter === 'following' ? 'Voltar para novos perfis' : 'Ver quem eu sigo'}
                  data-aura-no-pan="true"
                  className={followFilter === 'following' ? 'bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30' : ''}
                >
                  {followFilter === 'following' ? <UserCheck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {followFilter === 'following'
                  ? `Mostrando quem você segue (${followingSet.size}) — toque para voltar`
                  : 'Ver apenas quem você segue'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isMasterAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDebugOpen((v) => !v)}
              aria-label="Debug Aura"
              className="h-8 px-2 text-[10px] font-mono uppercase tracking-wider border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10"
            >
              {debugOpen ? 'Debug ON' : 'Debug'}
            </Button>
          )}
        </div>
      </header>


      {/* Top bar oficial — Aura, Score Social e XP (fonte da verdade) */}
      <AuraStatsTopBar />

      {isMasterAdmin && debugOpen && (
        <div className="rounded-xl border border-fuchsia-500/30 bg-black/60 p-3 text-[11px] font-mono text-fuchsia-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-fuchsia-300 uppercase tracking-wider">Aura Match · Debug Master</span>
            <span className="text-fuchsia-400/70">seed: {randomSeed}</span>
          </div>
          {/* Auditoria de sala ativa (single-room enforcement) */}
          <div className="rounded-md border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-fuchsia-300/80">sala atual (local):</span>
              <b className="text-fuchsia-100">{activeRoomSlug || '—'}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fuchsia-300/80">último exit:</span>
              <b className={
                lastExitStatus === 'ok' ? 'text-emerald-300' :
                lastExitStatus === 'fallback' ? 'text-amber-300' :
                lastExitStatus === 'error' ? 'text-red-300' :
                lastExitStatus === 'pending' ? 'text-cyan-300' : 'text-muted-foreground'
              }>{lastExitStatus}{lastExitAt ? ` · ${new Date(lastExitAt).toLocaleTimeString()}` : ''}</b>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-fuchsia-300/80">presença DB:</span>
              <span className="flex-1 truncate text-right">
                {auditPresence ? (auditPresence.slugs.length ? auditPresence.slugs.join(', ') : 'nenhuma') : '—'}
              </span>
              <button
                type="button"
                className="rounded border border-fuchsia-400/30 px-1.5 py-0.5 text-[9px] hover:bg-fuchsia-500/10"
                onClick={async () => {
                  const { data: auth } = await supabase.auth.getUser();
                  const uid = auth.user?.id;
                  if (!uid) return;
                  const { data } = await (supabase as any)
                    .from('oculto_aura_room_presence')
                    .select('room_slug')
                    .eq('user_id', uid);
                  setAuditPresence({ slugs: (data || []).map((r: any) => r.room_slug), checkedAt: Date.now() });
                }}
              >verificar</button>
            </div>
            {auditPresence && auditPresence.slugs.length > 1 && (
              <p className="text-[9px] text-red-300">⚠ múltiplas salas detectadas — single-room violado</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>tier: <b>{tier}</b></div>
            <div>cap: <b>{cap}</b></div>
            <div>pp.cards: <b>{pp.cards.length}</b></div>
            <div>extra: <b>{extra.length}</b></div>
            <div>priority: <b>{priorityCards.length}</b></div>
            <div>render: <b>{merged.length}</b></div>
          </div>
          {priorityCards.length > 0 && (
            <div>
              <div className="text-fuchsia-300/80 mb-1">priorityCards:</div>
              <ul className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                {priorityCards.map((c) => (
                  <li key={c.id} className="truncate">
                    · @{c.username || '—'} <span className="text-fuchsia-400/60">({c.id.slice(0, 8)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="text-fuchsia-300/80 mb-1">renderizadas (até {cap}):</div>
            <ul className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
              {merged.map((c, i) => (
                <li key={c.id} className="truncate">
                  {String(i + 1).padStart(2, '0')}. @{c.username || c.name || '—'}
                  {MASTER_PRIORITY_USERNAMES.has(normalizePriorityName(c.username || c.name)) && (
                    <span className="ml-1 text-amber-400">★</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Onda C — Noite Oculta ativa (cinematográfico, flat) */}
      <LazyMount minHeight={56}><NoiteOcultaBanner /></LazyMount>

      {/* Prioridade 2 — Pulse de presença invisível */}
      <LazyMount minHeight={48}><PresencePulseStrip /></LazyMount>

      {/* Onda C — Temporada social ativa + posição do usuário */}
      <LazyMount minHeight={120}><SeasonProgressCard /></LazyMount>

      {/* Onda C — Energia Magnética (boost 30–120 min) + Pass VIP */}
      <LazyMount minHeight={44}>
        <div className="flex items-center justify-between gap-2">
          <MagneticEnergyToggle />
          <VipPassBadge />
        </div>
      </LazyMount>

      {/* V3-G — Banner de ciclo diário (paleta/vibe do momento) */}
      <LazyMount minHeight={56}><AuraDailyCycleBanner /></LazyMount>

      {/* Bloco A — Banner social dinâmico (eventos de energia ao vivo) */}
      <LazyMount minHeight={72}><AuraSocialBanner event={event} /></LazyMount>

      {/* V3-B — Tempestade Social (banner ativo somente quando há tempestade) */}
      <div id="aura-anchor-storm" data-aura-storm>
        <LazyMount minHeight={0}><AuraStormBanner /></LazyMount>
      </div>

      {/* V3-D — Salas de Energia (presença) */}
      <div id="aura-anchor-rooms" data-aura-rooms>
        <LazyMount minHeight={200}><AuraRoomsStrip forcedRoomSlug={forcedRoomSlug} /></LazyMount>
      </div>

      {/* V3-E — Presença Digital (passersby anônimo) */}
      <LazyMount minHeight={120}><AuraPassersbyCard /></LazyMount>

      {/* Bloco C — Missões diárias (resumo + lista + histórico) + Conexões raras */}
      <LazyMount minHeight={88}><AuraQuestsSummary /></LazyMount>
      <div id="aura-anchor-quests"><LazyMount minHeight={180}><AuraDailyQuests /></LazyMount></div>
      <div id="aura-anchor-rare"><LazyMount minHeight={140}><RareConnectionsRow /></LazyMount></div>
      <LazyMount minHeight={120}><AuraQuestsHistory /></LazyMount>

      {/* Bloco D — Conquistas permanentes (lazy abaixo da dobra) */}
      <div id="aura-anchor-achievements"><LazyMount minHeight={140}><AuraAchievements /></LazyMount></div>

      {/* Bloco E — Top Auras */}
      <LazyMount minHeight={220}><AuraTopRanking /></LazyMount>

      {/* Bloco F — Cofre semanal */}
      <LazyMount minHeight={120}><AuraWeeklyChest /></LazyMount>

      {/* Bloco G — Aura Boost */}
      <LazyMount minHeight={120}><AuraBoostCard /></LazyMount>
      <BoostLiveRegion />

      {/* Identidade Social consolidada (Aura + Prestígio + Trust) */}
      <LazyMount minHeight={140}><SocialIdentityCard /></LazyMount>

      {/* Onda C — Destino Social (top conexões raras) */}
      <LazyMount minHeight={120}><DestinoSocialCard /></LazyMount>

      {/* Onda F — Conexões Ocultas (descobertas raras revelar/ver) */}
      <LazyMount minHeight={140}><ConexoesOcultasCard /></LazyMount>

      {/* Onda F — Experiências Reais (eventos locais) */}
      <LazyMount minHeight={160}><ExperienciasReaisStrip /></LazyMount>

      {/* Bloco H — Streak diário */}
      <LazyMount minHeight={120}><AuraStreakCard /></LazyMount>

      {/* Bloco I — Duelos de Aura */}
      <LazyMount minHeight={140}><AuraDuelsCard /></LazyMount>

      {/* Bloco J — Aura Compartilhada */}
      <LazyMount minHeight={100}><AuraSharedBondCard /></LazyMount>

      {/* Bloco K — Histórico de Atenções (enviadas e recebidas) */}
      <LazyMount minHeight={140}><AuraAttentionsHistory /></LazyMount>

      {/* Bloco L — Histórico bloqueável: pague XP para revelar */}
      <div className="grid gap-3 sm:grid-cols-2">
        <LazyMount minHeight={160}>
          <AuraSignalHistory kind="attention" title="Quem chamou sua atenção" emptyHint="Ninguém te chamou nas últimas 72h." />
        </LazyMount>
        <LazyMount minHeight={160}>
          <AuraSignalHistory kind="profile_view" title="Quem visitou seu perfil" emptyHint="Sem visitas recentes — apareça mais!" />
        </LazyMount>
      </div>


      {pp.loading && merged.length === 0 && !loadingGateExpired ? (
        <div className="flex h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Captando sussurros no escuro…
        </div>
      ) : merged.length === 0 ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-white/5 bg-[#0b0420] text-center text-sm text-muted-foreground">
          <Sparkles className="h-8 w-8 text-fuchsia-400/60" />
          O escuro está em silêncio agora. Volte em instantes — alguém sempre acende.
          <Button variant="outline" size="sm" onClick={() => pp.refetch()}>
            Recarregar
          </Button>
        </div>
      ) : (
        <div id="aura-anchor-bubbles" data-aura-bubbles>
          <AuraField
            cards={merged}
            scores={scores}
            tier={tier}
            onTap={handleTap}
            onResonanceDetected={(n) => { try { questProgress('resonance_3', n); } catch {} }}
            onRefresh={() => pp.refetch()}
            onRandomize={handleRandomize}
            randomizeRemaining={randomRemaining}
            priorityCardIds={priorityCards.map((card) => card.id)}
            selfAvatarUrl={profile?.avatar_url}
            selfName={profile?.name}
            selfPlan={(profile as any)?.plan_type || (profile as any)?.plan || null}
            selfLevel={auraProgress.level}
            event={event}
            rareCardId={rareCardId}
          />
        </div>
      )}

      {merged.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <AuraLegend />
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Avatar className="h-5 w-5">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback>{profile?.name?.slice(0, 1) || '?'}</AvatarFallback>
            </Avatar>
            <span>
              {merged.length} aura{merged.length > 1 ? 's' : ''} sintonizada
              {merged.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      <AuraQuickPanel
        key={selected?.id || 'aura-quick-panel'}
        card={selected}
        score={selected ? scores[selected.id] ?? 50 : 0}
        realScore={selected ? calculateCompatibility(
          (profile as any)?.tags_social || [],
          (profile as any)?.tags_adult || [],
          (selected as any)?.tags_social || [],
          (selected as any)?.tags_adult || [],
        ).totalPct : null}
        open={panelOpen}
        onOpenChange={(v) => {
          setPanelOpen(v);
          if (!v) {
            // Libera o "selected" após o close para garantir remount em reaberturas
            setTimeout(() => setSelected(null), 180);
          }
        }}
        onSwipe={handleSwipeWithXp}
        onSuperLikeRequest={(c) => { setSuperCard(c); setSuperOpen(true); }}
      />

      <SuperDmPaymentModal
        card={superCard}
        open={superOpen}
        onOpenChange={(v) => { setSuperOpen(v); if (!v) setSuperCard(null); }}
        onPaid={(c) => {
          // Após pagar, registra o superlike no fluxo do PerfectPair
          handleSwipeWithXp(c.id, 'superlike');
          setSuperOpen(false);
          setSuperCard(null);
          setPanelOpen(false);
        }}
      />

      <PerfectPairMatchModal
        match={pp.match}
        currentUserAvatar={profile?.avatar_url}
        currentUserName={profile?.name}
        onDismiss={pp.dismissMatch}
      />
    </div>
  );
}
