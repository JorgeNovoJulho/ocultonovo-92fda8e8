-- =====================================================================
-- Aura Match — SQL corrigido para DROP/CREATE + missões realtime + histórico desbloqueável
-- COLE ESTE ARQUIVO INTEIRO NO SQL EDITOR DO SUPABASE EXTERNO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Tabelas base de settings e eventos desbloqueáveis
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.oculto_aura_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.oculto_aura_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_settings_read_authenticated" ON public.oculto_aura_settings;
CREATE POLICY "aura_settings_read_authenticated"
  ON public.oculto_aura_settings FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.oculto_aura_settings (key, value)
VALUES
  ('attention_cost_xp', to_jsonb(50)),
  ('aura_signal_reveal_cost_xp', to_jsonb(100)),
  ('aura_signal_reveal_window_minutes', to_jsonb(60)),
  ('aura_signal_history_days', to_jsonb(3))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.oculto_aura_attentions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL,
  target_id   uuid NOT NULL,
  cost_xp     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aura_attentions_target_recent
  ON public.oculto_aura_attentions (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_attentions_sender_recent
  ON public.oculto_aura_attentions (sender_id, created_at DESC);

ALTER TABLE public.oculto_aura_attentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_attentions_select_own" ON public.oculto_aura_attentions;
CREATE POLICY "aura_attentions_select_own"
  ON public.oculto_aura_attentions FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = target_id);

CREATE TABLE IF NOT EXISTS public.oculto_aura_signal_unlocks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  signal_kind    text NOT NULL,
  cost_xp        integer NOT NULL DEFAULT 100,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_signal_unlocks_user_kind_recent
  ON public.oculto_aura_signal_unlocks (user_id, signal_kind, expires_at DESC);

ALTER TABLE public.oculto_aura_signal_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_signal_unlocks_select_own" ON public.oculto_aura_signal_unlocks;
CREATE POLICY "aura_signal_unlocks_select_own"
  ON public.oculto_aura_signal_unlocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 1) Helper master admin
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.aura_is_master_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND lower(trim(coalesce(p.username, ''))) = 'ocultomaster'
  );
$$;

