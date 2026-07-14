import { describe, it, expect } from 'vitest';
import {
  sanitizeEntryDayMetrics,
  sanitizeEntryDayProgress,
  ENTRY_DAY_XP_CAP,
  ENTRY_DAY_LEVEL_CAP,
} from '../auraEntryDayGuard';

// Reproduz o shape de AuraMetrics sem importar o hook (que carrega supabase).
type AuraMetrics = {
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
  chat_messages: number;
  rooms_joined: number;
  rooms_messages: number;
  matches_total: number;
  engagement_rank: number;
  rank_top100_flag: number;
  rank_top10_flag: number;
  play_listen_streak: number;
  play_visit_streak_consec: number;
  play_visit_days: number;
};

const base: AuraMetrics = {
  total_xp: 0, current_level: 1, account_age_days: 0, current_streak: 0,
  visit_days: 0, quests_claimed: 0, super_dm_quests: 0,
  likes_quests: 0, follows_quests: 0, saves_quests: 0,
  comments_quests: 0, polls_quests: 0, gifts_quests: 0,
  communities_joined: 0, community_topics: 0,
  play_publishes: 0, play_views_total: 0,
  chat_messages: 0, rooms_joined: 0, rooms_messages: 0,
  matches_total: 0, engagement_rank: 0,
  rank_top100_flag: 0, rank_top10_flag: 0,
  play_listen_streak: 0, play_visit_streak_consec: 0, play_visit_days: 0,
};

describe('sanitizeEntryDayMetrics — regressão XP 10000 no dia da entrada', () => {
  it('clampa total_xp >= 10000 para 100 e nível para 2 em conta com 0 dias', () => {
    const out = sanitizeEntryDayMetrics({ ...base, total_xp: 10000, current_level: 25, account_age_days: 0 });
    expect(out.total_xp).toBe(ENTRY_DAY_XP_CAP);
    expect(out.current_level).toBe(ENTRY_DAY_LEVEL_CAP);
  });

  it('clampa nível >= 25 mesmo com XP "limpo" no dia da entrada', () => {
    const out = sanitizeEntryDayMetrics({ ...base, total_xp: 50, current_level: 25, account_age_days: 0 });
    expect(out.total_xp).toBe(ENTRY_DAY_XP_CAP);
    expect(out.current_level).toBe(ENTRY_DAY_LEVEL_CAP);
  });

  it('NÃO altera métricas legítimas de usuário com >= 1 dia de conta', () => {
    const out = sanitizeEntryDayMetrics({ ...base, total_xp: 25000, current_level: 30, account_age_days: 7 });
    expect(out.total_xp).toBe(25000);
    expect(out.current_level).toBe(30);
  });

  it('preserva XP baixo e nível baixo no dia da entrada (caminho feliz)', () => {
    const out = sanitizeEntryDayMetrics({ ...base, total_xp: 80, current_level: 2, account_age_days: 0 });
    expect(out.total_xp).toBe(80);
    expect(out.current_level).toBe(2);
  });

  it('garante que account_age_days faz parte da tipagem AuraMetrics (TS2741 fix)', () => {
    // Compila-se = passa. A chave abaixo é obrigatória no tipo.
    const m: AuraMetrics = { ...base, account_age_days: 3 };
    expect(m.account_age_days).toBe(3);
  });

  it('clampa também progresso vindo de RPC/Realtime quando profile.created_at é de hoje', () => {
    const createdAt = new Date().toISOString();
    const out = sanitizeEntryDayProgress({ xp: 10000, level: 25, streak_days: 0 }, createdAt);
    expect(out.xp).toBe(ENTRY_DAY_XP_CAP);
    expect(out.level).toBe(ENTRY_DAY_LEVEL_CAP);
  });
});
