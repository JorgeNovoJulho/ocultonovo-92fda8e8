/**
 * useFeatureUsageMap — Mapa do Oculto (Prompt 5)
 *
 * Detecta quais recursos do Oculto o usuário JÁ UTILIZA e quais ainda
 * não explorou. Usa exclusivamente tabelas já existentes no Supabase
 * externo — nenhum schema novo.
 *
 * Regras:
 *   - Se uma query falhar (tabela ausente / RLS) → conta como "não usado".
 *   - Threshold mínimo configurável por feature evita falso-positivo
 *     (ex.: 1 mensagem isolada não conta como "usa chat").
 *   - Cache 5min para não martelar o banco em re-renders.
 *
 * Output:
 *   { used: FeatureNode[], unused: FeatureNode[], loading }
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

export type FeatureKey =
  | 'feed'
  | 'communities'
  | 'chat'
  | 'aura-match'
  | 'oculto-play'
  | 'vip-channel'
  | 'radar'
  | 'events';

export interface FeatureNode {
  key: FeatureKey;
  title: string;
  pitch: string;
  icon: string;
  href: string;
  tone: string;
  /** quantidade detectada (para badge "X usos"). */
  count: number;
}

const NODES: Record<FeatureKey, Omit<FeatureNode, 'count'>> = {
  feed: {
    key: 'feed',
    title: 'Feed',
    pitch: 'Sua linha do tempo social',
    icon: '📰',
    href: '/feed',
    tone: 'from-sky-500/20 to-cyan-500/5',
  },
  communities: {
    key: 'communities',
    title: 'Comunidades',
    pitch: 'Tribos e tópicos do Oculto',
    icon: '🏘️',
    href: '/comunidades',
    tone: 'from-emerald-500/20 to-teal-500/5',
  },
  chat: {
    key: 'chat',
    title: 'Chat',
    pitch: 'Conversas privadas e seguras',
    icon: '💬',
    href: '/messages',
    tone: 'from-indigo-500/20 to-violet-500/5',
  },
  'aura-match': {
    key: 'aura-match',
    title: 'Aura Match',
    pitch: 'Conexões por afinidade real',
    icon: '💫',
    href: '/aura-match',
    tone: 'from-fuchsia-500/20 to-pink-500/5',
  },
  'oculto-play': {
    key: 'oculto-play',
    title: 'Oculto Play',
    pitch: 'Mídia exclusiva dos criadores',
    icon: '🎬',
    href: '/oculto-play',
    tone: 'from-amber-500/20 to-orange-500/5',
  },
  'vip-channel': {
    key: 'vip-channel',
    title: 'Canal VIP',
    pitch: 'Conteúdo premium por assinatura',
    icon: '👑',
    href: '/subscriptions',
    tone: 'from-yellow-500/20 to-amber-500/5',
  },
  radar: {
    key: 'radar',
    title: 'Radar',
    pitch: 'Quem está próximo agora',
    icon: '📡',
    href: '/radar',
    tone: 'from-cyan-500/20 to-sky-500/5',
  },
  events: {
    key: 'events',
    title: 'Eventos',
    pitch: 'Encontros e festas reais',
    icon: '🎉',
    href: '/events',
    tone: 'from-rose-500/20 to-red-500/5',
  },
};

/** Threshold de uso "real" por feature. */
const THRESHOLD: Record<FeatureKey, number> = {
  feed: 1,
  communities: 1,
  chat: 3,
  'aura-match': 1,
  'oculto-play': 1,
  'vip-channel': 1,
  radar: 1,
  events: 1,
};

