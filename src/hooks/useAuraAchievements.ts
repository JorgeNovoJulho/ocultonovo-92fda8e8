import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { AURA_QUEST_EVENT } from '@/lib/auraQuests';
import { subscribeTable } from '@/lib/realtimeBus';


export interface AuraMetrics {
  total_xp: number;
  current_level: number;
  account_age_days: number;
  current_streak: number;
  visit_days: number;
  quests_claimed: number;
  super_dm_quests: number;
  likes_quests: number;
  follows_quests: number;
  saves_quests: number;
  comments_quests: number;
  polls_quests: number;
  gifts_quests: number;
  communities_joined: number;
  community_topics: number;
  play_publishes: number;
  play_views_total: number;
  play_movies_completed: number;
  chat_messages: number;
  rooms_joined: number;
  rooms_messages: number;
  matches_total: number;
  engagement_rank: number; // 0 = sem ranking; menor = melhor
  rank_top100_flag: number; // 0/1 — derivado
  rank_top10_flag: number;  // 0/1 — derivado
  play_listen_streak: number;        // máximo de músicas/itens completos em sequência sem pausa longa
  play_visit_streak_consec: number;  // dias consecutivos visitando o Oculto Play
  play_visit_days: number;           // total de dias distintos visitando o Oculto Play
}

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: 'flame' | 'star' | 'crown' | 'sparkles' | 'heart' | 'trophy' | 'users' | 'music' | 'chat' | 'mic' | 'magnet' | 'rank';
  metric: keyof AuraMetrics;
  threshold: number;
  tier: 'bronze' | 'prata' | 'ouro' | 'platina';
  category?: 'aura' | 'social' | 'community' | 'play' | 'chat' | 'rooms' | 'matches' | 'ranking';
}

export interface Achievement extends AchievementDef {
  current: number;
  unlocked: boolean;
  progressPct: number;
  xpReward: number;
  claimed: boolean; // true se já foi creditado ao saldo do usuário
  isRare: boolean;  // recompensa >= 10000 XP
  isPlatinum?: boolean; // meta-conquistas PLATINA (resgate de todas/raras)
}

// Ids das conquistas RARAS (10.000 XP) — usado pela meta "Coroa Rara".
export const RARE_ACHIEVEMENT_IDS: readonly string[] = [
  'play_views_1k',
  'match_50',
  'play_listen_streak_10',
  'play_movie_15',
  'xp_10000',
];

// Ids de meta-conquistas (PLATINA). Não entram no cálculo de "todas".
export const META_ACHIEVEMENT_IDS: readonly string[] = [
  'meta_all_rares',
  'meta_all',
];

// Overrides explícitos. Apenas conquistas RARAS pagam 10.000 XP.
// Todas as demais respeitam o teto de 2.000 XP definido em TIER_XP_RANGE.
export const XP_REWARD_OVERRIDES: Record<string, number> = {
  // ── RARAS (10.000 XP) ────────────────────────────────────────────────
  play_views_1k: 10000,
  match_50: 10000,
  play_listen_streak_10: 10000, // RARA: ouvir 10 itens em sequência sem parar
  play_movie_15: 10000,          // RARA: assistir 15 filmes completos no Oculto Play
  xp_10000: 10000,              // RARA: Sol Interior (150.000 XP acumulado)
  // ── META PLATINA ─────────────────────────────────────────────────────
  meta_all_rares: 20000,        // PLATINA: resgatar todas as conquistas RARAS
  meta_all: 50000,              // PLATINA: resgatar todas as conquistas
  // ── Não-raras (teto 2.000 XP) ────────────────────────────────────────
  xp_1000: 1500,                // Mil de XP — recompensa fixa de 1.500 XP
  play_visit_streak_10: 1500,   // 10 dias consecutivos no Oculto Play
  play_visit_30: 2000,          // 30 dias aleatórios no Oculto Play
  play_movie_1: 1500,            // Assistir 1 filme completo no Oculto Play
  play_movie_5: 5000,            // Assistir 5 filmes completos no Oculto Play
};

// Faixas de premiação em XP por tier.
// Não-raras: teto global de 2.000 XP.
// Raras (≥ 10.000) são definidas exclusivamente em XP_REWARD_OVERRIDES.
export const TIER_XP_RANGE: Record<AchievementDef['tier'], [number, number]> = {
  bronze:  [500, 900],
  prata:   [1000, 1500],
  ouro:    [1500, 1800],
  platina: [1800, 2000],
};

export function computeAchievementXp(def: AchievementDef, indexInTier: number, totalInTier: number): number {
  const [min, max] = TIER_XP_RANGE[def.tier];
  if (totalInTier <= 1) return min;
  const ratio = indexInTier / (totalInTier - 1);
  return Math.round(min + (max - min) * ratio);
}

import {
  NEW_ACCOUNT_RARE_LOCK_DAYS,
  ENTRY_DAY_XP_CAP,
  ENTRY_DAY_LEVEL_CAP,
  accountAgeDaysFromCreatedAt,
  sanitizeEntryDayMetrics as sanitizeEntryDayMetricsPure,
  isRareLockedForNewAccount as isRareLockedForNewAccountPure,
} from './auraEntryDayGuard';

export { ENTRY_DAY_XP_CAP, ENTRY_DAY_LEVEL_CAP };

const isRareLockedForNewAccount = (achievementId: string, xpReward: number, metrics: AuraMetrics) =>
  isRareLockedForNewAccountPure(achievementId, xpReward, metrics);

