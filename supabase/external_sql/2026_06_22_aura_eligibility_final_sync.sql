-- =====================================================================
-- Aura Achievements — correção final de elegibilidade/resgate
-- External Supabase only. Idempotente.
-- Cole e execute INTEIRO no SQL Editor do Supabase EXTERNO.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Base mínima de XP/perfil e claims
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aura_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS aura_streak_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aura_last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(COALESCE(p_xp, 0), 0)::numeric / 50))::int + 1);
$$;

GRANT EXECUTE ON FUNCTION public.aura_level_from_xp(integer) TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  profile_id         uuid NULL,
  achievement_id     text NOT NULL,
  xp_awarded         integer NOT NULL DEFAULT 0,
  claimed_at         timestamptz NOT NULL DEFAULT now(),
  applied_to_balance boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT, INSERT ON public.oculto_aura_achievement_claims TO authenticated;
GRANT ALL ON public.oculto_aura_achievement_claims TO service_role;

ALTER TABLE public.oculto_aura_achievement_claims ADD COLUMN IF NOT EXISTS profile_id uuid NULL;
ALTER TABLE public.oculto_aura_achievement_claims ADD COLUMN IF NOT EXISTS applied_to_balance boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_oculto_aura_achievement_claims_user
  ON public.oculto_aura_achievement_claims(user_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_aura_achievement_claims_profile
  ON public.oculto_aura_achievement_claims(profile_id, claimed_at DESC);

ALTER TABLE public.oculto_aura_achievement_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own claims read" ON public.oculto_aura_achievement_claims;
CREATE POLICY "own claims read"
  ON public.oculto_aura_achievement_claims
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own claims write" ON public.oculto_aura_achievement_claims;
CREATE POLICY "own claims write"
  ON public.oculto_aura_achievement_claims
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.oculto_aura_rare_unlocks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  profile_id          uuid NULL,
  achievement_id      text NOT NULL,
  achievement_title   text NULL,
  xp_awarded          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT ON public.oculto_aura_rare_unlocks TO authenticated, anon;
GRANT ALL ON public.oculto_aura_rare_unlocks TO service_role;

ALTER TABLE public.oculto_aura_rare_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rare unlocks public read" ON public.oculto_aura_rare_unlocks;
CREATE POLICY "rare unlocks public read"
  ON public.oculto_aura_rare_unlocks
  FOR SELECT TO authenticated, anon
  USING (true);

-- ---------------------------------------------------------------------
-- Resolução canônica auth.uid() -> profiles.id
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_resolve_profile_id(p_any_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_any_id IS NULL THEN RETURN NULL; END IF;

  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN RETURN v_profile_id; END IF;

  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;

  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.aura_resolve_profile_id(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.aura_resolve_profile_id(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_current_profile_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aura_claim_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
BEGIN
  IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'aura_claim_user_required'; END IF;
  v_pid := public.aura_resolve_profile_id(NEW.user_id);
  IF v_pid IS NOT NULL THEN NEW.profile_id := v_pid; END IF;
  IF NEW.xp_awarded IS NULL THEN NEW.xp_awarded := 0; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aura_claim_scope_guard ON public.oculto_aura_achievement_claims;
CREATE TRIGGER trg_aura_claim_scope_guard
BEFORE INSERT OR UPDATE ON public.oculto_aura_achievement_claims
FOR EACH ROW EXECUTE FUNCTION public.aura_claim_scope_guard();

DROP TRIGGER IF EXISTS trg_aura_rare_scope_guard ON public.oculto_aura_rare_unlocks;
CREATE TRIGGER trg_aura_rare_scope_guard
BEFORE INSERT OR UPDATE ON public.oculto_aura_rare_unlocks
FOR EACH ROW EXECUTE FUNCTION public.aura_claim_scope_guard();

-- ---------------------------------------------------------------------
-- Oculto Play: visitas e progresso para as novas conquistas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_play_visits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, visit_date)
);

GRANT SELECT, INSERT ON public.oculto_play_visits TO authenticated;
GRANT ALL ON public.oculto_play_visits TO service_role;

CREATE INDEX IF NOT EXISTS idx_oculto_play_visits_user_date
  ON public.oculto_play_visits (user_id, visit_date DESC);

ALTER TABLE public.oculto_play_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opv_select_own ON public.oculto_play_visits;
CREATE POLICY opv_select_own ON public.oculto_play_visits
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS opv_insert_own ON public.oculto_play_visits;
CREATE POLICY opv_insert_own ON public.oculto_play_visits
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.oculto_play_watch_progress (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  item_id           uuid NOT NULL,
  position_seconds  integer NOT NULL DEFAULT 0,
  duration_seconds  integer NOT NULL DEFAULT 0,
  watched_pct       numeric(5,2) NOT NULL DEFAULT 0,
  completed         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.oculto_play_watch_progress TO authenticated;
GRANT ALL ON public.oculto_play_watch_progress TO service_role;

ALTER TABLE public.oculto_play_watch_progress ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;
ALTER TABLE public.oculto_play_watch_progress ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.oculto_play_watch_progress ADD COLUMN IF NOT EXISTS watched_pct numeric(5,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_play_watch_progress_user
  ON public.oculto_play_watch_progress (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_watch_progress_uitem
  ON public.oculto_play_watch_progress (user_id, item_id, created_at DESC);

ALTER TABLE public.oculto_play_watch_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pwp_select_own ON public.oculto_play_watch_progress;
CREATE POLICY pwp_select_own ON public.oculto_play_watch_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS pwp_insert_own ON public.oculto_play_watch_progress;
CREATE POLICY pwp_insert_own ON public.oculto_play_watch_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.oculto_play_register_visit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.oculto_play_visits(user_id, visit_date)
  VALUES (v_uid, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ON CONFLICT (user_id, visit_date) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_register_visit() TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_log_progress(
  p_item_id uuid,
  p_position_seconds integer,
  p_duration_seconds integer,
  p_completed boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pct numeric(5,2);
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_item_id IS NULL THEN RAISE EXCEPTION 'item_id_required'; END IF;

  v_pct := CASE
    WHEN COALESCE(p_duration_seconds, 0) > 0
      THEN LEAST(100, GREATEST(0, (GREATEST(0, COALESCE(p_position_seconds, 0))::numeric / GREATEST(1, p_duration_seconds)::numeric) * 100))
    ELSE 0
  END;

  INSERT INTO public.oculto_play_watch_progress(
    user_id, item_id, position_seconds, duration_seconds, watched_pct, completed
  ) VALUES (
    v_uid, p_item_id,
    GREATEST(0, COALESCE(p_position_seconds, 0)),
    GREATEST(0, COALESCE(p_duration_seconds, 0)),
    v_pct,
    COALESCE(p_completed, false) OR v_pct >= 95
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_log_progress(uuid, integer, integer, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.oculto_play_user_metrics();
CREATE OR REPLACE FUNCTION public.oculto_play_user_metrics()
RETURNS TABLE(
  listen_streak integer,
  visit_streak_consec integer,
  visit_days_total integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_last_end timestamptz := NULL;
  v_cur integer := 0;
  v_max integer := 0;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_prev date := NULL;
  v_run integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    listen_streak := 0; visit_streak_consec := 0; visit_days_total := 0;
    RETURN NEXT; RETURN;
  END IF;

  FOR r IN
    SELECT created_at, COALESCE(duration_seconds, 0) AS dur
      FROM public.oculto_play_watch_progress
     WHERE user_id = v_uid AND completed = true
     ORDER BY created_at ASC
  LOOP
    IF v_last_end IS NULL OR r.created_at - v_last_end <= interval '5 minutes' THEN
      v_cur := v_cur + 1;
    ELSE
      v_cur := 1;
    END IF;
    v_max := GREATEST(v_max, v_cur);
    v_last_end := r.created_at + (GREATEST(0, r.dur) || ' seconds')::interval;
  END LOOP;

  SELECT COUNT(*)::int INTO visit_days_total
    FROM public.oculto_play_visits
   WHERE user_id = v_uid;

  visit_streak_consec := 0;
  FOR r IN
    SELECT visit_date FROM public.oculto_play_visits
     WHERE user_id = v_uid
     ORDER BY visit_date DESC
  LOOP
    IF v_prev IS NULL THEN
      IF r.visit_date = v_today OR r.visit_date = v_today - 1 THEN
        v_run := 1;
        visit_streak_consec := 1;
      ELSE
        EXIT;
      END IF;
    ELSE
      IF v_prev - r.visit_date = 1 THEN
        v_run := v_run + 1;
        visit_streak_consec := GREATEST(visit_streak_consec, v_run);
      ELSE
        EXIT;
      END IF;
    END IF;
    v_prev := r.visit_date;
  END LOOP;

  listen_streak := v_max;
  visit_days_total := COALESCE(visit_days_total, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_user_metrics() TO authenticated;

-- ---------------------------------------------------------------------
-- Recria métricas com todos os IDs reais possíveis do usuário
-- ---------------------------------------------------------------------
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
  v_profile_level integer := 1;
  v_profile_streak integer := 0;
  v_level_xp integer := 0;
  v_level_level integer := 1;
  v_level_streak integer := 0;
  v_table_streak integer := 0;
  v_ledger_xp integer := 0;
  v_claim_xp integer := 0;
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

  SELECT COALESCE(MAX(p.aura_xp), 0), COALESCE(MAX(p.aura_level), 1), COALESCE(MAX(p.aura_streak_days), 0)
    INTO v_profile_xp, v_profile_level, v_profile_streak
    FROM public.profiles p
   WHERE p.user_id = v_uid OR p.id = ANY(v_ids);

  BEGIN
    SELECT COALESCE(MAX(total_xp), 0), COALESCE(MAX(current_level), 1), COALESCE(MAX(streak_days), 0)
      INTO v_level_xp, v_level_level, v_level_streak
      FROM public.user_levels WHERE user_id = ANY(v_ids);
  EXCEPTION WHEN OTHERS THEN v_level_xp := 0; v_level_level := 1; v_level_streak := 0; END;

  BEGIN SELECT COALESCE(MAX(current_streak), 0) INTO v_table_streak FROM public.oculto_aura_streaks WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_table_streak := 0; END;
  BEGIN SELECT COALESCE(SUM(GREATEST(amount, 0)), 0)::int INTO v_ledger_xp FROM public.xp_transactions WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_ledger_xp := 0; END;
  BEGIN SELECT COALESCE(SUM(GREATEST(xp_awarded, 0)), 0)::int INTO v_claim_xp FROM public.oculto_aura_achievement_claims WHERE user_id = v_uid OR user_id = v_pid OR profile_id = v_pid; EXCEPTION WHEN OTHERS THEN v_claim_xp := 0; END;

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

  total_xp := GREATEST(v_profile_xp, v_level_xp, v_ledger_xp, v_claim_xp);
  current_level := GREATEST(v_profile_level, v_level_level, public.aura_level_from_xp(total_xp));
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
RETURNS TABLE(
  awarded boolean,
  xp_total integer,
  level integer,
  eligible boolean,
  already_claimed boolean,
  rare boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid := public.aura_current_profile_id();
  v_metrics record;
  v_metric_val integer := 0;
  v_required integer := 0;
  v_current integer := 0;
  v_safe_xp integer;
  v_inserted integer := 0;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p_achievement_id IS NULL OR length(trim(p_achievement_id)) = 0 THEN RAISE EXCEPTION 'achievement id required'; END IF;
  IF p_xp_reward IS NULL OR p_xp_reward <= 0 THEN RAISE EXCEPTION 'xp reward must be positive'; END IF;

  SELECT * INTO v_metrics FROM public.aura_achievements_metrics() LIMIT 1;

  CASE p_achievement_id
    WHEN 'lvl_5' THEN v_metric_val := v_metrics.current_level; v_required := 5;
    WHEN 'lvl_10' THEN v_metric_val := v_metrics.current_level; v_required := 10;
    WHEN 'lvl_20' THEN v_metric_val := v_metrics.current_level; v_required := 20;
    WHEN 'lvl_50' THEN v_metric_val := v_metrics.current_level; v_required := 50;
    WHEN 'streak_3' THEN v_metric_val := v_metrics.current_streak; v_required := 3;
    WHEN 'streak_7' THEN v_metric_val := v_metrics.current_streak; v_required := 7;
    WHEN 'streak_30' THEN v_metric_val := v_metrics.current_streak; v_required := 30;
    WHEN 'visits_15' THEN v_metric_val := v_metrics.visit_days; v_required := 15;
    WHEN 'visits_30' THEN v_metric_val := v_metrics.visit_days; v_required := 30;
    WHEN 'quests_10' THEN v_metric_val := v_metrics.quests_claimed; v_required := 10;
    WHEN 'quests_50' THEN v_metric_val := v_metrics.quests_claimed; v_required := 50;
    WHEN 'quests_200' THEN v_metric_val := v_metrics.quests_claimed; v_required := 200;
    WHEN 'sdm_5' THEN v_metric_val := v_metrics.super_dm_quests; v_required := 5;
    WHEN 'xp_1000' THEN v_metric_val := v_metrics.total_xp; v_required := 1000;
    WHEN 'xp_10000' THEN v_metric_val := v_metrics.total_xp; v_required := 10000;
    WHEN 'likes_5' THEN v_metric_val := v_metrics.likes_quests; v_required := 5;
    WHEN 'likes_25' THEN v_metric_val := v_metrics.likes_quests; v_required := 25;
    WHEN 'follows_5' THEN v_metric_val := v_metrics.follows_quests; v_required := 5;
    WHEN 'follows_25' THEN v_metric_val := v_metrics.follows_quests; v_required := 25;
    WHEN 'saves_5' THEN v_metric_val := v_metrics.saves_quests; v_required := 5;
    WHEN 'saves_25' THEN v_metric_val := v_metrics.saves_quests; v_required := 25;
    WHEN 'comments_5' THEN v_metric_val := v_metrics.comments_quests; v_required := 5;
    WHEN 'comments_25' THEN v_metric_val := v_metrics.comments_quests; v_required := 25;
    WHEN 'polls_5' THEN v_metric_val := v_metrics.polls_quests; v_required := 5;
    WHEN 'gifts_3' THEN v_metric_val := v_metrics.gifts_quests; v_required := 3;
    WHEN 'gifts_10' THEN v_metric_val := v_metrics.gifts_quests; v_required := 10;
    WHEN 'comm_join_1' THEN v_metric_val := v_metrics.communities_joined; v_required := 1;
    WHEN 'comm_join_5' THEN v_metric_val := v_metrics.communities_joined; v_required := 5;
    WHEN 'comm_topics_3' THEN v_metric_val := v_metrics.community_topics; v_required := 3;
    WHEN 'comm_topics_25' THEN v_metric_val := v_metrics.community_topics; v_required := 25;
    WHEN 'play_pub_1' THEN v_metric_val := v_metrics.play_publishes; v_required := 1;
    WHEN 'play_pub_10' THEN v_metric_val := v_metrics.play_publishes; v_required := 10;
    WHEN 'play_views_1k' THEN v_metric_val := v_metrics.play_views_total; v_required := 1000;
    WHEN 'play_visit_streak_10' THEN v_metric_val := v_metrics.play_visit_streak_consec; v_required := 10;
    WHEN 'play_visit_30' THEN v_metric_val := v_metrics.play_visit_days; v_required := 30;
    WHEN 'play_listen_streak_10' THEN v_metric_val := v_metrics.play_listen_streak; v_required := 10;
    WHEN 'chat_50' THEN v_metric_val := v_metrics.chat_messages; v_required := 50;
    WHEN 'chat_500' THEN v_metric_val := v_metrics.chat_messages; v_required := 500;
    WHEN 'rooms_join_3' THEN v_metric_val := v_metrics.rooms_joined; v_required := 3;
    WHEN 'rooms_msgs_25' THEN v_metric_val := v_metrics.rooms_messages; v_required := 25;
    WHEN 'match_1' THEN v_metric_val := v_metrics.matches_total; v_required := 1;
    WHEN 'match_10' THEN v_metric_val := v_metrics.matches_total; v_required := 10;
    WHEN 'match_50' THEN v_metric_val := v_metrics.matches_total; v_required := 50;
    WHEN 'rank_top100' THEN v_metric_val := v_metrics.rank_top100_flag; v_required := 1;
    WHEN 'rank_top10' THEN v_metric_val := v_metrics.rank_top10_flag; v_required := 1;
    ELSE RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END CASE;

  v_current := GREATEST(COALESCE(v_metric_val, 0), COALESCE(p_current, 0));
  eligible := v_required > 0 AND v_current >= v_required AND COALESCE(p_required, v_required) = v_required;
  rare := p_xp_reward >= 10000;

  SELECT EXISTS(
    SELECT 1 FROM public.oculto_aura_achievement_claims c
     WHERE c.achievement_id = p_achievement_id
       AND (c.user_id = v_uid OR c.user_id = v_pid OR c.profile_id = v_pid)
  ) INTO already_claimed;

  SELECT COALESCE(aura_xp, 0), COALESCE(aura_level, 1)
    INTO xp_total, level
    FROM public.profiles
   WHERE id = v_pid
   FOR UPDATE;

  IF already_claimed OR NOT eligible THEN
    awarded := false;
    RETURN NEXT; RETURN;
  END IF;

  v_safe_xp := LEAST(10000, GREATEST(500, p_xp_reward));

  INSERT INTO public.oculto_aura_achievement_claims(user_id, profile_id, achievement_id, xp_awarded, applied_to_balance)
  VALUES (v_uid, v_pid, p_achievement_id, v_safe_xp, true)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    already_claimed := true;
    awarded := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp))
   WHERE id = v_pid
   RETURNING aura_xp, aura_level INTO xp_total, level;

  BEGIN
    INSERT INTO public.xp_transactions(user_id, amount, action_type, description, reference_id)
    VALUES (v_uid, v_safe_xp, 'aura_achievement', COALESCE(NULLIF(trim(p_title), ''), p_achievement_id), 'aura_achievement:' || p_achievement_id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_title := COALESCE(NULLIF(trim(p_title), ''), 'Conquista desbloqueada');
  BEGIN
    INSERT INTO public.notifications(user_id, type, title, body, data)
    VALUES (
      v_uid,
      'system',
      CASE WHEN rare THEN 'Conquista RARA desbloqueada' ELSE 'Conquista desbloqueada' END,
      v_title || ' · +' || v_safe_xp::text || ' XP',
      jsonb_build_object('kind','aura_achievement','achievement_id',p_achievement_id,'xp',v_safe_xp,'rare',rare)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF rare THEN
    INSERT INTO public.oculto_aura_rare_unlocks(user_id, profile_id, achievement_id, achievement_title, xp_awarded)
    VALUES (v_uid, v_pid, p_achievement_id, v_title, v_safe_xp)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  awarded := true;
  already_claimed := false;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim_v2(text, integer, integer, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;