GRANT EXECUTE ON FUNCTION public.aura_is_master_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_get_settings()
RETURNS TABLE(key text, value jsonb, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.key, s.value, s.updated_at
    FROM public.oculto_aura_settings s
   ORDER BY s.key;
$$;

GRANT EXECUTE ON FUNCTION public.aura_get_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_admin_set_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.aura_is_master_admin() THEN
    RAISE EXCEPTION 'forbidden: master admin only';
  END IF;

  INSERT INTO public.oculto_aura_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), v_uid)
  ON CONFLICT (key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_admin_set_setting(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Corrige erro 42P13 com DROP FUNCTION antes de mudar assinatura
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.aura_rooms_list();

CREATE OR REPLACE FUNCTION public.aura_rooms_list()
RETURNS TABLE(
  slug text, name text, emoji text, hue smallint, description text,
  vip_only boolean, required_plan text, requires_kyc boolean, couple_only boolean,
  min_aura_level smallint, min_social_score int, min_prestige_xp int,
  hour_from smallint, hour_to smallint, glow_intensity smallint, sort_order smallint,
  active_count int, allowed boolean, observer_only boolean,
  mood text, rising boolean, reputation_score int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_state jsonb;
  v_gates jsonb;
  v_count int;
BEGIN
  FOR r IN
    SELECT *
      FROM public.oculto_aura_rooms
     WHERE active = true
     ORDER BY sort_order, name
  LOOP
    BEGIN
      v_state := public.aura_room_state(r.slug);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*)::int
        INTO v_count
        FROM public.oculto_aura_room_presence pr
       WHERE pr.room_slug = r.slug
         AND pr.last_ping > now() - interval '5 minutes';

      v_state := jsonb_build_object(
        'count', v_count,
        'mood', CASE WHEN v_count >= 8 THEN 'elétrica' WHEN v_count >= 4 THEN 'quente' ELSE 'calmo' END,
        'rising', (v_count >= 3)
      );
    END;

    BEGIN
      v_gates := public._aura_room_check_gates(r.slug, v_uid);
    EXCEPTION WHEN OTHERS THEN
      v_gates := jsonb_build_object(
        'allowed', NOT COALESCE(r.vip_only, false),
        'observer', COALESCE(r.vip_only, false)
      );
    END;

    slug := r.slug;
    name := r.name;
    emoji := r.emoji;
    hue := r.hue;
    description := r.description;
    vip_only := r.vip_only;
    required_plan := r.required_plan;
    requires_kyc := r.requires_kyc;
    couple_only := r.couple_only;
    min_aura_level := r.min_aura_level;
    min_social_score := r.min_social_score;
    min_prestige_xp := r.min_prestige_xp;
    hour_from := r.hour_from;
    hour_to := r.hour_to;
    glow_intensity := r.glow_intensity;
    sort_order := r.sort_order;
    active_count := COALESCE((v_state->>'count')::int, 0);
    allowed := COALESCE((v_gates->>'allowed')::boolean, NOT COALESCE(r.vip_only, false));
    observer_only := COALESCE((v_gates->>'observer')::boolean, COALESCE(r.vip_only, false));
    mood := COALESCE(v_state->>'mood', 'calmo');
    rising := COALESCE((v_state->>'rising')::boolean, false);
    reputation_score := COALESCE(r.reputation_score, 0);
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_rooms_list() TO authenticated;

DROP FUNCTION IF EXISTS public.aura_rooms_rising_now();

CREATE OR REPLACE FUNCTION public.aura_rooms_rising_now()
RETURNS TABLE(slug text, name text, emoji text, hue smallint, energy int, mood text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_state jsonb;
  v_count int;
BEGIN
  FOR r IN
    SELECT slug, name, emoji, hue
      FROM public.oculto_aura_rooms
     WHERE active = true
     ORDER BY sort_order, name
  LOOP
    BEGIN
      v_state := public.aura_room_state(r.slug);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*)::int
        INTO v_count
        FROM public.oculto_aura_room_presence pr
       WHERE pr.room_slug = r.slug
         AND pr.last_ping > now() - interval '5 minutes';

      v_state := jsonb_build_object(
        'energy', LEAST(100, GREATEST(0, v_count * 12)),
        'mood', CASE WHEN v_count >= 8 THEN 'elétrica' WHEN v_count >= 4 THEN 'quente' ELSE 'calmo' END,
        'rising', (v_count >= 3)
      );
    END;

    IF COALESCE((v_state->>'rising')::boolean, false) THEN
      slug := r.slug;
      name := r.name;
      emoji := r.emoji;
      hue := r.hue;
      energy := COALESCE((v_state->>'energy')::int, 0);
      mood := COALESCE(v_state->>'mood', 'calmo');
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_rooms_rising_now() TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Realtime das tabelas do Aura Match
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_room_presence'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_presence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_room_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_reactions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_daily_quests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_daily_quests';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_attentions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_attentions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_signal_unlocks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_signal_unlocks';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'profile_visits'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'profile_visits'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_visits';
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 4) Chamar atenção com cooldown detalhado
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.aura_send_attention(uuid);

CREATE OR REPLACE FUNCTION public.aura_send_attention(p_target_user_id uuid)
RETURNS TABLE(
  ok boolean,
  cost_xp integer,
  remaining_xp integer,
  message text,
  cooldown_seconds_left integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer;
  v_balance integer;
  v_last_at timestamptz;
  v_left integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid target';
  END IF;

  SELECT COALESCE((value)::int, 50)
    INTO v_cost
    FROM public.oculto_aura_settings
   WHERE key = 'attention_cost_xp';
  v_cost := COALESCE(v_cost, 50);

  SELECT COALESCE(aura_xp, 0)
    INTO v_balance
    FROM public.profiles
   WHERE user_id = v_uid;
  v_balance := COALESCE(v_balance, 0);

  IF v_balance < v_cost THEN
    ok := false; cost_xp := v_cost; remaining_xp := v_balance;
    message := 'XP insuficiente'; cooldown_seconds_left := 0;
    RETURN NEXT; RETURN;
  END IF;

  SELECT max(created_at)
    INTO v_last_at
    FROM public.oculto_aura_attentions
   WHERE sender_id = v_uid AND target_id = p_target_user_id;

  IF v_last_at IS NOT NULL AND v_last_at > now() - interval '6 hours' THEN
    v_left := GREATEST(0, EXTRACT(EPOCH FROM ((v_last_at + interval '6 hours') - now()))::int);
    ok := false; cost_xp := v_cost; remaining_xp := v_balance;
    message := 'Cooldown ativo'; cooldown_seconds_left := v_left;
    RETURN NEXT; RETURN;
  END IF;

  PERFORM public.aura_award_xp(-v_cost, 'attention:' || p_target_user_id::text);

  INSERT INTO public.oculto_aura_attentions (sender_id, target_id, cost_xp)
  VALUES (v_uid, p_target_user_id, v_cost);

  SELECT COALESCE(aura_xp,0) INTO v_balance FROM public.profiles WHERE user_id = v_uid;

  ok := true;
  cost_xp := v_cost;
  remaining_xp := COALESCE(v_balance, 0);
  message := 'Atenção enviada';
  cooldown_seconds_left := 21600;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_send_attention(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.aura_attention_status(uuid);

CREATE OR REPLACE FUNCTION public.aura_attention_status(p_target_user_id uuid)
RETURNS TABLE(
  cost_xp integer,
  balance_xp integer,
  has_enough boolean,
  cooldown_seconds_left integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer;
  v_balance integer;
  v_last_at timestamptz;
  v_left integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COALESCE((value)::int, 50)
    INTO v_cost
    FROM public.oculto_aura_settings
   WHERE key = 'attention_cost_xp';
  v_cost := COALESCE(v_cost, 50);

  SELECT COALESCE(aura_xp,0)
    INTO v_balance
    FROM public.profiles
   WHERE user_id = v_uid;
  v_balance := COALESCE(v_balance, 0);

  IF p_target_user_id IS NOT NULL AND p_target_user_id <> v_uid THEN
    SELECT max(created_at)
      INTO v_last_at
      FROM public.oculto_aura_attentions
     WHERE sender_id = v_uid AND target_id = p_target_user_id;
    IF v_last_at IS NOT NULL AND v_last_at > now() - interval '6 hours' THEN
      v_left := GREATEST(0, EXTRACT(EPOCH FROM ((v_last_at + interval '6 hours') - now()))::int);
    END IF;
  END IF;

  cost_xp := v_cost;
  balance_xp := v_balance;
  has_enough := v_balance >= v_cost;
  cooldown_seconds_left := v_left;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_attention_status(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.aura_attentions_history(integer);

CREATE OR REPLACE FUNCTION public.aura_attentions_history(p_limit integer DEFAULT 30)
RETURNS TABLE(
  id uuid,
  direction text,
  other_user_id uuid,
  other_username text,
  other_name text,
  other_avatar text,
  cost_xp integer,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  SELECT
    a.id,
    CASE WHEN a.sender_id = v_uid THEN 'sent' ELSE 'received' END AS direction,
    CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END AS other_user_id,
    p.username,
    COALESCE(p.display_name, p.name, p.username) AS other_name,
    p.avatar_url,
    a.cost_xp,
    a.created_at
  FROM public.oculto_aura_attentions a
  LEFT JOIN public.profiles p
    ON p.user_id = CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END
  WHERE a.sender_id = v_uid OR a.target_id = v_uid
  ORDER BY a.created_at DESC
  LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_attentions_history(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Missões diárias + realtime
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.oculto_aura_daily_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_key text NOT NULL,
  day date NOT NULL DEFAULT (now() at time zone 'America/Sao_Paulo')::date,
  progress integer NOT NULL DEFAULT 0,
  target integer NOT NULL DEFAULT 1,
  xp_reward integer NOT NULL DEFAULT 20,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_key, day)
);

CREATE INDEX IF NOT EXISTS idx_aura_quests_user_day
  ON public.oculto_aura_daily_quests (user_id, day);

ALTER TABLE public.oculto_aura_daily_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_quests_select_own" ON public.oculto_aura_daily_quests;
CREATE POLICY "aura_quests_select_own"
  ON public.oculto_aura_daily_quests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "aura_quests_insert_own" ON public.oculto_aura_daily_quests;
CREATE POLICY "aura_quests_insert_own"
  ON public.oculto_aura_daily_quests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "aura_quests_update_own" ON public.oculto_aura_daily_quests;
CREATE POLICY "aura_quests_update_own"
  ON public.oculto_aura_daily_quests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.aura_ensure_daily_quests()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seed bigint;
  v_pool jsonb := jsonb_build_array(
    jsonb_build_object('key','visit_aura',       'target',1, 'xp',15),
    jsonb_build_object('key','tap_3_auras',      'target',3, 'xp',25),
    jsonb_build_object('key','send_super_dm',    'target',1, 'xp',40),
    jsonb_build_object('key','resonance_3',      'target',3, 'xp',35),
    jsonb_build_object('key','visit_room',       'target',1, 'xp',20),
    jsonb_build_object('key','send_echo',        'target',1, 'xp',15),
    jsonb_build_object('key','view_5_profiles',  'target',5, 'xp',20),
    jsonb_build_object('key','tap_rare_aura',    'target',1, 'xp',35),
    jsonb_build_object('key','send_3_dms',       'target',3, 'xp',30),
    jsonb_build_object('key','join_storm',       'target',1, 'xp',30),
    jsonb_build_object('key','randomize_aura',   'target',1, 'xp',15),
    jsonb_build_object('key','send_gift',        'target',1, 'xp',35)
  );
  v_existing int;
  v_n int;
  v_idx int;
  v_item jsonb;
  v_picked text[] := ARRAY[]::text[];
  v_target_count int := 4;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_existing
    FROM public.oculto_aura_daily_quests
   WHERE user_id = v_uid AND day = v_today;
  IF v_existing > 0 THEN RETURN; END IF;

  v_seed := abs(hashtextextended(v_uid::text || ':' || v_today::text, 0));
  v_n := jsonb_array_length(v_pool);
  v_picked := array_append(v_picked, 'visit_aura');

  FOR i IN 1..(v_n * 3) LOOP
    EXIT WHEN array_length(v_picked, 1) >= v_target_count;
    v_idx := ((v_seed + i * 7919) % v_n)::int;
    v_item := v_pool -> v_idx;
    IF NOT ((v_item ->> 'key') = ANY (v_picked)) THEN
      v_picked := array_append(v_picked, v_item ->> 'key');
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT j FROM jsonb_array_elements(v_pool) j
     WHERE (j ->> 'key') = ANY (v_picked)
  LOOP
    INSERT INTO public.oculto_aura_daily_quests
      (user_id, quest_key, day, progress, target, xp_reward)
    VALUES
      (v_uid, v_item ->> 'key', v_today, 0, (v_item ->> 'target')::int, (v_item ->> 'xp')::int)
    ON CONFLICT (user_id, quest_key, day) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_get_daily_quests()
RETURNS TABLE(quest_key text, progress integer, target integer, xp_reward integer, claimed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  PERFORM public.aura_ensure_daily_quests();
  RETURN QUERY
  SELECT q.quest_key, q.progress, q.target, q.xp_reward, (q.claimed_at IS NOT NULL)
    FROM public.oculto_aura_daily_quests q
   WHERE q.user_id = v_uid AND q.day = v_today
   ORDER BY q.quest_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_progress_quest(p_quest_key text, p_amount integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  PERFORM public.aura_ensure_daily_quests();
  UPDATE public.oculto_aura_daily_quests
     SET progress = LEAST(target, progress + GREATEST(COALESCE(p_amount,1), 1))
   WHERE user_id = v_uid
     AND day = v_today
     AND quest_key = p_quest_key
     AND claimed_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_claim_quest(p_quest_key text)
RETURNS TABLE(awarded_xp integer, total_xp integer, level integer, level_up boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_q record;
  v_award_result record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT *
    INTO v_q
    FROM public.oculto_aura_daily_quests
   WHERE user_id = v_uid AND day = v_today AND quest_key = p_quest_key
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'quest not found'; END IF;
  IF v_q.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'already claimed'; END IF;
  IF v_q.progress < v_q.target THEN RAISE EXCEPTION 'quest incomplete'; END IF;

  UPDATE public.oculto_aura_daily_quests
     SET claimed_at = now()
   WHERE id = v_q.id;

  SELECT * INTO v_award_result
    FROM public.aura_award_xp(v_q.xp_reward, 'quest:' || p_quest_key);

  awarded_xp := v_q.xp_reward;
  total_xp := COALESCE(v_award_result.xp, 0);
  level := COALESCE(v_award_result.level, 1);
  level_up := COALESCE(v_award_result.level_up, false);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_ensure_daily_quests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_get_daily_quests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_progress_quest(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_claim_quest(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) Histórico real de sinais do Aura, com unlock por XP por 60 min
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.aura_signal_unlock_status(text);

CREATE OR REPLACE FUNCTION public.aura_signal_unlock_status(p_signal_kind text)
RETURNS TABLE(
  signal_kind text,
  reveal_cost_xp integer,
  balance_xp integer,
  unlocked boolean,
  seconds_left integer,
  history_days integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer := 100;
  v_balance integer := 0;
  v_history_days integer := 3;
  v_unlock record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COALESCE((value)::int, 100) INTO v_cost
    FROM public.oculto_aura_settings
   WHERE key = 'aura_signal_reveal_cost_xp';

  SELECT COALESCE((value)::int, 3) INTO v_history_days
    FROM public.oculto_aura_settings
   WHERE key = 'aura_signal_history_days';

  SELECT COALESCE(aura_xp,0) INTO v_balance
    FROM public.profiles
   WHERE user_id = v_uid;

  SELECT * INTO v_unlock
    FROM public.oculto_aura_signal_unlocks u
   WHERE u.user_id = v_uid
     AND u.signal_kind = p_signal_kind
     AND u.expires_at > now()
   ORDER BY u.expires_at DESC
   LIMIT 1;

  signal_kind := p_signal_kind;
  reveal_cost_xp := COALESCE(v_cost, 100);
  balance_xp := COALESCE(v_balance, 0);
  unlocked := v_unlock.id IS NOT NULL;
  seconds_left := CASE WHEN v_unlock.id IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (v_unlock.expires_at - now()))::int) ELSE 0 END;
  history_days := COALESCE(v_history_days, 3);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_signal_unlock_status(text) TO authenticated;

DROP FUNCTION IF EXISTS public.aura_unlock_signal(text);

CREATE OR REPLACE FUNCTION public.aura_unlock_signal(p_signal_kind text)
RETURNS TABLE(ok boolean, cost_xp integer, remaining_xp integer, expires_at timestamptz, seconds_left integer, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer := 100;
  v_minutes integer := 60;
  v_balance integer := 0;
  v_existing record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF COALESCE(trim(p_signal_kind), '') = '' THEN RAISE EXCEPTION 'signal required'; END IF;

  SELECT COALESCE((value)::int, 100) INTO v_cost
    FROM public.oculto_aura_settings
   WHERE key = 'aura_signal_reveal_cost_xp';

  SELECT COALESCE((value)::int, 60) INTO v_minutes
    FROM public.oculto_aura_settings
   WHERE key = 'aura_signal_reveal_window_minutes';

  SELECT COALESCE(aura_xp,0) INTO v_balance
    FROM public.profiles
   WHERE user_id = v_uid;

  SELECT * INTO v_existing
    FROM public.oculto_aura_signal_unlocks u
   WHERE u.user_id = v_uid
     AND u.signal_kind = p_signal_kind
     AND u.expires_at > now()
   ORDER BY u.expires_at DESC
   LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    ok := true;
    cost_xp := 0;
    remaining_xp := COALESCE(v_balance, 0);
    expires_at := v_existing.expires_at;
    seconds_left := GREATEST(0, EXTRACT(EPOCH FROM (v_existing.expires_at - now()))::int);
    message := 'Já desbloqueado';
    RETURN NEXT; RETURN;
  END IF;

  IF COALESCE(v_balance,0) < COALESCE(v_cost,100) THEN
    ok := false;
    cost_xp := COALESCE(v_cost,100);
    remaining_xp := COALESCE(v_balance,0);
    expires_at := NULL;
    seconds_left := 0;
    message := 'XP insuficiente';
    RETURN NEXT; RETURN;
  END IF;

  PERFORM public.aura_award_xp(-COALESCE(v_cost,100), 'signal_unlock:' || p_signal_kind);

  INSERT INTO public.oculto_aura_signal_unlocks (user_id, signal_kind, cost_xp, unlocked_at, expires_at)
  VALUES (v_uid, p_signal_kind, COALESCE(v_cost,100), now(), now() + make_interval(mins => COALESCE(v_minutes,60)));

  SELECT COALESCE(aura_xp,0) INTO v_balance FROM public.profiles WHERE user_id = v_uid;

  ok := true;
  cost_xp := COALESCE(v_cost,100);
  remaining_xp := COALESCE(v_balance,0);
  expires_at := now() + make_interval(mins => COALESCE(v_minutes,60));
  seconds_left := COALESCE(v_minutes,60) * 60;
  message := 'Desbloqueado';
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_unlock_signal(text) TO authenticated;

DROP FUNCTION IF EXISTS public.aura_signal_history(text, integer);

CREATE OR REPLACE FUNCTION public.aura_signal_history(p_signal_kind text, p_limit integer DEFAULT 20)
RETURNS TABLE(
  id text,
  signal_kind text,
  happened_at timestamptz,
  summary text,
  actor_user_id uuid,
  actor_name text,
  actor_username text,
  actor_avatar text,
  locked boolean,
  cost_xp integer,
  seconds_left integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_cost integer := 100;
  v_days integer := 3;
  v_unlock record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COALESCE((value)::int, 100) INTO v_cost
    FROM public.oculto_aura_settings
   WHERE key = 'aura_signal_reveal_cost_xp';

  SELECT COALESCE((value)::int, 3) INTO v_days
    FROM public.oculto_aura_settings
   WHERE key = 'aura_signal_history_days';

  SELECT * INTO v_unlock
    FROM public.oculto_aura_signal_unlocks u
   WHERE u.user_id = v_uid
     AND u.signal_kind = p_signal_kind
     AND u.expires_at > now()
   ORDER BY u.expires_at DESC
   LIMIT 1;

  IF p_signal_kind = 'attention' THEN
    RETURN QUERY
    SELECT
      a.id::text,
      'attention'::text,
      a.created_at,
      'Tentaram chamar sua atenção'::text,
      CASE WHEN v_unlock.id IS NOT NULL THEN a.sender_id ELSE NULL::uuid END,
      CASE WHEN v_unlock.id IS NOT NULL THEN COALESCE(p.display_name, p.name, p.username, 'Usuário') ELSE 'Oculto' END,
      CASE WHEN v_unlock.id IS NOT NULL THEN p.username ELSE NULL::text END,
      CASE WHEN v_unlock.id IS NOT NULL THEN p.avatar_url ELSE NULL::text END,
      (v_unlock.id IS NULL),
      COALESCE(v_cost,100),
      CASE WHEN v_unlock.id IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (v_unlock.expires_at - now()))::int) ELSE 0 END
    FROM public.oculto_aura_attentions a
    LEFT JOIN public.profiles p ON p.user_id = a.sender_id
    WHERE a.target_id = v_uid
      AND a.created_at > now() - make_interval(days => COALESCE(v_days,3))
    ORDER BY a.created_at DESC
    LIMIT v_limit;
    RETURN;
  ELSIF p_signal_kind = 'profile_view' THEN
    RETURN QUERY
    SELECT
      pv.id::text,
      'profile_view'::text,
      pv.visited_at,
      'Alguém olhou seu perfil'::text,
      CASE WHEN v_unlock.id IS NOT NULL THEN COALESCE(p.user_id, p.id) ELSE NULL::uuid END,
      CASE WHEN v_unlock.id IS NOT NULL THEN COALESCE(p.display_name, p.name, p.username, 'Usuário') ELSE 'Oculto' END,
      CASE WHEN v_unlock.id IS NOT NULL THEN p.username ELSE NULL::text END,
      CASE WHEN v_unlock.id IS NOT NULL THEN p.avatar_url ELSE NULL::text END,
      (v_unlock.id IS NULL),
      COALESCE(v_cost,100),
      CASE WHEN v_unlock.id IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (v_unlock.expires_at - now()))::int) ELSE 0 END
    FROM public.profile_visits pv
    LEFT JOIN public.profiles p ON p.id = pv.visitor_id OR p.user_id = pv.visitor_id
    WHERE pv.visited_id = (SELECT id FROM public.profiles WHERE user_id = v_uid LIMIT 1)
      AND pv.visited_at > now() - make_interval(days => COALESCE(v_days,3))
    ORDER BY pv.visited_at DESC
    LIMIT v_limit;
    RETURN;
  ELSE
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_signal_history(text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';