async function countHead(table: string, build: (q: any) => any): Promise<number> {
  try {
    const q = build((supabase as any).from(table).select('id', { count: 'exact', head: true }));
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export function useFeatureUsageMap() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const uid = user?.id;
  const pid = profile?.id;

  const query = useQuery({
    queryKey: ['retention', 'feature-usage-map', uid, pid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<FeatureKey, number>> => {
      const [
        feedPosts, feedLikes,
        communities,
        chatMsgs,
        auraMatches,
        playPosts,
        vipChannel, vipSubs,
        radarPings,
        eventRsvps,
      ] = await Promise.all([
        pid ? countHead('posts',         (q) => q.eq('author_id', pid)) : Promise.resolve(0),
        countHead('post_likes',          (q) => q.eq('user_id', uid)),
        countHead('oculto_community_members', (q) => q.eq('user_id', uid)),
        countHead('messages',            (q) => q.eq('sender_id', uid)),
        countHead('lucky_matches',       (q) => q.or(`user_id.eq.${uid},matched_user_id.eq.${uid}`)),
        pid ? countHead('posts',         (q) => q.eq('author_id', pid).eq('is_play', true)) : Promise.resolve(0),
        pid ? countHead('subscription_plans', (q) => q.eq('profile_id', pid).eq('is_enabled', true)) : Promise.resolve(0),
        countHead('subscriptions',       (q) => q.eq('user_id', uid).eq('status', 'active')),
        countHead('pings',               (q) => q.eq('sender_id', uid)),
        countHead('event_rsvps',         (q) => q.eq('user_id', uid)),
      ]);

      return {
        feed: feedPosts + feedLikes,
        communities,
        chat: chatMsgs,
        'aura-match': auraMatches,
        'oculto-play': playPosts,
        'vip-channel': vipChannel + vipSubs,
        radar: radarPings,
        events: eventRsvps,
      };
    },
  });

  const counts = query.data ?? {
    feed: 0, communities: 0, chat: 0, 'aura-match': 0,
    'oculto-play': 0, 'vip-channel': 0, radar: 0, events: 0,
  };

  // Marcação local de "explorado" (clique no card) — UI hint only.
  // Persistido em localStorage por usuário; não afeta dados de negócio.
  // Usa Set em módulo + tick para re-renderizar de forma síncrona e confiável.
  const [exploredTick, setExploredTick] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setExploredTick((t) => t + 1);
    window.addEventListener('oculto:explored-features-changed', handler);
    return () => window.removeEventListener('oculto:explored-features-changed', handler);
  }, []);

  // Hidrata o cache em módulo a partir do localStorage (uma vez por uid)
  hydrateExploredFromStorage(uid);
  void exploredTick; // força re-leitura quando o tick muda
  const locallyExplored = getExploredSet(uid);

  const used: FeatureNode[] = [];
  const unused: FeatureNode[] = [];

  (Object.keys(NODES) as FeatureKey[]).forEach((k) => {
    const node: FeatureNode = { ...NODES[k], count: counts[k] };
    if (counts[k] >= THRESHOLD[k] || locallyExplored.has(k)) used.push(node);
    else unused.push(node);
  });

  // Ordena: mais usados primeiro; não usados em ordem fixa (mais "premium" primeiro).
  used.sort((a, b) => b.count - a.count);

  return { used, unused, loading: query.isLoading };
}

// ───────────────────────────────────────────────────────────────────────────
// Cache em módulo para garantir update síncrono entre markFeatureExplored
// e o re-render do hook (evita problemas de ordem entre evento/localStorage).
// ───────────────────────────────────────────────────────────────────────────
const exploredCache = new Map<string, Set<FeatureKey>>();
const hydratedKeys = new Set<string>();

function storageKeyFor(uid: string | undefined): string {
  return `oculto:explored-features:${uid || 'anon'}`;
}

function hydrateExploredFromStorage(uid: string | undefined): void {
  const k = uid || 'anon';
  if (hydratedKeys.has(k)) return;
  hydratedKeys.add(k);
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(uid));
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      exploredCache.set(k, new Set(arr as FeatureKey[]));
    }
  } catch { /* noop */ }
}

function getExploredSet(uid: string | undefined): Set<FeatureKey> {
  const k = uid || 'anon';
  let s = exploredCache.get(k);
  if (!s) { s = new Set<FeatureKey>(); exploredCache.set(k, s); }
  return s;
}

/** Marca uma feature como "explorada" localmente (clique no card). */
export function markFeatureExplored(uid: string | undefined, key: FeatureKey) {
  if (typeof window === 'undefined') return;
  try {
    hydrateExploredFromStorage(uid);
    const set = getExploredSet(uid);
    if (set.has(key)) return;
    set.add(key);
    try {
      window.localStorage.setItem(storageKeyFor(uid), JSON.stringify(Array.from(set)));
    } catch { /* noop */ }
    // Também marca com 'anon' como fallback (caso o uid mude após login)
    if (uid) {
      const anon = getExploredSet(undefined);
      anon.add(key);
      try {
        window.localStorage.setItem(storageKeyFor(undefined), JSON.stringify(Array.from(anon)));
      } catch { /* noop */ }
    }
    window.dispatchEvent(new Event('oculto:explored-features-changed'));
  } catch { /* noop */ }
}
