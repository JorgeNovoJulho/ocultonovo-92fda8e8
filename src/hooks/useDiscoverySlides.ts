import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import {
  STATIC_DISCOVERY_SLIDES,
  type DiscoverySlide,
  type DiscoveryPlan,
} from '@/data/discoveryUniverseSlides';

const SESSION_SEED_KEY = 'discovery_seed_v1';
const SEEN_CATEGORIES_KEY = 'discovery_seen_categories_v1';

function getSessionSeed(): number {
  try {
    const cached = sessionStorage.getItem(SESSION_SEED_KEY);
    if (cached) return Number(cached);
    const seed = Math.floor(Math.random() * 1_000_000);
    sessionStorage.setItem(SESSION_SEED_KEY, String(seed));
    return seed;
  } catch {
    return Math.floor(Math.random() * 1_000_000);
  }
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getSeenCategories(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_CATEGORIES_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

const CLICKS_KEY = 'discovery_clicks_v1';
function getClickMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CLICKS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/**
 * Heurística leve de contexto temporal.
 * Noite (20h–2h): prioriza social/discovery (clima de descoberta).
 * Dia útil: prioriza creator/plans/vip (clima de produtividade).
 */
function timeContextBoost(category: string | undefined): number {
  if (!category) return 0;
  const h = new Date().getHours();
  const isNight = h >= 20 || h < 2;
  if (isNight && (category === 'social' || category === 'discovery')) return 12;
  if (!isNight && (category === 'creator' || category === 'plans' || category === 'vip')) return 10;
  return 0;
}

/**
 * Boost por plano: free vê upgrade/monetização; vip vê ferramentas de creator.
 */
function planContextBoost(category: string | undefined, plan: DiscoveryPlan): number {
  if (!category) return 0;
  if (plan === 'free' && (category === 'plans' || category === 'vip')) return 18;
  if (plan === 'vip' && category === 'creator') return 15;
  if (plan === 'premium' && category === 'vip') return 12;
  return 0;
}

export function markCategorySeen(category?: string | null) {
  if (!category) return;
  try {
    const set = getSeenCategories();
    set.add(category);
    localStorage.setItem(SEEN_CATEGORIES_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function normalizePlan(plan: string | null | undefined): DiscoveryPlan {
  const p = (plan || 'free').toLowerCase();
  if (p === 'vip') return 'vip';
  if (p === 'premium' || p === 'standard') return 'premium';
  return 'free';
}

interface RawSlideRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  cta_label: string;
  cta_route: string;
  icon: string | null;
  category: string | null;
  target_plans: string[] | null;
  priority: number | null;
  is_new: boolean | null;
  is_active: boolean | null;
  requires_kyc: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  mission_label?: string | null;
  mission_goal?: string | null;
  mission_target?: number | null;
  campaign_tag?: string | null;
  campaign_color?: string | null;
}

function rowToSlide(r: RawSlideRow): DiscoverySlide {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    ctaLabel: r.cta_label,
    ctaRoute: r.cta_route,
    icon: r.icon || 'sparkles',
    category: r.category || 'general',
    targetPlans: ((r.target_plans || ['free', 'premium', 'vip']) as DiscoveryPlan[]),
    priority: r.priority ?? 0,
    isNew: !!r.is_new,
    requiresKyc: !!r.requires_kyc,
    missionLabel: r.mission_label || undefined,
    missionGoal: r.mission_goal || undefined,
    missionTarget: r.mission_target ?? undefined,
    campaignTag: r.campaign_tag || undefined,
    campaignColor: r.campaign_color || undefined,
  };
}

export interface UseDiscoverySlidesOptions {
  userPlan?: string | null;
}

export function useDiscoverySlides({ userPlan }: UseDiscoverySlidesOptions = {}) {
  const plan = normalizePlan(userPlan);

  const query = useQuery({
    queryKey: ['discovery-slides'],
    queryFn: async (): Promise<DiscoverySlide[]> => {
      try {
        const { data, error } = await (supabase as any)
          .from('feed_discovery_slides')
          .select('*')
          .eq('is_active', true)
          .order('priority', { ascending: false })
          .limit(50);
        if (error || !data || data.length === 0) return STATIC_DISCOVERY_SLIDES;
        const now = Date.now();
        const filtered = (data as RawSlideRow[]).filter((r) => {
          const s = r.starts_at ? new Date(r.starts_at).getTime() : null;
          const e = r.ends_at ? new Date(r.ends_at).getTime() : null;
          if (s && now < s) return false;
          if (e && now > e) return false;
          return true;
        });
        if (filtered.length === 0) return STATIC_DISCOVERY_SLIDES;
        return filtered.map(rowToSlide);
      } catch {
        return STATIC_DISCOVERY_SLIDES;
      }
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const ordered = useMemo<DiscoverySlide[]>(() => {
    const list = (query.data && query.data.length > 0 ? query.data : STATIC_DISCOVERY_SLIDES)
      .filter((s) => s.targetPlans.includes(plan));

    if (list.length === 0) return [];

    const seed = getSessionSeed();
    const shuffled = shuffleSeeded(list, seed);
    const seen = getSeenCategories();

    const clicks = getClickMap();

    // IA leve: prioridade base + isNew + categoria não vista + nunca clicado
    // + contexto temporal + contexto de plano. Tudo em memória, sem queries.
    return shuffled
      .map((s) => {
        let score = s.priority;
        if (s.isNew) score += 30;
        if (s.category && !seen.has(s.category)) score += 20;
        const clickCount = clicks[s.slug] || 0;
        if (clickCount === 0) score += 40; // nunca usou — prioridade máxima de descoberta
        else if (clickCount >= 3) score -= 25; // saturado — desce
        score += timeContextBoost(s.category);
        score += planContextBoost(s.category, plan);
        if (s.campaignTag) score += 35; // Campanha ativa — destaque
        if (s.missionLabel && clickCount > 0 && clickCount < (s.missionTarget || 3)) score += 22; // missão em andamento
        return { s, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.s);
  }, [query.data, plan]);

  // Telemetria leve: marca primeira categoria vista após exibir
  useEffect(() => {
    if (ordered.length > 0 && ordered[0].category) {
      markCategorySeen(ordered[0].category);
    }
  }, [ordered]);

  return {
    slides: ordered,
    isLoading: query.isLoading,
    isFallback: !query.data || query.data === STATIC_DISCOVERY_SLIDES,
  };
}
