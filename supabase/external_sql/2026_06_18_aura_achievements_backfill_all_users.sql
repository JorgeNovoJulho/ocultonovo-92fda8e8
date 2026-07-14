-- =====================================================================
-- Aura Match — Backfill universal de conquistas para TODOS os usuários
-- (versão CORRIGIDA: sem dependência de _to_claim, em CTE única)
-- + habilita REALTIME para posts e tópicos de comunidades.
-- Cole no SQL Editor do Supabase externo e execute.
-- =====================================================================
BEGIN;

-- 1) Garante função aura_level_from_xp
CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(0, COALESCE(p_xp,0))::numeric / 50))::int + 1);
$$;
GRANT EXECUTE ON FUNCTION public.aura_level_from_xp(integer) TO authenticated, anon, service_role;

-- 2) Garante tabela de claims
CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  profile_id      uuid NULL,
  achievement_id  text NOT NULL,
  xp_awarded      integer NOT NULL DEFAULT 0,
  applied_to_balance boolean NOT NULL DEFAULT true,
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

-- 3) Limpa temp-tables remanescentes de execuções anteriores
DROP TABLE IF EXISTS _aura_ach_defs;
DROP TABLE IF EXISTS _master;
DROP TABLE IF EXISTS _user_metrics;

-- 4) Catálogo de conquistas (espelha src/hooks/useAuraAchievements.ts)
CREATE TEMP TABLE _aura_ach_defs(
  id          text PRIMARY KEY,
  metric      text NOT NULL,
  threshold   int  NOT NULL,
  xp_reward   int  NOT NULL
) ON COMMIT PRESERVE ROWS;

INSERT INTO _aura_ach_defs(id, metric, threshold, xp_reward) VALUES
  -- Bronze (500-900)
  ('quests_10',     'quests_claimed',     10,  500),
  ('likes_5',       'likes_quests',        5,  550),
  ('follows_5',     'follows_quests',      5,  600),
  ('saves_5',       'saves_quests',        5,  650),
  ('comments_5',    'comments_quests',     5,  700),
  ('polls_5',       'polls_quests',        5,  750),
  ('comm_join_1',   'communities_joined',  1,  800),
  ('comm_topics_3', 'community_topics',    3,  850),
  ('play_pub_1',    'play_publishes',      1,  900),
  ('chat_50',       'chat_messages',      50,  900),
  ('rooms_join_3',  'rooms_joined',        3,  900),
  ('match_1',       'matches_total',       1,  900),
  -- Prata (1500-2500)
  ('lvl_5',         'current_level',       5, 1500),
  ('streak_3',      'current_streak',      3, 1650),
  ('visits_15',     'visit_days',         15, 1800),
  ('sdm_5',         'super_dm_quests',     5, 1900),
  ('gifts_3',       'gifts_quests',        3, 2050),
  ('comm_join_5',   'communities_joined',  5, 2200),
  ('play_pub_10',   'play_publishes',     10, 2350),
  ('chat_500',      'chat_messages',     500, 2500),
  ('rooms_msgs_25', 'rooms_messages',     25, 2500),
  ('match_10',      'matches_total',      10, 2500),
  ('rank_top100',   'rank_top100_flag',    1, 2500),
  -- Ouro (3500-5500)
  ('lvl_10',        'current_level',      10, 3500),
  ('streak_7',      'current_streak',      7, 3750),
  ('quests_50',     'quests_claimed',     50, 4000),
  ('xp_1000',       'total_xp',         1000, 4250),
  ('visits_30',     'visit_days',         30, 4500),
  ('likes_25',      'likes_quests',       25, 4750),
  ('follows_25',    'follows_quests',     25, 5000),
  ('saves_25',      'saves_quests',       25, 5250),
  ('comments_25',   'comments_quests',    25, 5500),
  ('comm_topics_25','community_topics',   25, 5500),
  ('play_views_1k', 'play_views_total', 1000,10000),
  ('match_50',      'matches_total',      50,10000),
  -- Platina (7000-10000)
  ('lvl_20',        'current_level',      20, 7000),
  ('streak_30',     'current_streak',     30, 7500),
  ('lvl_50',        'current_level',      50, 8000),
  ('quests_200',    'quests_claimed',    200, 8500),
  ('xp_10000',      'total_xp',        10000, 9000),
  ('gifts_10',      'gifts_quests',       10, 9500),
  ('rank_top10',    'rank_top10_flag',     1,10000);