export const sanitizeEntryDayMetrics = (m: AuraMetrics): AuraMetrics =>
  sanitizeEntryDayMetricsPure(m);

const FALLBACK: AuraMetrics = {
  total_xp: 0, current_level: 1, account_age_days: 0, current_streak: 0,
  visit_days: 0, quests_claimed: 0, super_dm_quests: 0,
  likes_quests: 0, follows_quests: 0, saves_quests: 0,
  comments_quests: 0, polls_quests: 0, gifts_quests: 0,
  communities_joined: 0, community_topics: 0,
    play_publishes: 0, play_views_total: 0, play_movies_completed: 0,
  chat_messages: 0, rooms_joined: 0, rooms_messages: 0,
  matches_total: 0, engagement_rank: 0,
  rank_top100_flag: 0, rank_top10_flag: 0,
  play_listen_streak: 0, play_visit_streak_consec: 0, play_visit_days: 0,
};

const levelFromXp = (xp: number) => Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1);
const mergeMetrics = (a: AuraMetrics, b: AuraMetrics): AuraMetrics => ({
  total_xp: Math.max(a.total_xp || 0, b.total_xp || 0),
  current_level: Math.max(a.current_level || 1, b.current_level || 1),
  account_age_days: Math.max(a.account_age_days || 0, b.account_age_days || 0),
  current_streak: Math.max(a.current_streak || 0, b.current_streak || 0),
  visit_days: Math.max(a.visit_days || 0, b.visit_days || 0),
  quests_claimed: Math.max(a.quests_claimed || 0, b.quests_claimed || 0),
  super_dm_quests: Math.max(a.super_dm_quests || 0, b.super_dm_quests || 0),
  likes_quests: Math.max(a.likes_quests || 0, b.likes_quests || 0),
  follows_quests: Math.max(a.follows_quests || 0, b.follows_quests || 0),
  saves_quests: Math.max(a.saves_quests || 0, b.saves_quests || 0),
  comments_quests: Math.max(a.comments_quests || 0, b.comments_quests || 0),
  polls_quests: Math.max(a.polls_quests || 0, b.polls_quests || 0),
  gifts_quests: Math.max(a.gifts_quests || 0, b.gifts_quests || 0),
  communities_joined: Math.max(a.communities_joined || 0, b.communities_joined || 0),
  community_topics: Math.max(a.community_topics || 0, b.community_topics || 0),
  play_publishes: Math.max(a.play_publishes || 0, b.play_publishes || 0),
  play_views_total: Math.max(a.play_views_total || 0, b.play_views_total || 0),
  play_movies_completed: Math.max(a.play_movies_completed || 0, b.play_movies_completed || 0),
  chat_messages: Math.max(a.chat_messages || 0, b.chat_messages || 0),
  rooms_joined: Math.max(a.rooms_joined || 0, b.rooms_joined || 0),
  rooms_messages: Math.max(a.rooms_messages || 0, b.rooms_messages || 0),
  matches_total: Math.max(a.matches_total || 0, b.matches_total || 0),
  engagement_rank: (() => {
    const av = a.engagement_rank || 0;
    const bv = b.engagement_rank || 0;
    if (av > 0 && bv > 0) return Math.min(av, bv);
    return av || bv;
  })(),
  rank_top100_flag: Math.max(a.rank_top100_flag || 0, b.rank_top100_flag || 0),
  rank_top10_flag: Math.max(a.rank_top10_flag || 0, b.rank_top10_flag || 0),
  play_listen_streak: Math.max(a.play_listen_streak || 0, b.play_listen_streak || 0),
  play_visit_streak_consec: Math.max(a.play_visit_streak_consec || 0, b.play_visit_streak_consec || 0),
  play_visit_days: Math.max(a.play_visit_days || 0, b.play_visit_days || 0),
});

const uniqueIds = (...ids: Array<string | null | undefined>) => [...new Set(ids.filter(Boolean) as string[])];

const countByIds = async (table: string, column: string, ids: string[], configure?: (query: any) => any) => {
  if (ids.length === 0) return 0;
  let query = (supabase as any).from(table).select('id', { count: 'exact', head: true }).in(column, ids);
  if (configure) query = configure(query);
  const { count, error } = await query;
  return error ? 0 : Number(count ?? 0);
};

// Conta follows somando registros das duas tabelas históricas ("followers" e "follows").
const countFollowsAny = async (ids: string[]): Promise<number> => {
  if (ids.length === 0) return 0;
  const [a, b] = await Promise.all([
    countByIds('followers', 'follower_id', ids),
    countByIds('follows', 'follower_id', ids),
  ]);
  return Math.max(a, b);
};

