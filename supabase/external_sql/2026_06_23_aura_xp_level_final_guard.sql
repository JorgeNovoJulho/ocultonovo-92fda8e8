-- =============================================================================
-- Aura XP/Nível — correção final do bug 10.000 XP / nível 25 em usuários novos
-- EXTERNO APENAS. Idempotente. Cole e execute INTEIRO no SQL Editor externo.
--
-- O que corrige:
-- 1) @jeferson volta para XP real 100 e nível 2.
-- 2) Usuários recentes contaminados por claim raro inválido perdem claims/broadcasts
--    que o XP real não suporta.
-- 3) aura_level passa a ser sempre derivado de aura_xp por trigger.
-- 4) aura_achievement_claim_v2 ignora valores do cliente e valida XP/nível apenas
--    pelo servidor, impedindo Sol Interior (+10.000 XP) indevido.
-- =============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aura_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS aura_streak_days integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(COALESCE(p_xp, 0), 0)::numeric / 50))::int + 1);
$$;

GRANT EXECUTE ON FUNCTION public.aura_level_from_xp(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oculto_profile_aura_level_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.aura_xp := GREATEST(0, COALESCE(NEW.aura_xp, 0));
  NEW.aura_level := public.aura_level_from_xp(NEW.aura_xp);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_profile_aura_level_guard ON public.profiles;
CREATE TRIGGER trg_oculto_profile_aura_level_guard
BEFORE INSERT OR UPDATE OF aura_xp, aura_level ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.oculto_profile_aura_level_guard();

CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_rewards (
  achievement_id text PRIMARY KEY,
  xp_reward      integer NOT NULL CHECK (xp_reward BETWEEN 100 AND 10000),
  required       integer NOT NULL CHECK (required > 0),
  metric         text    NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oculto_aura_achievement_rewards TO authenticated, anon;
GRANT ALL ON public.oculto_aura_achievement_rewards TO service_role;
ALTER TABLE public.oculto_aura_achievement_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rewards public read" ON public.oculto_aura_achievement_rewards;
CREATE POLICY "rewards public read" ON public.oculto_aura_achievement_rewards
  FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.oculto_aura_achievement_rewards(achievement_id, xp_reward, required, metric) VALUES
  ('lvl_5',500,5,'current_level'),
  ('lvl_10',1500,10,'current_level'),
  ('lvl_20',3500,20,'current_level'),
  ('lvl_50',10000,50,'current_level'),
  ('streak_3',500,3,'current_streak'),
  ('streak_7',1500,7,'current_streak'),
  ('streak_30',10000,30,'current_streak'),
  ('visits_15',2500,15,'visit_days'),
  ('visits_30',5500,30,'visit_days'),
  ('quests_10',500,10,'quests_claimed'),
  ('quests_50',5500,50,'quests_claimed'),
  ('quests_200',10000,200,'quests_claimed'),
  ('sdm_5',1500,5,'super_dm_quests'),
  ('xp_1000',3500,1000,'total_xp'),
  ('xp_10000',10000,10000,'total_xp'),
  ('likes_5',500,5,'likes_quests'),
  ('likes_25',5500,25,'likes_quests'),
  ('follows_5',500,5,'follows_quests'),
  ('follows_25',5500,25,'follows_quests'),
  ('saves_5',500,5,'saves_quests'),
  ('saves_25',5500,25,'saves_quests'),
  ('comments_5',500,5,'comments_quests'),
  ('comments_25',5500,25,'comments_quests'),
  ('polls_5',500,5,'polls_quests'),
  ('gifts_3',1500,3,'gifts_quests'),
  ('gifts_10',10000,10,'gifts_quests'),
  ('comm_join_1',500,1,'communities_joined'),
  ('comm_join_5',1500,5,'communities_joined'),
  ('comm_topics_3',500,3,'community_topics'),
  ('comm_topics_25',5500,25,'community_topics'),
  ('play_pub_1',500,1,'play_publishes'),
  ('play_pub_10',1500,10,'play_publishes'),
  ('play_views_1k',10000,1000,'play_views_total'),
  ('play_movie_1',1500,1,'play_movies_completed'),
  ('play_movie_5',5000,5,'play_movies_completed'),
  ('play_movie_15',10000,15,'play_movies_completed'),
  ('chat_50',500,50,'chat_messages'),
  ('chat_500',1500,500,'chat_messages'),
  ('rooms_join_3',500,3,'rooms_joined'),
  ('rooms_msgs_25',1500,25,'rooms_messages'),
  ('match_1',500,1,'matches_total'),
  ('match_10',1500,10,'matches_total'),
  ('match_50',10000,50,'matches_total'),
  ('rank_top100',1500,1,'rank_top100_flag'),
  ('rank_top10',10000,1,'rank_top10_flag'),
  ('play_listen_streak_10',10000,10,'play_listen_streak'),
  ('play_visit_streak_10',1500,10,'play_visit_streak_consec'),
  ('play_visit_30',3500,30,'play_visit_days')
ON CONFLICT (achievement_id) DO UPDATE
  SET xp_reward = EXCLUDED.xp_reward,
      required = EXCLUDED.required,
      metric = EXCLUDED.metric,
      updated_at = now();

CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NULL,
  achievement_id text NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  applied_to_balance boolean NOT NULL DEFAULT true,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
ALTER TABLE public.oculto_aura_achievement_claims
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL,
  ADD COLUMN IF NOT EXISTS xp_awarded integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_to_balance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS ux_oculto_aura_achievement_claims_user_achievement
  ON public.oculto_aura_achievement_claims(user_id, achievement_id);
GRANT SELECT ON public.oculto_aura_achievement_claims TO authenticated;
GRANT ALL ON public.oculto_aura_achievement_claims TO service_role;
ALTER TABLE public.oculto_aura_achievement_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "achievement claims owner read" ON public.oculto_aura_achievement_claims;
CREATE POLICY "achievement claims owner read" ON public.oculto_aura_achievement_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.oculto_aura_rare_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NULL,
  achievement_id text NOT NULL,
  achievement_title text NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
ALTER TABLE public.oculto_aura_rare_unlocks
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL,
  ADD COLUMN IF NOT EXISTS achievement_title text NULL,
  ADD COLUMN IF NOT EXISTS xp_awarded integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS ux_oculto_aura_rare_unlocks_user_achievement
  ON public.oculto_aura_rare_unlocks(user_id, achievement_id);
GRANT SELECT ON public.oculto_aura_rare_unlocks TO authenticated;
GRANT ALL ON public.oculto_aura_rare_unlocks TO service_role;
ALTER TABLE public.oculto_aura_rare_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rare unlocks authenticated read" ON public.oculto_aura_rare_unlocks;
CREATE POLICY "rare unlocks authenticated read" ON public.oculto_aura_rare_unlocks
  FOR SELECT TO authenticated USING (true);

DROP FUNCTION IF EXISTS public.aura_achievement_claim_v2(text, integer, integer, integer, text);
DROP FUNCTION IF EXISTS public.aura_achievements_metrics();

CREATE OR REPLACE FUNCTION public.aura_achievements_metrics()
RETURNS TABLE(
  total_xp integer,
  current_level integer,
  current_streak integer,
  visit_days integer,
  quests_claimed integer,
  super_dm_quests integer,
  likes_quests integer,
  follows_quests integer,
  saves_quests integer,
  comments_quests integer,
  polls_quests integer,
  gifts_quests integer,
  communities_joined integer,
  community_topics integer,
  play_publishes integer,
  play_views_total integer,
  play_movies_completed integer,
  chat_messages integer,
  rooms_joined integer,
  rooms_messages integer,
  matches_total integer,
  engagement_rank integer,
  rank_top100_flag integer,
  rank_top10_flag integer,
  play_listen_streak integer,
  play_visit_streak_consec integer,
  play_visit_days integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_ids uuid[];
  v_profile_xp integer := 0;
  v_profile_streak integer := 0;
  v_level_streak integer := 0;
  v_table_streak integer := 0;
  v_likes integer := 0;
  v_follows_a integer := 0;
  v_follows_b integer := 0;
  v_chat_gifts integer := 0;
  v_aura_gifts integer := 0;
  v_super_dms_a integer := 0;
  v_super_dms_b integer := 0;
  v_rank integer := 0;
  v_play record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  v_pid := public.aura_current_profile_id();
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[v_uid, v_pid]) AS x WHERE x IS NOT NULL) INTO v_ids;

  SELECT COALESCE(MAX(p.aura_xp), 0), COALESCE(MAX(p.aura_streak_days), 0)
    INTO v_profile_xp, v_profile_streak
    FROM public.profiles p
   WHERE p.user_id = v_uid OR p.id = ANY(v_ids);

  BEGIN SELECT COALESCE(MAX(streak_days), 0) INTO v_level_streak FROM public.user_levels WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_level_streak := 0; END;
  BEGIN SELECT COALESCE(MAX(current_streak), 0) INTO v_table_streak FROM public.oculto_aura_streaks WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_table_streak := 0; END;

  BEGIN
    SELECT COALESCE(COUNT(DISTINCT d), 0)::int INTO visit_days
    FROM (
      SELECT created_at::date AS d FROM public.xp_transactions WHERE user_id = ANY(v_ids)
      UNION
      SELECT created_at::date AS d FROM public.engagement_events WHERE user_id = ANY(v_ids)
    ) days;
  EXCEPTION WHEN OTHERS THEN visit_days := 0; END;

  BEGIN SELECT COUNT(*)::int INTO v_likes FROM public.post_likes WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_likes := 0; END;
  BEGIN v_likes := v_likes + COALESCE((SELECT COUNT(*)::int FROM public.profile_likes WHERE liker_id = ANY(v_ids)), 0); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT COUNT(*)::int INTO v_follows_a FROM public.followers WHERE follower_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_follows_a := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_follows_b FROM public.follows WHERE follower_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_follows_b := 0; END;
  follows_quests := GREATEST(v_follows_a, v_follows_b);
  BEGIN SELECT COUNT(*)::int INTO saves_quests FROM public.saved_posts WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN saves_quests := 0; END;
  BEGIN SELECT COUNT(*)::int INTO comments_quests FROM public.post_comments WHERE user_id = ANY(v_ids) AND COALESCE(is_hidden, false) = false; EXCEPTION WHEN OTHERS THEN comments_quests := 0; END;
  BEGIN SELECT COUNT(*)::int INTO polls_quests FROM public.poll_votes WHERE voter_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN polls_quests := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_chat_gifts FROM public.gift_history WHERE sender_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_chat_gifts := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_aura_gifts FROM public.oculto_aura_xp_gifts WHERE sender_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_aura_gifts := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_super_dms_a FROM public.priority_message_transactions WHERE sender_profile_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_super_dms_a := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_super_dms_b FROM public.messages WHERE sender_id = ANY(v_ids) AND COALESCE(is_priority, false) = true; EXCEPTION WHEN OTHERS THEN v_super_dms_b := 0; END;
  BEGIN SELECT COUNT(*)::int INTO communities_joined FROM public.oculto_community_members WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN communities_joined := 0; END;
  BEGIN SELECT COUNT(*)::int INTO community_topics FROM public.oculto_community_topics WHERE author_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN community_topics := 0; END;
  BEGIN SELECT COUNT(*)::int INTO play_publishes FROM public.oculto_play_items WHERE author_id = ANY(v_ids) AND COALESCE(is_published, false) = true; EXCEPTION WHEN OTHERS THEN play_publishes := 0; END;
  BEGIN SELECT COALESCE(SUM(view_count), 0)::int INTO play_views_total FROM public.oculto_play_items WHERE author_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN play_views_total := 0; END;
  BEGIN SELECT COUNT(*)::int INTO play_movies_completed FROM public.oculto_play_movie_completions WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN play_movies_completed := 0; END;
  BEGIN SELECT COUNT(*)::int INTO chat_messages FROM public.messages WHERE sender_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN chat_messages := 0; END;
  BEGIN SELECT COUNT(DISTINCT room_slug)::int INTO rooms_joined FROM public.oculto_aura_room_presence WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN rooms_joined := 0; END;
  BEGIN SELECT COUNT(*)::int INTO rooms_messages FROM public.oculto_aura_room_messages WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN rooms_messages := 0; END;

  BEGIN
    SELECT COUNT(*)::int INTO matches_total FROM (
      SELECT 1 FROM public.perfect_pairs WHERE user1_id = ANY(v_ids) OR user2_id = ANY(v_ids)
      UNION ALL SELECT 1 FROM public.lucky_matches WHERE user1_id = ANY(v_ids) OR user2_id = ANY(v_ids)
      UNION ALL SELECT 1 FROM public.looking_now_matches WHERE user1_id = ANY(v_ids) OR user2_id = ANY(v_ids)
    ) m;
  EXCEPTION WHEN OTHERS THEN matches_total := 0; END;

  BEGIN SELECT COALESCE(r.rank, 0)::int INTO v_rank FROM public.aura_my_rank() AS r LIMIT 1; EXCEPTION WHEN OTHERS THEN v_rank := 0; END;
  BEGIN SELECT * INTO v_play FROM public.oculto_play_user_metrics() LIMIT 1; EXCEPTION WHEN OTHERS THEN v_play := NULL; END;

  total_xp := GREATEST(0, v_profile_xp);
  current_level := public.aura_level_from_xp(total_xp);
  current_streak := GREATEST(v_profile_streak, v_level_streak, v_table_streak);
  visit_days := GREATEST(current_streak, COALESCE(visit_days, 0));
  likes_quests := v_likes;
  gifts_quests := v_chat_gifts + v_aura_gifts;
  super_dm_quests := GREATEST(v_super_dms_a, v_super_dms_b);
  quests_claimed := likes_quests + follows_quests + saves_quests + comments_quests + polls_quests + gifts_quests + super_dm_quests;
  engagement_rank := v_rank;
  rank_top100_flag := CASE WHEN v_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END;
  rank_top10_flag := CASE WHEN v_rank BETWEEN 1 AND 10 THEN 1 ELSE 0 END;
  play_listen_streak := COALESCE(v_play.listen_streak, 0);
  play_visit_streak_consec := COALESCE(v_play.visit_streak_consec, 0);
  play_visit_days := COALESCE(v_play.visit_days_total, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_achievement_claim_v2(
  p_achievement_id text,
  p_xp_reward integer,
  p_current integer,
  p_required integer,
  p_title text DEFAULT NULL
)
RETURNS TABLE(awarded boolean, xp_total integer, level integer, eligible boolean, already_claimed boolean, rare boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid := public.aura_current_profile_id();
  v_metrics record;
  v_play record;
  v_current int := 0;
  v_safe_xp int;
  v_inserted int := 0;
  v_reward record;
  v_profile_xp int := 0;
  v_profile_level int := 1;
  v_profile_streak int := 0;
  v_rank int := 0;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  SELECT * INTO v_reward FROM public.oculto_aura_achievement_rewards WHERE achievement_id = p_achievement_id;
  IF v_reward IS NULL THEN RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id; END IF;
  v_safe_xp := LEAST(10000, GREATEST(100, v_reward.xp_reward));

  SELECT COALESCE(p.aura_xp,0), public.aura_level_from_xp(COALESCE(p.aura_xp,0)), COALESCE(p.aura_streak_days,0)
    INTO v_profile_xp, v_profile_level, v_profile_streak
    FROM public.profiles p WHERE p.id = v_pid FOR UPDATE;

  SELECT * INTO v_metrics FROM public.aura_achievements_metrics() LIMIT 1;
  BEGIN SELECT COALESCE(r.rank,0)::int INTO v_rank FROM public.aura_my_rank() AS r LIMIT 1; EXCEPTION WHEN OTHERS THEN v_rank := 0; END;
  BEGIN SELECT * INTO v_play FROM public.oculto_play_user_metrics() LIMIT 1; EXCEPTION WHEN OTHERS THEN v_play := NULL; END;

  v_current := CASE p_achievement_id
    WHEN 'lvl_5' THEN v_profile_level WHEN 'lvl_10' THEN v_profile_level WHEN 'lvl_20' THEN v_profile_level WHEN 'lvl_50' THEN v_profile_level
    WHEN 'streak_3' THEN GREATEST(v_metrics.current_streak, v_profile_streak) WHEN 'streak_7' THEN GREATEST(v_metrics.current_streak, v_profile_streak) WHEN 'streak_30' THEN GREATEST(v_metrics.current_streak, v_profile_streak)
    WHEN 'visits_15' THEN v_metrics.visit_days WHEN 'visits_30' THEN v_metrics.visit_days
    WHEN 'quests_10' THEN v_metrics.quests_claimed WHEN 'quests_50' THEN v_metrics.quests_claimed WHEN 'quests_200' THEN v_metrics.quests_claimed
    WHEN 'sdm_5' THEN v_metrics.super_dm_quests
    WHEN 'xp_1000' THEN v_profile_xp WHEN 'xp_10000' THEN v_profile_xp
    WHEN 'likes_5' THEN v_metrics.likes_quests WHEN 'likes_25' THEN v_metrics.likes_quests
    WHEN 'follows_5' THEN v_metrics.follows_quests WHEN 'follows_25' THEN v_metrics.follows_quests
    WHEN 'saves_5' THEN v_metrics.saves_quests WHEN 'saves_25' THEN v_metrics.saves_quests
    WHEN 'comments_5' THEN v_metrics.comments_quests WHEN 'comments_25' THEN v_metrics.comments_quests
    WHEN 'polls_5' THEN v_metrics.polls_quests
    WHEN 'gifts_3' THEN v_metrics.gifts_quests WHEN 'gifts_10' THEN v_metrics.gifts_quests
    WHEN 'comm_join_1' THEN v_metrics.communities_joined WHEN 'comm_join_5' THEN v_metrics.communities_joined
    WHEN 'comm_topics_3' THEN v_metrics.community_topics WHEN 'comm_topics_25' THEN v_metrics.community_topics
    WHEN 'play_pub_1' THEN v_metrics.play_publishes WHEN 'play_pub_10' THEN v_metrics.play_publishes WHEN 'play_views_1k' THEN v_metrics.play_views_total
    WHEN 'play_movie_1' THEN v_metrics.play_movies_completed
    WHEN 'play_movie_5' THEN v_metrics.play_movies_completed
    WHEN 'play_movie_15' THEN v_metrics.play_movies_completed
    WHEN 'chat_50' THEN v_metrics.chat_messages WHEN 'chat_500' THEN v_metrics.chat_messages
    WHEN 'rooms_join_3' THEN v_metrics.rooms_joined WHEN 'rooms_msgs_25' THEN v_metrics.rooms_messages
    WHEN 'match_1' THEN v_metrics.matches_total WHEN 'match_10' THEN v_metrics.matches_total WHEN 'match_50' THEN v_metrics.matches_total
    WHEN 'rank_top100' THEN CASE WHEN v_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END
    WHEN 'rank_top10' THEN CASE WHEN v_rank BETWEEN 1 AND 10 THEN 1 ELSE 0 END
    WHEN 'play_listen_streak_10' THEN COALESCE(v_play.listen_streak, 0)
    WHEN 'play_visit_streak_10' THEN COALESCE(v_play.visit_streak_consec, 0)
    WHEN 'play_visit_30' THEN COALESCE(v_play.visit_days_total, 0)
    ELSE 0
  END;

  eligible := COALESCE(v_current, 0) >= v_reward.required;
  rare := v_safe_xp >= 10000;
  SELECT EXISTS(SELECT 1 FROM public.oculto_aura_achievement_claims c WHERE c.user_id = v_uid AND c.achievement_id = p_achievement_id) INTO already_claimed;
  xp_total := v_profile_xp;
  level := v_profile_level;

  IF already_claimed OR NOT eligible THEN awarded := false; RETURN NEXT; RETURN; END IF;

  INSERT INTO public.oculto_aura_achievement_claims(user_id, profile_id, achievement_id, xp_awarded, applied_to_balance)
  VALUES (v_uid, v_pid, p_achievement_id, v_safe_xp, true)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN already_claimed := true; awarded := false; RETURN NEXT; RETURN; END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_safe_xp)
   WHERE id = v_pid
   RETURNING aura_xp, aura_level INTO xp_total, level;

  v_title := COALESCE(NULLIF(trim(p_title),''), 'Conquista desbloqueada');
  BEGIN
    INSERT INTO public.notifications(user_id, type, title, body, data)
    VALUES (v_uid,'system', CASE WHEN rare THEN 'Conquista RARA desbloqueada' ELSE 'Conquista desbloqueada' END,
      v_title || ' · +' || v_safe_xp::text || ' XP',
      jsonb_build_object('kind','aura_achievement','achievement_id',p_achievement_id,'xp',v_safe_xp,'rare',rare));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF rare THEN
    INSERT INTO public.oculto_aura_rare_unlocks(user_id, profile_id, achievement_id, achievement_title, xp_awarded)
    VALUES (v_uid, v_pid, p_achievement_id, v_title, v_safe_xp)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  awarded := true; already_claimed := false; RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim_v2(text, integer, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_aura_rare_unlock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp int := 0;
  v_level int := 1;
BEGIN
  SELECT COALESCE(aura_xp,0), public.aura_level_from_xp(COALESCE(aura_xp,0))
    INTO v_xp, v_level
    FROM public.profiles
   WHERE id = NEW.profile_id OR user_id = NEW.user_id
   ORDER BY CASE WHEN id = NEW.profile_id THEN 0 ELSE 1 END
   LIMIT 1;
  IF NEW.achievement_id = 'xp_10000' AND v_xp < 10000 THEN RAISE EXCEPTION 'invalid rare unlock: xp_10000 requires 10000 real XP'; END IF;
  IF NEW.achievement_id = 'lvl_50' AND v_level < 50 THEN RAISE EXCEPTION 'invalid rare unlock: lvl_50 requires real level 50'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_aura_rare_unlock_guard ON public.oculto_aura_rare_unlocks;
CREATE TRIGGER trg_oculto_aura_rare_unlock_guard
BEFORE INSERT OR UPDATE ON public.oculto_aura_rare_unlocks
FOR EACH ROW EXECUTE FUNCTION public.oculto_aura_rare_unlock_guard();

-- Helper sem tabela temporária/intermediária: calcula os alvos em memória a cada uso.
-- Evita erro 42P01 quando o SQL Editor externo particiona/reescreve a execução.
CREATE OR REPLACE FUNCTION public.oculto_aura_fix_targets()
RETURNS TABLE(
  profile_id uuid,
  user_id uuid,
  username text,
  created_at timestamptz,
  aura_xp int,
  received_xp int,
  high_xp int,
  has_xp10000_claim boolean,
  real_xp int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fix$
DECLARE
  v_has_gifts boolean := to_regclass('public.oculto_aura_xp_gifts') IS NOT NULL;
  v_has_claims boolean := to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL;
BEGIN
  RETURN QUERY EXECUTE format($q$
    WITH gift_received AS (
      %s
    ), high_claims AS (
      %s
    ), candidates AS (
      SELECT p.id AS profile_id, p.user_id, p.username, p.created_at,
             COALESCE(p.aura_xp,0)::int AS aura_xp,
             COALESCE(g.received_xp,0)::int AS received_xp,
             COALESCE(h.high_xp,0)::int AS high_xp,
             %s AS has_xp10000_claim
        FROM public.profiles p
        LEFT JOIN gift_received g ON g.profile_id = p.id
        LEFT JOIN high_claims h ON h.profile_id = p.id OR h.user_id = p.user_id
       WHERE lower(COALESCE(p.username,'')) IN ('jeferson','jefersom','sniltoncesar129_gmail_com')
          OR (
            p.created_at >= now() - interval '7 days'
            AND (COALESCE(p.aura_xp,0) >= 10000 OR COALESCE(p.aura_level,1) >= 25)
          )
    )
    SELECT profile_id, user_id, username, created_at, aura_xp, received_xp, high_xp, has_xp10000_claim,
           CASE
             WHEN lower(COALESCE(username,'')) IN ('jeferson','jefersom') THEN 100
             ELSE GREATEST(received_xp, aura_xp - high_xp, 0)
           END::int AS real_xp
      FROM candidates
  $q$,
    CASE WHEN v_has_gifts
      THEN 'SELECT receiver_id AS profile_id, COALESCE(SUM(amount),0)::int AS received_xp FROM public.oculto_aura_xp_gifts GROUP BY receiver_id'
      ELSE 'SELECT NULL::uuid AS profile_id, 0::int AS received_xp WHERE false'
    END,
    CASE WHEN v_has_claims
      THEN $h$SELECT c.profile_id, c.user_id, COALESCE(SUM(c.xp_awarded),0)::int AS high_xp
                FROM public.oculto_aura_achievement_claims c
               WHERE c.xp_awarded >= 10000 OR c.achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10')
               GROUP BY c.profile_id, c.user_id$h$
      ELSE 'SELECT NULL::uuid AS profile_id, NULL::uuid AS user_id, 0::int AS high_xp WHERE false'
    END,
    CASE WHEN v_has_claims
      THEN $e$EXISTS (SELECT 1 FROM public.oculto_aura_achievement_claims c WHERE (c.profile_id = p.id OR c.user_id = p.user_id) AND c.achievement_id = 'xp_10000')$e$
      ELSE 'false'
    END
  );
END;
$fix$;

-- Limpa claims fraudulentos cujos requisitos reais não são atendidos.
DO $cleanup_claims$
BEGIN
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_achievement_claims c
    USING public.oculto_aura_fix_targets() t, public.oculto_aura_achievement_rewards r
    WHERE (c.profile_id = t.profile_id OR c.user_id = t.user_id)
      AND r.achievement_id = c.achievement_id
      AND r.metric IN ('total_xp','current_level')
      AND (
        (r.metric = 'total_xp' AND t.real_xp < r.required)
        OR (r.metric = 'current_level' AND public.aura_level_from_xp(t.real_xp) < r.required)
      );
  END IF;
END $cleanup_claims$;

-- Limpa rare unlocks impossíveis.
DO $cleanup_rare$
BEGIN
  IF to_regclass('public.oculto_aura_rare_unlocks') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_rare_unlocks ru
    USING public.oculto_aura_fix_targets() t
    WHERE (ru.profile_id = t.profile_id OR ru.user_id = t.user_id)
      AND (ru.achievement_id IN ('xp_10000','lvl_50') OR ru.xp_awarded >= 10000);
  END IF;
END $cleanup_rare$;

-- Limpa notificações de conquistas fraudulentas.
DO $cleanup_notifs$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications n
    USING public.oculto_aura_fix_targets() t
    WHERE n.user_id = t.user_id
      AND n.data->>'kind' = 'aura_achievement'
      AND (
        n.data->>'achievement_id' IN ('xp_10000','lvl_50')
        OR COALESCE((n.data->>'xp')::int,0) >= 10000
      );
  END IF;
END $cleanup_notifs$;

-- Reset de XP real (o trigger recalcula aura_level automaticamente).
UPDATE public.profiles p
   SET aura_xp = t.real_xp
  FROM public.oculto_aura_fix_targets() t
 WHERE p.id = t.profile_id;

-- Garante coerência global de aura_level (toca apenas linhas inconsistentes).
UPDATE public.profiles
   SET aura_xp = aura_xp
 WHERE COALESCE(aura_level,1) <> public.aura_level_from_xp(COALESCE(aura_xp,0));

-- Sincroniza tabela legada user_levels se existir.
DO $sync_levels$
BEGIN
  IF to_regclass('public.user_levels') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.user_levels ul
         SET total_xp = p.aura_xp,
             current_level = public.aura_level_from_xp(p.aura_xp),
             updated_at = now()
        FROM public.profiles p
       WHERE (ul.user_id = p.id OR ul.user_id = p.user_id)
          AND (p.id IN (SELECT profile_id FROM public.oculto_aura_fix_targets())
              OR COALESCE(ul.current_level,1) <> public.aura_level_from_xp(COALESCE(p.aura_xp,0)))
    $q$;
  END IF;
END $sync_levels$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificação pós-execução:
-- SELECT username, aura_xp, aura_level, public.aura_level_from_xp(aura_xp) AS nivel_calculado
--   FROM public.profiles
--  WHERE lower(username) IN ('jeferson','jefersom','sniltoncesar129_gmail_com')
--     OR (created_at >= now() - interval '7 days' AND (aura_xp >= 10000 OR aura_level >= 25))
--  ORDER BY created_at DESC;