-- 5) Master (excluído da operação)
CREATE TEMP TABLE _master ON COMMIT PRESERVE ROWS AS
SELECT DISTINCT u.id AS uid
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
 WHERE lower(COALESCE(p.username,'')) IN ('ocultomaster','oculto_master','oculto-master')
    OR lower(COALESCE(u.email,'')) LIKE '%ocultomaster%';

-- 6) Helper resiliente: executa qualquer SELECT COUNT/SUM e devolve 0 se a tabela
--    ou coluna não existir. Evita ERROR 42P01 / 42703 em schemas heterogêneos.
CREATE OR REPLACE FUNCTION pg_temp.safe_int(p_sql text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v int;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN COALESCE(v, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END $$;

-- 7) Métricas por usuário (todas as fontes via helper dinâmico)
CREATE TEMP TABLE _user_metrics ON COMMIT PRESERVE ROWS AS
WITH base AS (
  SELECT u.id AS uid,
    (SELECT pp.id FROM public.profiles pp WHERE pp.user_id = u.id
       ORDER BY pp.created_at ASC NULLS LAST LIMIT 1) AS pid,
    COALESCE((SELECT MAX(pp.aura_xp) FROM public.profiles pp WHERE pp.user_id = u.id),0) AS profile_xp,
    COALESCE((SELECT MAX(pp.aura_level) FROM public.profiles pp WHERE pp.user_id = u.id),1) AS profile_level,
    COALESCE((SELECT MAX(pp.aura_streak_days) FROM public.profiles pp WHERE pp.user_id = u.id),0) AS profile_streak
  FROM auth.users u
  WHERE u.id NOT IN (SELECT uid FROM _master)
    AND COALESCE((SELECT pp.is_seed FROM public.profiles pp WHERE pp.user_id = u.id LIMIT 1), false) = false
)
SELECT b.uid, b.pid,
  GREATEST(b.profile_xp,
    pg_temp.safe_int(format('SELECT COALESCE(SUM(GREATEST(0,amount))::int,0) FROM public.xp_transactions WHERE user_id=%L', b.uid))
  ) AS total_xp,
  b.profile_level AS current_level,
  b.profile_streak AS current_streak,
  pg_temp.safe_int(format('SELECT COUNT(DISTINCT created_at::date)::int FROM public.xp_transactions WHERE user_id=%L', b.uid)) AS visit_days,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.post_likes WHERE user_id=%L', b.uid))
   + GREATEST(
       pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.profile_likes WHERE liker_id=%L', b.uid)),
       pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.profile_likes WHERE user_id=%L', b.uid))
     ) AS likes_q,
  GREATEST(
    pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.follows WHERE follower_id=%L', b.uid)),
    pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.followers WHERE follower_id=%L', b.uid))
  ) AS follows_q,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.saved_posts WHERE user_id=%L', b.uid)) AS saves_q,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.post_comments WHERE user_id=%L AND COALESCE(is_hidden,false)=false', b.uid)) AS comments_q,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.poll_votes WHERE voter_id=%L', b.uid)) AS polls_q,
  (pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.gift_history WHERE sender_id=%L', b.uid))
   + pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.oculto_aura_xp_gifts WHERE sender_id=%L', b.pid))
  ) AS gifts_q,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.priority_message_transactions WHERE sender_profile_id=%L', b.pid)) AS sdm_q,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.messages WHERE sender_id=%L', b.uid)) AS chat_msgs,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.oculto_community_members WHERE user_id=%L', b.uid)) AS comm_join,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.oculto_community_topics WHERE author_id=%L', b.pid)) AS comm_topics,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.oculto_play_items WHERE author_id=%L AND is_published=true', b.pid)) AS play_pubs,
  pg_temp.safe_int(format('SELECT COALESCE(SUM(GREATEST(0,view_count))::int,0) FROM public.oculto_play_items WHERE author_id=%L', b.pid)) AS play_views,
  pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.oculto_aura_room_messages WHERE author_id=%L', b.pid)) AS rooms_msgs,
  pg_temp.safe_int(format('SELECT COUNT(DISTINCT room_id)::int FROM public.oculto_aura_room_participants WHERE user_id=%L', b.uid)) AS rooms_join,
  (pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.perfect_pairs WHERE user1_id=%L OR user2_id=%L', b.uid, b.uid))
   + pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.lucky_matches WHERE user1_id=%L OR user2_id=%L', b.uid, b.uid))
   + pg_temp.safe_int(format('SELECT COUNT(*)::int FROM public.looking_now_matches WHERE user1_id=%L OR user2_id=%L', b.uid, b.uid))
  ) AS matches_total