const fetchDirectMetrics = async (authUserId: string): Promise<AuraMetrics> => {
  const { data: profileRows } = await (supabase as any)
    .from('profiles')
    .select('id,user_id,created_at,aura_xp,aura_streak_days')
    .eq('user_id', authUserId)
    .order('created_at', { ascending: true })
    .limit(1);
  const profile = Array.isArray(profileRows) ? profileRows[0] : null;

  const ids = uniqueIds(authUserId, profile?.id, profile?.user_id);

  const levelsPromise = (supabase as any)
    .from('user_levels')
    .select('total_xp,current_level,streak_days')
    .in('user_id', ids);
  const streaksPromise = (supabase as any)
    .from('oculto_aura_streaks')
    .select('current_streak,longest_streak')
    .in('user_id', ids);
  const xpPromise = (supabase as any)
    .from('xp_transactions')
    .select('amount,created_at')
    .in('user_id', ids)
    .limit(1000);
  const engagementPromise = (supabase as any)
    .from('engagement_events')
    .select('created_at')
    .in('user_id', ids)
    .limit(365);

  const playItemsPromise = (supabase as any)
    .from('oculto_play_items')
    .select('view_count')
    .in('author_id', ids)
    .limit(2000);

  const [
    levelsResult,
    streaksResult,
    xpResult,
    engagementResult,
    postLikes,
    profileLikes,
    follows,
    saves,
    comments,
    polls,
    chatGifts,
    auraGifts,
    priorityTransactions,
    priorityMessages,
    commJoined,
    commTopics,
    playPublishes,
    playMoviesCompleted,
    chatMessages,
    roomsMessages,
    matchesA,
    matchesB,
    matchesC,
    playItemsResult,
  ] = await Promise.all([
    levelsPromise,
    streaksPromise,
    xpPromise,
    engagementPromise,
    countByIds('post_likes', 'user_id', ids),
    countByIds('profile_likes', 'liker_id', ids),
    countFollowsAny(ids),
    countByIds('saved_posts', 'user_id', ids),
    countByIds('post_comments', 'user_id', ids, (q) => q.eq('is_hidden', false)),
    countByIds('poll_votes', 'voter_id', ids),
    countByIds('gift_history', 'sender_id', ids),
    countByIds('oculto_aura_xp_gifts', 'sender_id', ids),
    countByIds('priority_message_transactions', 'sender_profile_id', ids),
    countByIds('messages', 'sender_id', ids, (q) => q.eq('is_priority', true)),
    countByIds('oculto_community_members', 'user_id', ids),
    countByIds('oculto_community_topics', 'author_id', ids),
    countByIds('oculto_play_items', 'author_id', ids, (q) => q.eq('is_published', true)),
    countByIds('oculto_play_movie_completions', 'user_id', ids),
    countByIds('messages', 'sender_id', ids),
    countByIds('oculto_aura_room_messages', 'user_id', ids),
    (async () => {
      try {
        const orExpr = ids.map((id) => `user1_id.eq.${id},user2_id.eq.${id}`).join(',');
        const { count, error } = await (supabase as any)
          .from('perfect_pairs').select('id', { count: 'exact', head: true }).or(orExpr);
        return error ? 0 : Number(count ?? 0);
      } catch { return 0; }
    })(),
    (async () => {
      try {
        const orExpr = ids.map((id) => `user1_id.eq.${id},user2_id.eq.${id}`).join(',');
        const { count, error } = await (supabase as any)
          .from('lucky_matches').select('id', { count: 'exact', head: true }).or(orExpr);
        return error ? 0 : Number(count ?? 0);
      } catch { return 0; }
    })(),
    (async () => {
      try {
        const orExpr = ids.map((id) => `user1_id.eq.${id},user2_id.eq.${id}`).join(',');
        const { count, error } = await (supabase as any)
          .from('looking_now_matches').select('id', { count: 'exact', head: true }).or(orExpr);
        return error ? 0 : Number(count ?? 0);
      } catch { return 0; }
    })(),
    playItemsPromise,
  ]);

  const levelRows = Array.isArray(levelsResult?.data) ? levelsResult.data : [];
  const streakRows = Array.isArray(streaksResult?.data) ? streaksResult.data : [];
  const xpRows = Array.isArray(xpResult?.data) ? xpResult.data : [];
  const engagementRows = Array.isArray(engagementResult?.data) ? engagementResult.data : [];
  const playRows = Array.isArray(playItemsResult?.data) ? playItemsResult.data : [];
  // XP/nível autoritativos vêm de profiles.aura_xp. user_levels/xp_transactions
  // são legados/ledger e podem conter saldos contaminados; não podem destravar
  // conquistas de XP/nível nem elevar usuário novo para nível 25.
  const totalXp = Math.max(0, Number(profile?.aura_xp ?? 0));
  const currentLevel = levelFromXp(totalXp);
  const currentStreak = Math.max(
    0,
    Number(profile?.aura_streak_days ?? 0),
    ...levelRows.map((row) => Number(row?.streak_days ?? 0)),
    ...streakRows.map((row: any) => Number(row?.current_streak ?? 0)),
  );
  const activityDays = new Set<string>();
  [...xpRows, ...engagementRows].forEach((row) => {
    const createdAt = row?.created_at;
    if (typeof createdAt === 'string' && createdAt.length >= 10) activityDays.add(createdAt.slice(0, 10));
  });
  const playViewsTotal = playRows.reduce((sum, r: any) => sum + Math.max(0, Number(r?.view_count ?? 0)), 0);

  const likes = postLikes + profileLikes;
  const gifts = chatGifts + auraGifts;
  const superDms = Math.max(priorityTransactions, priorityMessages);
  const actionTotal = likes + follows + saves + comments + polls + gifts + superDms;
  const matchesTotal = (matchesA || 0) + (matchesB || 0) + (matchesC || 0);

  // Métricas Oculto Play (listen streak + visit streak/days).
  let playListenStreak = 0;
  let playVisitStreakConsec = 0;
  let playVisitDays = 0;
  try {
    const { data } = await (supabase as any).rpc('oculto_play_user_metrics');
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      playListenStreak = Number(row.listen_streak ?? 0);
      playVisitStreakConsec = Number(row.visit_streak_consec ?? 0);
      playVisitDays = Number(row.visit_days_total ?? 0);
    }
  } catch { /* silencioso */ }

  return {
    total_xp: totalXp,
    current_level: currentLevel,
    account_age_days: accountAgeDaysFromCreatedAt(profile?.created_at),
    current_streak: currentStreak,
    visit_days: Math.max(currentStreak, activityDays.size),
    quests_claimed: actionTotal,
    super_dm_quests: superDms,
    likes_quests: likes,
    follows_quests: follows,
    saves_quests: saves,
    comments_quests: comments,
    polls_quests: polls,
    gifts_quests: gifts,
    communities_joined: commJoined,
    community_topics: commTopics,
    play_publishes: playPublishes,
    play_views_total: playViewsTotal,
    play_movies_completed: playMoviesCompleted,
    chat_messages: chatMessages,
    rooms_joined: 0, // refinado pelo RPC server-side
    rooms_messages: roomsMessages,
    matches_total: matchesTotal,
    engagement_rank: 0,
    rank_top100_flag: 0,
    rank_top10_flag: 0,
    play_listen_streak: playListenStreak,
    play_visit_streak_consec: playVisitStreakConsec,
    play_visit_days: playVisitDays,
  };
};