FROM base b
WHERE b.pid IS NOT NULL;

-- 7) INSERT de claims + UPDATE de XP em UMA única CTE writable
--    (sem temp _to_claim — elimina o erro 42P01)
WITH candidates AS (
  SELECT m.uid, m.pid, d.id AS achievement_id, d.xp_reward,
    CASE d.metric
      WHEN 'total_xp'           THEN m.total_xp
      WHEN 'current_level'      THEN m.current_level
      WHEN 'current_streak'     THEN m.current_streak
      WHEN 'visit_days'         THEN m.visit_days
      WHEN 'quests_claimed'     THEN (m.likes_q + m.follows_q + m.saves_q + m.comments_q + m.polls_q + m.gifts_q + m.sdm_q)
      WHEN 'super_dm_quests'    THEN m.sdm_q
      WHEN 'likes_quests'       THEN m.likes_q
      WHEN 'follows_quests'     THEN m.follows_q
      WHEN 'saves_quests'       THEN m.saves_q
      WHEN 'comments_quests'    THEN m.comments_q
      WHEN 'polls_quests'       THEN m.polls_q
      WHEN 'gifts_quests'       THEN m.gifts_q
      WHEN 'communities_joined' THEN m.comm_join
      WHEN 'community_topics'   THEN m.comm_topics
      WHEN 'play_publishes'     THEN m.play_pubs
      WHEN 'play_views_total'   THEN m.play_views
      WHEN 'chat_messages'      THEN m.chat_msgs
      WHEN 'rooms_joined'       THEN m.rooms_join
      WHEN 'rooms_messages'     THEN m.rooms_msgs
      WHEN 'matches_total'      THEN m.matches_total
      WHEN 'rank_top100_flag'   THEN 0
      WHEN 'rank_top10_flag'    THEN 0
      ELSE 0
    END AS current_value,
    d.threshold
  FROM _user_metrics m
  CROSS JOIN _aura_ach_defs d
),
eligible AS (
  SELECT c.uid, c.pid, c.achievement_id, c.xp_reward
    FROM candidates c
   WHERE c.current_value >= c.threshold
     AND NOT EXISTS (
       SELECT 1 FROM public.oculto_aura_achievement_claims cl
        WHERE cl.user_id = c.uid AND cl.achievement_id = c.achievement_id
     )
),
inserted AS (
  INSERT INTO public.oculto_aura_achievement_claims
    (user_id, profile_id, achievement_id, xp_awarded, applied_to_balance)
  SELECT uid, pid, achievement_id, xp_reward, true FROM eligible
  ON CONFLICT (user_id, achievement_id) DO NOTHING
  RETURNING user_id, xp_awarded
),
grants AS (
  SELECT user_id AS uid, SUM(xp_awarded)::int AS xp_sum
    FROM inserted
   GROUP BY user_id
),
upd AS (
  UPDATE public.profiles p
     SET aura_xp = GREATEST(0, COALESCE(p.aura_xp,0) + g.xp_sum),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(p.aura_xp,0) + g.xp_sum))
    FROM grants g
   WHERE p.user_id = g.uid
   RETURNING p.user_id, p.aura_xp
)
SELECT
  (SELECT COUNT(*) FROM inserted)        AS claims_inserted,
  (SELECT COUNT(*) FROM grants)          AS users_affected,
  (SELECT COALESCE(SUM(xp_sum),0) FROM grants) AS total_xp_credited,
  (SELECT COUNT(*) FROM upd)             AS profiles_updated;

COMMIT;

-- 8) Realtime: garante posts, tópicos de comunidades, profiles e claims
--    no publication supabase_realtime, com REPLICA IDENTITY FULL para
--    permitir entrega completa de payloads (UPDATE/DELETE).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.posts',
    'public.profiles',
    'public.oculto_aura_achievement_claims',
    'public.oculto_community_topics',
    'public.oculto_community_topic_messages',
    'public.oculto_community_members'
  ]
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      BEGIN
        EXECUTE format('ALTER TABLE %s REPLICA IDENTITY FULL', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
      EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- 9) Conferência rápida (linhas presentes na publicação realtime)
SELECT schemaname, tablename
  FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime'
   AND tablename IN ('posts','oculto_community_topics','profiles','oculto_aura_achievement_claims','oculto_community_topic_messages','oculto_community_members')
 ORDER BY tablename;