// Catálogo fixo — a verdade dos thresholds vive no front.
export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  // Núcleo Aura
  { id: 'lvl_5',     title: 'Aura Acesa',         desc: 'Alcance o nível 5.',                metric: 'current_level',  threshold: 5,   icon: 'star',     tier: 'bronze' },
  { id: 'lvl_10',    title: 'Brilho Constante',   desc: 'Alcance o nível 10.',               metric: 'current_level',  threshold: 10,  icon: 'star',     tier: 'prata'  },
  { id: 'lvl_20',    title: 'Estrela Magnética',  desc: 'Alcance o nível 20.',               metric: 'current_level',  threshold: 20,  icon: 'crown',    tier: 'ouro'   },
  { id: 'streak_3',  title: 'Frequência',         desc: 'Visite o Aura por 3 dias seguidos.',metric: 'current_streak', threshold: 3,   icon: 'flame',    tier: 'bronze' },
  { id: 'streak_7',  title: 'Sete Chamas',        desc: '7 dias de aura ativa.',             metric: 'current_streak', threshold: 7,   icon: 'flame',    tier: 'prata'  },
  { id: 'streak_30', title: 'Pulso Eterno',       desc: '30 dias seguidos no Aura.',         metric: 'current_streak', threshold: 30,  icon: 'flame',    tier: 'platina'},
  { id: 'visits_15', title: 'Explorador',         desc: 'Visite o Aura em 15 dias diferentes.',metric: 'visit_days',   threshold: 15,  icon: 'sparkles', tier: 'prata'  },
  { id: 'quests_10', title: 'Devoto das Missões', desc: 'Realize 10 ações sociais rastreadas.', metric: 'quests_claimed', threshold: 10,  icon: 'trophy',   tier: 'bronze' },
  { id: 'quests_50', title: 'Mestre das Missões', desc: 'Realize 50 ações sociais rastreadas.', metric: 'quests_claimed', threshold: 50,  icon: 'trophy',   tier: 'ouro'   },
  { id: 'sdm_5',     title: 'Coração Ousado',     desc: '5 Super DMs enviados.',             metric: 'super_dm_quests',threshold: 5,   icon: 'heart',    tier: 'prata'  },
  { id: 'xp_1000',   title: 'Mil de XP',          desc: 'Acumule 1.000 XP.',                 metric: 'total_xp',       threshold: 1000,icon: 'sparkles', tier: 'ouro'   },
  { id: 'visits_30', title: 'Andarilho da Aura',  desc: 'Visite o Aura em 30 dias diferentes.', metric: 'visit_days',     threshold: 30,   icon: 'sparkles', tier: 'ouro'    },
  { id: 'lvl_50',    title: 'Lenda da Aura',      desc: 'Alcance o nível 50.',                  metric: 'current_level',  threshold: 50,   icon: 'crown',    tier: 'platina' },
  { id: 'quests_200',title: 'Devoção Suprema',    desc: 'Realize 200 ações sociais rastreadas.', metric: 'quests_claimed', threshold: 200,  icon: 'trophy',   tier: 'platina' },
  { id: 'xp_10000',  title: 'Sol Interior',       desc: 'Acumule 150.000 XP no Aura.',          metric: 'total_xp',       threshold: 150000,icon: 'sparkles', tier: 'platina' },
  // Novas conquistas sociais — exploram missões de feed/perfil/votação
  { id: 'likes_5',   title: 'Energia Boa',        desc: 'Faça 5 curtidas reais.',              metric: 'likes_quests',   threshold: 5,    icon: 'heart',    tier: 'bronze'  },
  { id: 'likes_25',  title: 'Coração Generoso',   desc: 'Faça 25 curtidas reais.',             metric: 'likes_quests',   threshold: 25,   icon: 'heart',    tier: 'ouro'    },
  { id: 'follows_5', title: 'Tecendo a Rede',     desc: 'Siga 5 perfis reais.',                metric: 'follows_quests', threshold: 5,    icon: 'sparkles', tier: 'bronze'  },
  { id: 'follows_25',title: 'Conector Nato',      desc: 'Siga 25 perfis reais.',               metric: 'follows_quests', threshold: 25,   icon: 'sparkles', tier: 'ouro'    },
  { id: 'saves_5',   title: 'Curador',            desc: 'Salve 5 posts reais.',                metric: 'saves_quests',   threshold: 5,    icon: 'star',     tier: 'bronze'  },
  { id: 'saves_25',  title: 'Arquivista',         desc: 'Salve 25 posts reais.',               metric: 'saves_quests',   threshold: 25,   icon: 'star',     tier: 'ouro'    },
  { id: 'comments_5',title: 'Voz Ativa',          desc: 'Comente 5 vezes em posts reais.',     metric: 'comments_quests',threshold: 5,    icon: 'sparkles', tier: 'bronze'  },
  { id: 'comments_25',title:'Mestre do Diálogo',  desc: 'Comente 25 vezes em posts reais.',    metric: 'comments_quests',threshold: 25,   icon: 'sparkles', tier: 'ouro'    },
  { id: 'polls_5',   title: 'Voto Decisivo',      desc: 'Vote 5 vezes em enquetes reais.',     metric: 'polls_quests',   threshold: 5,    icon: 'trophy',   tier: 'bronze'  },
  { id: 'gifts_3',   title: 'Doador de Aura',     desc: 'Envie 3 presentes reais.',            metric: 'gifts_quests',   threshold: 3,    icon: 'heart',    tier: 'prata'   },
  { id: 'gifts_10',  title: 'Mecenas da Aura',    desc: 'Envie 10 presentes reais.',           metric: 'gifts_quests',   threshold: 10,   icon: 'crown',    tier: 'platina' },
  // Comunidades
  { id: 'comm_join_1',    title: 'Bem-vindo à Tribo', desc: 'Entre em 1 comunidade.',           metric: 'communities_joined', threshold: 1,    icon: 'users',  tier: 'bronze',  category: 'community' },
  { id: 'comm_join_5',    title: 'Multi-Tribos',      desc: 'Participe de 5 comunidades.',      metric: 'communities_joined', threshold: 5,    icon: 'users',  tier: 'prata',   category: 'community' },
  { id: 'comm_topics_3',  title: 'Voz da Comunidade', desc: 'Crie 3 tópicos em comunidades.',   metric: 'community_topics',   threshold: 3,    icon: 'users',  tier: 'bronze',  category: 'community' },
  { id: 'comm_topics_25', title: 'Cronista da Tribo', desc: 'Crie 25 tópicos em comunidades.',  metric: 'community_topics',   threshold: 25,   icon: 'users',  tier: 'ouro',    category: 'community' },
  // Oculto Play
  { id: 'play_pub_1',     title: 'Estreante no Play', desc: 'Publique 1 item no Oculto Play.',  metric: 'play_publishes',     threshold: 1,    icon: 'music',  tier: 'bronze',  category: 'play' },
  { id: 'play_pub_10',    title: 'Artista da Casa',   desc: 'Publique 10 itens no Oculto Play.',metric: 'play_publishes',     threshold: 10,   icon: 'music',  tier: 'prata',   category: 'play' },
  { id: 'play_views_1k',  title: 'Audiência Real',    desc: 'Acumule 1.000 views no Play.',     metric: 'play_views_total',   threshold: 1000, icon: 'music',  tier: 'ouro',    category: 'play' },
  { id: 'play_movie_1',   title: 'Primeira Sessão',   desc: 'Assista 1 filme completo no Oculto Play.',  metric: 'play_movies_completed', threshold: 1,  icon: 'music', tier: 'bronze',  category: 'play' },
  { id: 'play_movie_5',   title: 'Maratona de Filmes',desc: 'Assista 5 filmes completos no Oculto Play.', metric: 'play_movies_completed', threshold: 5,  icon: 'music', tier: 'ouro',    category: 'play' },
  { id: 'play_movie_15',  title: 'Cineasta Oculto',   desc: 'Assista 15 filmes completos no Oculto Play.', metric: 'play_movies_completed', threshold: 15, icon: 'music', tier: 'platina', category: 'play' },
  { id: 'play_visit_streak_10', title: 'Ritual Diário do Play', desc: 'Entre no Oculto Play por 10 dias seguidos.', metric: 'play_visit_streak_consec', threshold: 10, icon: 'music', tier: 'prata',   category: 'play' },
  { id: 'play_visit_30',        title: 'Frequentador do Play',  desc: 'Entre no Oculto Play em 30 dias diferentes.', metric: 'play_visit_days',          threshold: 30, icon: 'music', tier: 'ouro',    category: 'play' },
  { id: 'play_listen_streak_10', title: 'Maratona Sonora',      desc: 'Ouça 10 itens em sequência sem parar.',       metric: 'play_listen_streak',       threshold: 10, icon: 'music', tier: 'platina', category: 'play' },
  // Chat
  { id: 'chat_50',        title: 'Conversador',       desc: 'Envie 50 mensagens no chat.',      metric: 'chat_messages',      threshold: 50,   icon: 'chat',   tier: 'bronze',  category: 'chat' },
  { id: 'chat_500',       title: 'Mestre do Chat',    desc: 'Envie 500 mensagens no chat.',     metric: 'chat_messages',      threshold: 500,  icon: 'chat',   tier: 'prata',   category: 'chat' },
  // Salas ao vivo
  { id: 'rooms_join_3',   title: 'Habitante das Salas', desc: 'Participe de 3 salas ao vivo.',  metric: 'rooms_joined',       threshold: 3,    icon: 'mic',    tier: 'bronze',  category: 'rooms' },
  { id: 'rooms_msgs_25',  title: 'Voz das Salas',     desc: 'Envie 25 falas em salas ao vivo.', metric: 'rooms_messages',     threshold: 25,   icon: 'mic',    tier: 'prata',   category: 'rooms' },
  // Matches
  { id: 'match_1',        title: 'Primeiro Par',      desc: 'Tenha 1 match real.',              metric: 'matches_total',      threshold: 1,    icon: 'magnet', tier: 'bronze',  category: 'matches' },
  { id: 'match_10',       title: 'Conexão em Série',  desc: 'Tenha 10 matches reais.',          metric: 'matches_total',      threshold: 10,   icon: 'magnet', tier: 'prata',   category: 'matches' },
  { id: 'match_50',       title: 'Ímã de Conexões',   desc: 'Tenha 50 matches reais.',          metric: 'matches_total',      threshold: 50,   icon: 'magnet', tier: 'ouro',    category: 'matches' },
  // Ranking de engajamento
  { id: 'rank_top100',    title: 'Entre os 100',      desc: 'Entre no Top 100 do ranking Aura.',metric: 'rank_top100_flag',   threshold: 1,    icon: 'rank',   tier: 'prata',   category: 'ranking' },
  { id: 'rank_top10',     title: 'Top 10 do Aura',    desc: 'Entre no Top 10 do ranking Aura.', metric: 'rank_top10_flag',    threshold: 1,    icon: 'rank',   tier: 'platina', category: 'ranking' },
  // ── META PLATINA — calculadas a partir do conjunto de claims do usuário
  { id: 'meta_all_rares', title: 'Coroa Rara',        desc: 'Resgate todas as conquistas RARAS do Aura.', metric: 'total_xp', threshold: RARE_ACHIEVEMENT_IDS.length, icon: 'crown',  tier: 'platina' },
  { id: 'meta_all',       title: 'Lenda Suprema',     desc: 'Resgate todas as conquistas do Aura.',       metric: 'total_xp', threshold: 0 /* preenchido dinamicamente */, icon: 'trophy', tier: 'platina' },
];

// Ordem de dificuldade dos tiers (do mais fácil ao mais difícil).
export const TIER_RANK: Record<AchievementDef['tier'], number> = {
  bronze: 0, prata: 1, ouro: 2, platina: 3,
};

const SEEN_KEY = (uid: string) => `aura.achievements.seen.${uid}`;

export function useAuraAchievements() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<AuraMetrics>(FALLBACK);
  const [claimedSet, setClaimedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);
  const hydratedRef = useRef(false);
  const visitRegisteredRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;
    seenRef.current = null;
    visitRegisteredRef.current = false;
    setMetrics(FALLBACK);
    setClaimedSet(new Set());
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Registra a visita do dia (idempotente server-side via data SP) para
      // que conquistas baseadas em streak ("Frequência", "Sete Chamas", etc.)
      // progridam mesmo quando o usuário entra direto no feed ou em outras
      // áreas — uma vez por sessão é suficiente.
      if (!visitRegisteredRef.current) {
        visitRegisteredRef.current = true;
        try { await (supabase as any).rpc('aura_register_visit'); } catch { /* silencioso */ }
        try { await (supabase as any).rpc('aura_streak_check_in'); } catch { /* silencioso */ }
      }
      const [{ data, error }, direct, claimsRes] = await Promise.all([
        (supabase as any).rpc('aura_achievements_metrics'),
        fetchDirectMetrics(user.id),
        (supabase as any).from('oculto_aura_achievement_claims').select('achievement_id').eq('user_id', user.id),
      ]);
      const rpcMetrics = !error && data?.[0] ? (data[0] as AuraMetrics) : FALLBACK;
      const merged = mergeMetrics(rpcMetrics, direct);
      // Deriva flags de ranking a partir de engagement_rank (menor = melhor)
      const rank = merged.engagement_rank || 0;
      merged.rank_top100_flag = rank > 0 && rank <= 100 ? 1 : 0;
      merged.rank_top10_flag = rank > 0 && rank <= 10 ? 1 : 0;
      setMetrics(sanitizeEntryDayMetrics(merged));
      if (!claimsRes?.error && Array.isArray(claimsRes?.data)) {
        const claimedIds = (claimsRes.data as any[]).map((r) => r.achievement_id).filter(Boolean);
        setClaimedSet(new Set(claimedIds));
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user?.id) return;
    const onProgressed = () => { refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(AURA_QUEST_EVENT, onProgressed);
    document.addEventListener('visibilitychange', onVisible);
    const unsubGiftHistory = subscribeTable('gift_history', onProgressed, { events: ['INSERT'] });
    const unsubAuraGifts = subscribeTable('oculto_aura_xp_gifts', onProgressed, { events: ['INSERT'] });
    const unsubClaims = subscribeTable('oculto_aura_achievement_claims', onProgressed, { events: ['INSERT'] });
    const unsubMovieCompletions = subscribeTable('oculto_play_movie_completions', onProgressed, { events: ['INSERT'] });
    return () => {
      window.removeEventListener(AURA_QUEST_EVENT, onProgressed);
      document.removeEventListener('visibilitychange', onVisible);
      unsubGiftHistory();
      unsubAuraGifts();
      unsubClaims();
      unsubMovieCompletions();
    };
  }, [user?.id, refresh]);

  const achievements = useMemo<Achievement[]>(() => {
    const ordered = [...ACHIEVEMENT_CATALOG].sort((a, b) => {
      const t = TIER_RANK[a.tier] - TIER_RANK[b.tier];
      if (t !== 0) return t;
      return a.threshold - b.threshold;
    });
    const tierTotals: Record<AchievementDef['tier'], number> = { bronze: 0, prata: 0, ouro: 0, platina: 0 };
    ordered.forEach((a) => { tierTotals[a.tier] += 1; });
    const tierCursor: Record<AchievementDef['tier'], number> = { bronze: 0, prata: 0, ouro: 0, platina: 0 };

    // Totais para meta-conquistas (excluem as próprias metas).
    const metaSet = new Set<string>(META_ACHIEVEMENT_IDS);
    const rareSet = new Set<string>(RARE_ACHIEVEMENT_IDS);
    const totalNonMeta = ACHIEVEMENT_CATALOG.filter((x) => !metaSet.has(x.id)).length;
    let claimedNonMeta = 0;
    let claimedRares = 0;
    claimedSet.forEach((id) => {
      if (metaSet.has(id)) return;
      claimedNonMeta += 1;
      if (rareSet.has(id)) claimedRares += 1;
    });

    return ordered.map((a) => {
      const isPlatinum = metaSet.has(a.id);
      let threshold = a.threshold;
      let current = Number(metrics[a.metric] ?? 0);
      if (a.id === 'meta_all_rares') { threshold = rareSet.size; current = claimedRares; }
      else if (a.id === 'meta_all')   { threshold = totalNonMeta; current = claimedNonMeta; }

      const pct = threshold > 0 ? Math.min(100, Math.round((current / threshold) * 100)) : 0;
      const idx = tierCursor[a.tier]++;
      const baseXp = computeAchievementXp(a, idx, tierTotals[a.tier]);
      const xpReward = XP_REWARD_OVERRIDES[a.id] ?? baseXp;
      // Metas PLATINA não passam pelo lock de raras (não são "raras" no critério clássico).
      const rareLocked = !isPlatinum && isRareLockedForNewAccount(a.id, xpReward, metrics);
      return {
        ...a,
        threshold,
        current,
        unlocked: current >= threshold && threshold > 0 && !rareLocked,
        progressPct: pct,
        xpReward,
        claimed: claimedSet.has(a.id),
        isRare: !isPlatinum && xpReward >= 10000,
        isPlatinum,
      };
    });
  }, [metrics, claimedSet]);



  // Detecta conquistas desbloqueadas e credita XP via RPC idempotente.
  // Estratégia: para CADA conquista desbloqueada (mesmo as antigas) tenta dar claim
  // no servidor. O banco garante crédito único por (user, achievement). Se o claim
  // ainda não havia sido feito, o toast aparece; caso contrário fica silencioso.
  useEffect(() => {
    if (!user?.id) return;
    if (!achievements.length) return;

    // Hidrata o set "processed" do localStorage para evitar retentativas no mesmo device.
    if (!hydratedRef.current) {
      try {
        // Migração v3: reprocessa conquistas já desbloqueadas após a validação
        // server-side de requisitos reais (presentes, ações, níveis e XP).
        // v4: reprocessa após expansão (comunidades/play/chat/salas/matches/ranking)
        // e backfill de applied_to_balance no servidor.
        // v5: reprocessa após RPC v2 (suporte total a IDs novos + RARA broadcast).
        // v6: força reprocessamento após hard-fix de isolamento por usuário
        // (limpeza de claims vazados + recálculo de aura_xp/aura_level).
        // v7: reprocessa após reset de conquistas contaminadas + guard server-side.
        const MIGRATION_KEY = `aura.achievements.seen.v7.${user.id}`;
        if (!localStorage.getItem(MIGRATION_KEY)) {
          localStorage.removeItem(SEEN_KEY(user.id));
          localStorage.removeItem(`aura.achievements.seen.v3.${user.id}`);
          localStorage.removeItem(`aura.achievements.seen.v4.${user.id}`);
          localStorage.removeItem(`aura.achievements.seen.v5.${user.id}`);
          localStorage.removeItem(`aura.achievements.seen.v6.${user.id}`);
          localStorage.setItem(MIGRATION_KEY, '1');
        }
        const raw = localStorage.getItem(SEEN_KEY(user.id));
        const parsed = raw ? (JSON.parse(raw) as string[]) : [];
        seenRef.current = new Set(parsed);
      } catch {
        seenRef.current = new Set();
      }
      hydratedRef.current = true;
    }


    const processed = seenRef.current ?? new Set<string>();
    // Verdade única = banco. Considera pendente tudo que está desbloqueado
    // E ainda NÃO foi creditado (não está em claimedSet). Isso garante que
    // tentativas anteriores que falharam (ex.: eligible=false por
    // dessincronia momentânea) sejam retentadas até dar awarded:true.
    const pending = achievements.filter((a) => a.unlocked && !a.claimed);
    if (pending.length === 0) return;

    let didAward = false;
    (async () => {
      const resolvedIds: string[] = [];
      for (const a of pending) {
        try {
          const { data, error } = await (supabase as any).rpc('aura_achievement_claim_v2', {
            p_achievement_id: a.id,
            p_xp_reward: a.xpReward,
            p_current: a.current,
            p_required: a.threshold,
            p_title: a.title,
          });
          if (error) continue;
          const row = Array.isArray(data) ? data[0] : data;
          const alreadyClaimed = row?.already_claimed === true;
          if (row?.awarded || alreadyClaimed) {
            processed.add(a.id);
            resolvedIds.push(a.id);
          }
          if (row?.awarded) {
            didAward = true;
            toast.success(`🏆 ${a.isRare ? 'Conquista RARA: ' : 'Conquista desbloqueada: '}${a.title}`, {
              description: `+${a.xpReward.toLocaleString('pt-BR')} XP creditados no seu saldo.`,
              duration: 6000,
            });
          }
        } catch {
          /* silencioso */
        }
      }
      if (resolvedIds.length > 0) {
        setClaimedSet((prev) => new Set([...prev, ...resolvedIds]));
      }
      try { localStorage.setItem(SEEN_KEY(user.id), JSON.stringify([...processed])); } catch {}
      if (didAward) {
        try { window.dispatchEvent(new CustomEvent(AURA_QUEST_EVENT, { detail: { source: 'achievement' } })); } catch {}
        refresh();
      }
    })();
  }, [achievements, user?.id, refresh]);

  // Resgate manual (botão "Resgatar" nos cards "Concluída"). Idempotente —
  // UNIQUE(user, achievement) garante crédito único no servidor.
  const claim = useCallback(async (achievementId: string) => {
    if (!user?.id) return false;
    const a = achievements.find((x) => x.id === achievementId);
    if (!a) return false;
    if (a.claimed) {
      toast.info('Conquista já resgatada.');
      return true;
    }
    if (!a.unlocked) {
      toast.error('Conquista ainda não concluída.', {
        description: `Faltam ${Math.max(0, a.threshold - a.current)} para desbloquear.`,
      });
      return false;
    }
    try {
      const { data, error } = await (supabase as any).rpc('aura_achievement_claim_v2', {
        p_achievement_id: a.id,
        p_xp_reward: a.xpReward,
        p_current: a.current,
        p_required: a.threshold,
        p_title: a.title,
      });
      if (error) {
        toast.error('Não foi possível resgatar agora.', { description: error.message });
        return false;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.awarded) {
        setClaimedSet((prev) => new Set(prev).add(a.id));
        toast.success(`🏆 ${a.isRare ? 'Conquista RARA: ' : 'Conquista resgatada: '}${a.title}`, {
          description: `+${a.xpReward.toLocaleString('pt-BR')} XP creditados no seu saldo.`,
          duration: 6000,
        });
        try { window.dispatchEvent(new CustomEvent(AURA_QUEST_EVENT, { detail: { source: 'achievement_manual' } })); } catch {}
        await refresh();
        return true;
      }
      if (row?.already_claimed) {
        setClaimedSet((prev) => new Set(prev).add(a.id));
        toast.info('Conquista já resgatada.');
        await refresh();
        return true;
      }
      toast.error('Conquista ainda não elegível para resgate no servidor.');
      return false;
    } catch (e: any) {
      toast.error('Falha ao resgatar.', { description: e?.message });
      return false;
    }
  }, [achievements, user?.id, refresh]);

  // Resgata em lote todas as conquistas desbloqueadas e ainda não creditadas.
  const claimAll = useCallback(async () => {
    if (!user?.id) return 0;
    const pending = achievements.filter((a) => a.unlocked && !a.claimed);
    if (pending.length === 0) {
      toast.info('Nenhuma conquista pendente para resgatar.');
      return 0;
    }
    let claimed = 0;
    let resolved = 0;
    let totalXp = 0;
    const resolvedIds: string[] = [];
    for (const a of pending) {
      try {
        const { data, error } = await (supabase as any).rpc('aura_achievement_claim_v2', {
          p_achievement_id: a.id,
          p_xp_reward: a.xpReward,
          p_current: a.current,
          p_required: a.threshold,
          p_title: a.title,
        });
        if (error) continue;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.awarded) {
          claimed += 1;
          totalXp += a.xpReward;
          resolved += 1;
          resolvedIds.push(a.id);
        } else if (row?.already_claimed) {
          resolved += 1;
          resolvedIds.push(a.id);
        }
      } catch { /* silencioso */ }
    }
    if (resolvedIds.length > 0) {
      setClaimedSet((prev) => new Set([...prev, ...resolvedIds]));
    }
    if (claimed > 0) {
      toast.success(`🏆 ${claimed} conquista(s) resgatada(s)`, {
        description: `+${totalXp.toLocaleString('pt-BR')} XP creditados no seu saldo Aura.`,
        duration: 6000,
      });
      try { window.dispatchEvent(new CustomEvent(AURA_QUEST_EVENT, { detail: { source: 'achievement_bulk' } })); } catch {}
      await refresh();
    } else if (resolved > 0) {
      toast.info('Conquistas já estavam resgatadas; status sincronizado.');
      await refresh();
    } else {
      toast.error('Nenhuma conquista foi resgatada (verifique elegibilidade).');
    }
    return claimed;
  }, [achievements, user?.id, refresh]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const claimedCount = achievements.filter((a) => a.claimed).length;
  const pendingClaimCount = achievements.filter((a) => a.unlocked && !a.claimed).length;
  const totalCount = achievements.length;

  return {
    metrics, achievements,
    unlockedCount, claimedCount, pendingClaimCount, totalCount,
    loading, refresh, claim, claimAll,
  };
}
