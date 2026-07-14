-- =============================================================================
-- HOTFIX DEFINITIVO — Aura: bloqueio total de conquista rara no dia da entrada
-- EXTERNO APENAS. Idempotente. Cole e execute INTEIRO no SQL Editor externo.
--
-- Corrige o fluxo completo que libera "Sol Interior" / +10.000 XP:
-- 1) Perfil novo nasce em 100 XP / nível 2.
-- 2) Qualquer tentativa de deixar usuário do dia de entrada com XP >= 10.000
--    ou nível >= 25 é normalizada para 100 XP / nível 2.
-- 3) aura_achievement_claim_v2 ignora p_current/p_xp_reward do cliente,
--    usa métricas server-side e bloqueia TODO reward raro no primeiro dia.
-- 4) Broadcasts raros e notificações raras do primeiro dia são descartados.
-- 5) Limpa claims/broadcasts/notificações já contaminados, inclusive os
--    criados dentro das primeiras 24h e ainda aparecendo no modal.
-- =============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_xp integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS aura_level integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS aura_streak_days integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN aura_xp SET DEFAULT 100,
  ALTER COLUMN aura_level SET DEFAULT 2,
  ALTER COLUMN aura_streak_days SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(COALESCE(p_xp, 0), 0)::numeric / 50))::int + 1);
$$;

GRANT EXECUTE ON FUNCTION public.aura_level_from_xp(integer) TO anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.oculto_is_entry_day_profile(p_user_id uuid, p_profile_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE (p.user_id = p_user_id OR p.id = p_user_id OR (p_profile_id IS NOT NULL AND p.id = p_profile_id))
       AND COALESCE(p.created_at, now()) >= now() - interval '1 day'
  );
$$;

GRANT EXECUTE ON FUNCTION public.oculto_is_entry_day_profile(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oculto_profile_aura_entry_day_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.aura_xp := GREATEST(100, COALESCE(NEW.aura_xp, 100));
  END IF;

  NEW.aura_xp := GREATEST(0, COALESCE(NEW.aura_xp, 0));

  IF COALESCE(NEW.created_at, now()) >= now() - interval '1 day'
     AND (NEW.aura_xp >= 10000 OR COALESCE(NEW.aura_level, 1) >= 25) THEN
    NEW.aura_xp := 100;
  END IF;

  NEW.aura_level := public.aura_level_from_xp(NEW.aura_xp);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_profile_aura_level_guard ON public.profiles;
DROP TRIGGER IF EXISTS trg_oculto_profile_aura_entry_day_guard ON public.profiles;
CREATE TRIGGER trg_oculto_profile_aura_entry_day_guard
BEFORE INSERT OR UPDATE OF aura_xp, aura_level, created_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.oculto_profile_aura_entry_day_guard();

CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_rewards (
  achievement_id text PRIMARY KEY,
  xp_reward integer NOT NULL CHECK (xp_reward BETWEEN 100 AND 10000),
  required integer NOT NULL CHECK (required > 0),
  metric text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oculto_aura_achievement_rewards TO authenticated, anon;
GRANT ALL ON public.oculto_aura_achievement_rewards TO service_role;
ALTER TABLE public.oculto_aura_achievement_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rewards public read" ON public.oculto_aura_achievement_rewards;
CREATE POLICY "rewards public read" ON public.oculto_aura_achievement_rewards
  FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.oculto_aura_achievement_rewards(achievement_id, xp_reward, required, metric) VALUES
  ('lvl_5',500,5,'current_level'), ('lvl_10',1500,10,'current_level'), ('lvl_20',3500,20,'current_level'), ('lvl_50',10000,50,'current_level'),
  ('streak_3',500,3,'current_streak'), ('streak_7',1500,7,'current_streak'), ('streak_30',10000,30,'current_streak'),
  ('visits_15',2500,15,'visit_days'), ('visits_30',5500,30,'visit_days'),
  ('quests_10',500,10,'quests_claimed'), ('quests_50',5500,50,'quests_claimed'), ('quests_200',10000,200,'quests_claimed'),
  ('sdm_5',1500,5,'super_dm_quests'), ('xp_1000',3500,1000,'total_xp'), ('xp_10000',10000,10000,'total_xp'),
  ('likes_5',500,5,'likes_quests'), ('likes_25',5500,25,'likes_quests'), ('follows_5',500,5,'follows_quests'), ('follows_25',5500,25,'follows_quests'),
  ('saves_5',500,5,'saves_quests'), ('saves_25',5500,25,'saves_quests'), ('comments_5',500,5,'comments_quests'), ('comments_25',5500,25,'comments_quests'),
  ('polls_5',500,5,'polls_quests'), ('gifts_3',1500,3,'gifts_quests'), ('gifts_10',10000,10,'gifts_quests'),
  ('comm_join_1',500,1,'communities_joined'), ('comm_join_5',1500,5,'communities_joined'), ('comm_topics_3',500,3,'community_topics'), ('comm_topics_25',5500,25,'community_topics'),
  ('play_pub_1',500,1,'play_publishes'), ('play_pub_10',1500,10,'play_publishes'), ('play_views_1k',10000,1000,'play_views_total'),
  ('play_visit_streak_10',1500,10,'play_visit_streak_consec'), ('play_visit_30',3500,30,'play_visit_days'), ('play_listen_streak_10',10000,10,'play_listen_streak'),
  ('chat_50',500,50,'chat_messages'), ('chat_500',1500,500,'chat_messages'),
  ('rooms_join_3',500,3,'rooms_joined'), ('rooms_msgs_25',1500,25,'rooms_messages'),
  ('match_1',500,1,'matches_total'), ('match_10',1500,10,'matches_total'), ('match_50',10000,50,'matches_total'),
  ('rank_top100',1500,1,'rank_top100_flag'), ('rank_top10',10000,1,'rank_top10_flag')
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
CREATE INDEX IF NOT EXISTS idx_oculto_aura_rare_unlocks_created
  ON public.oculto_aura_rare_unlocks(created_at DESC);
GRANT SELECT ON public.oculto_aura_rare_unlocks TO authenticated;
GRANT ALL ON public.oculto_aura_rare_unlocks TO service_role;
ALTER TABLE public.oculto_aura_rare_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rare unlocks authenticated read" ON public.oculto_aura_rare_unlocks;
CREATE POLICY "rare unlocks authenticated read" ON public.oculto_aura_rare_unlocks
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.oculto_block_entry_day_rare_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.oculto_is_entry_day_profile(NEW.user_id, NEW.profile_id)
     AND (
       COALESCE(NEW.xp_awarded, 0) >= 10000
       OR NEW.achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10','quests_200')
     ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_block_entry_day_rare_claim ON public.oculto_aura_achievement_claims;
CREATE TRIGGER trg_oculto_block_entry_day_rare_claim
BEFORE INSERT OR UPDATE ON public.oculto_aura_achievement_claims
FOR EACH ROW EXECUTE FUNCTION public.oculto_block_entry_day_rare_claim();

CREATE OR REPLACE FUNCTION public.oculto_aura_rare_unlock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp int := 0;
  v_level int := 1;
  v_created_at timestamptz := NULL;
BEGIN
  SELECT COALESCE(p.aura_xp, 0), public.aura_level_from_xp(COALESCE(p.aura_xp, 0)), p.created_at
    INTO v_xp, v_level, v_created_at
    FROM public.profiles p
   WHERE p.id = NEW.profile_id OR p.user_id = NEW.user_id OR p.id = NEW.user_id
   ORDER BY CASE WHEN p.id = NEW.profile_id THEN 0 WHEN p.user_id = NEW.user_id THEN 1 ELSE 2 END
   LIMIT 1;

  IF v_created_at IS NULL THEN RETURN NULL; END IF;
  IF v_created_at >= now() - interval '1 day' AND COALESCE(NEW.xp_awarded, 0) >= 10000 THEN RETURN NULL; END IF;
  IF NEW.achievement_id = 'xp_10000' AND v_xp < 10000 THEN RETURN NULL; END IF;
  IF NEW.achievement_id = 'lvl_50' AND v_level < 50 THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_aura_rare_unlock_guard ON public.oculto_aura_rare_unlocks;
CREATE TRIGGER trg_oculto_aura_rare_unlock_guard
BEFORE INSERT OR UPDATE ON public.oculto_aura_rare_unlocks
FOR EACH ROW EXECUTE FUNCTION public.oculto_aura_rare_unlock_guard();

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
  v_metrics jsonb := '{}'::jsonb;
  v_play jsonb := '{}'::jsonb;
  v_current int := 0;
  v_safe_xp int := 0;
  v_inserted int := 0;
  v_reward record;
  v_profile_xp int := 0;
  v_profile_level int := 1;
  v_profile_streak int := 0;
  v_profile_created_at timestamptz;
  v_rank int := 0;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  SELECT * INTO v_reward FROM public.oculto_aura_achievement_rewards WHERE achievement_id = p_achievement_id;
  IF v_reward IS NULL THEN RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id; END IF;

  v_safe_xp := LEAST(10000, GREATEST(100, v_reward.xp_reward));
  rare := v_safe_xp >= 10000;

  SELECT COALESCE(p.aura_xp, 0), public.aura_level_from_xp(COALESCE(p.aura_xp, 0)), COALESCE(p.aura_streak_days, 0), p.created_at
    INTO v_profile_xp, v_profile_level, v_profile_streak, v_profile_created_at
    FROM public.profiles p
   WHERE p.id = v_pid
   FOR UPDATE;

  xp_total := v_profile_xp;
  level := v_profile_level;

  -- Regra de negócio absoluta: nenhum reward raro no dia de entrada.
  IF rare AND COALESCE(v_profile_created_at, now()) >= now() - interval '1 day' THEN
    eligible := false;
    already_claimed := false;
    awarded := false;
    RETURN NEXT; RETURN;
  END IF;

  BEGIN SELECT to_jsonb(m) INTO v_metrics FROM public.aura_achievements_metrics() m LIMIT 1; EXCEPTION WHEN OTHERS THEN v_metrics := '{}'::jsonb; END;
  BEGIN SELECT COALESCE(r.rank, 0)::int INTO v_rank FROM public.aura_my_rank() AS r LIMIT 1; EXCEPTION WHEN OTHERS THEN v_rank := 0; END;
  BEGIN SELECT to_jsonb(p) INTO v_play FROM public.oculto_play_user_metrics() p LIMIT 1; EXCEPTION WHEN OTHERS THEN v_play := '{}'::jsonb; END;

  v_current := CASE p_achievement_id
    WHEN 'lvl_5' THEN v_profile_level WHEN 'lvl_10' THEN v_profile_level WHEN 'lvl_20' THEN v_profile_level WHEN 'lvl_50' THEN v_profile_level
    WHEN 'streak_3' THEN GREATEST(COALESCE((v_metrics->>'current_streak')::int, 0), v_profile_streak)
    WHEN 'streak_7' THEN GREATEST(COALESCE((v_metrics->>'current_streak')::int, 0), v_profile_streak)
    WHEN 'streak_30' THEN GREATEST(COALESCE((v_metrics->>'current_streak')::int, 0), v_profile_streak)
    WHEN 'visits_15' THEN COALESCE((v_metrics->>'visit_days')::int, 0) WHEN 'visits_30' THEN COALESCE((v_metrics->>'visit_days')::int, 0)
    WHEN 'quests_10' THEN COALESCE((v_metrics->>'quests_claimed')::int, 0) WHEN 'quests_50' THEN COALESCE((v_metrics->>'quests_claimed')::int, 0) WHEN 'quests_200' THEN COALESCE((v_metrics->>'quests_claimed')::int, 0)
    WHEN 'sdm_5' THEN COALESCE((v_metrics->>'super_dm_quests')::int, 0)
    WHEN 'xp_1000' THEN v_profile_xp WHEN 'xp_10000' THEN v_profile_xp
    WHEN 'likes_5' THEN COALESCE((v_metrics->>'likes_quests')::int, 0) WHEN 'likes_25' THEN COALESCE((v_metrics->>'likes_quests')::int, 0)
    WHEN 'follows_5' THEN COALESCE((v_metrics->>'follows_quests')::int, 0) WHEN 'follows_25' THEN COALESCE((v_metrics->>'follows_quests')::int, 0)
    WHEN 'saves_5' THEN COALESCE((v_metrics->>'saves_quests')::int, 0) WHEN 'saves_25' THEN COALESCE((v_metrics->>'saves_quests')::int, 0)
    WHEN 'comments_5' THEN COALESCE((v_metrics->>'comments_quests')::int, 0) WHEN 'comments_25' THEN COALESCE((v_metrics->>'comments_quests')::int, 0)
    WHEN 'polls_5' THEN COALESCE((v_metrics->>'polls_quests')::int, 0)
    WHEN 'gifts_3' THEN COALESCE((v_metrics->>'gifts_quests')::int, 0) WHEN 'gifts_10' THEN COALESCE((v_metrics->>'gifts_quests')::int, 0)
    WHEN 'comm_join_1' THEN COALESCE((v_metrics->>'communities_joined')::int, 0) WHEN 'comm_join_5' THEN COALESCE((v_metrics->>'communities_joined')::int, 0)
    WHEN 'comm_topics_3' THEN COALESCE((v_metrics->>'community_topics')::int, 0) WHEN 'comm_topics_25' THEN COALESCE((v_metrics->>'community_topics')::int, 0)
    WHEN 'play_pub_1' THEN COALESCE((v_metrics->>'play_publishes')::int, 0) WHEN 'play_pub_10' THEN COALESCE((v_metrics->>'play_publishes')::int, 0) WHEN 'play_views_1k' THEN COALESCE((v_metrics->>'play_views_total')::int, 0)
    WHEN 'play_visit_streak_10' THEN COALESCE((v_play->>'visit_streak_consec')::int, COALESCE((v_metrics->>'play_visit_streak_consec')::int, 0))
    WHEN 'play_visit_30' THEN COALESCE((v_play->>'visit_days_total')::int, COALESCE((v_metrics->>'play_visit_days')::int, 0))
    WHEN 'play_listen_streak_10' THEN COALESCE((v_play->>'listen_streak')::int, COALESCE((v_metrics->>'play_listen_streak')::int, 0))
    WHEN 'chat_50' THEN COALESCE((v_metrics->>'chat_messages')::int, 0) WHEN 'chat_500' THEN COALESCE((v_metrics->>'chat_messages')::int, 0)
    WHEN 'rooms_join_3' THEN COALESCE((v_metrics->>'rooms_joined')::int, 0) WHEN 'rooms_msgs_25' THEN COALESCE((v_metrics->>'rooms_messages')::int, 0)
    WHEN 'match_1' THEN COALESCE((v_metrics->>'matches_total')::int, 0) WHEN 'match_10' THEN COALESCE((v_metrics->>'matches_total')::int, 0) WHEN 'match_50' THEN COALESCE((v_metrics->>'matches_total')::int, 0)
    WHEN 'rank_top100' THEN CASE WHEN v_rank BETWEEN 1 AND 100 OR COALESCE((v_metrics->>'rank_top100_flag')::int, 0) = 1 THEN 1 ELSE 0 END
    WHEN 'rank_top10' THEN CASE WHEN v_rank BETWEEN 1 AND 10 OR COALESCE((v_metrics->>'rank_top10_flag')::int, 0) = 1 THEN 1 ELSE 0 END
    ELSE 0
  END;

  eligible := COALESCE(v_current, 0) >= v_reward.required;

  SELECT EXISTS(
    SELECT 1 FROM public.oculto_aura_achievement_claims c
     WHERE c.user_id = v_uid AND c.achievement_id = p_achievement_id
  ) INTO already_claimed;

  IF already_claimed OR NOT eligible THEN awarded := false; RETURN NEXT; RETURN; END IF;

  INSERT INTO public.oculto_aura_achievement_claims(user_id, profile_id, achievement_id, xp_awarded, applied_to_balance)
  VALUES (v_uid, v_pid, p_achievement_id, v_safe_xp, true)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN already_claimed := true; awarded := false; RETURN NEXT; RETURN; END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp)
   WHERE id = v_pid
   RETURNING aura_xp, aura_level INTO xp_total, level;

  v_title := COALESCE(NULLIF(trim(p_title), ''), 'Conquista desbloqueada');
  BEGIN
    INSERT INTO public.notifications(user_id, type, title, body, data)
    VALUES (v_uid, 'system', CASE WHEN rare THEN 'Conquista RARA desbloqueada' ELSE 'Conquista desbloqueada' END,
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

CREATE OR REPLACE FUNCTION public.oculto_block_entry_day_rare_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp integer := 0;
  v_achievement_id text := NULL;
BEGIN
  IF NEW.data IS NULL THEN RETURN NEW; END IF;

  BEGIN
    v_xp := GREATEST(
      COALESCE((NEW.data->>'xp')::integer, 0),
      COALESCE((NEW.data->>'xp_awarded')::integer, 0)
    );
  EXCEPTION WHEN OTHERS THEN v_xp := 0; END;

  v_achievement_id := NEW.data->>'achievement_id';

  IF public.oculto_is_entry_day_profile(NEW.user_id, NULL)
     AND (
       v_xp >= 10000
       OR v_achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10','quests_200')
       OR (COALESCE(NEW.data->>'rare','false') = 'true')
     ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_oculto_block_entry_day_rare_notification ON public.notifications;
    CREATE TRIGGER trg_oculto_block_entry_day_rare_notification
    BEFORE INSERT OR UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.oculto_block_entry_day_rare_notification();
  END IF;
END $$;

-- Limpeza de contaminação: claims/broadcasts/notificações raras lançadas no 1º dia.
DELETE FROM public.oculto_aura_achievement_claims c
USING public.profiles p
WHERE (c.user_id = p.user_id OR c.user_id = p.id OR c.profile_id = p.id)
  AND (p.created_at >= now() - interval '1 day' OR COALESCE(c.claimed_at, now()) <= COALESCE(p.created_at, now()) + interval '1 day')
  AND (
    COALESCE(c.xp_awarded, 0) >= 10000
    OR c.achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10','quests_200')
  );

DELETE FROM public.oculto_aura_rare_unlocks ru
USING public.profiles p
WHERE (ru.user_id = p.user_id OR ru.user_id = p.id OR ru.profile_id = p.id)
  AND (p.created_at >= now() - interval '1 day' OR COALESCE(ru.created_at, now()) <= COALESCE(p.created_at, now()) + interval '1 day')
  AND (
    COALESCE(ru.xp_awarded, 0) >= 10000
    OR ru.achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10','quests_200')
  );

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications n
    USING public.profiles p
    WHERE (n.user_id = p.user_id OR n.user_id = p.id)
      AND p.created_at >= now() - interval '7 days'
      AND (
        COALESCE(n.data->>'achievement_id','') IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10','quests_200')
        OR COALESCE((n.data->>'rare')::boolean, false) = true
        OR COALESCE(NULLIF(regexp_replace(COALESCE(n.data->>'xp', n.data->>'xp_awarded', '0'), '[^0-9-]', '', 'g'), '')::integer, 0) >= 10000
        OR n.title ILIKE '%Conquista RARA%'
        OR n.body ILIKE '%10000 XP%'
        OR n.body ILIKE '%10.000 XP%'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.xp_transactions') IS NOT NULL THEN
    DELETE FROM public.xp_transactions x
    USING public.profiles p
    WHERE (x.user_id = p.user_id OR x.user_id = p.id)
      AND p.created_at >= now() - interval '1 day'
      AND COALESCE(x.amount, 0) >= 10000;
  END IF;
END $$;

UPDATE public.profiles p
   SET aura_xp = 100
 WHERE p.created_at >= now() - interval '1 day'
   AND (COALESCE(p.aura_xp, 0) < 100 OR COALESCE(p.aura_xp, 0) >= 10000 OR COALESCE(p.aura_level, 1) >= 25);

UPDATE public.profiles p
   SET aura_xp = 100
 WHERE p.created_at >= now() - interval '7 days'
   AND EXISTS (
     SELECT 1
       FROM public.oculto_aura_rare_unlocks ru
      WHERE (ru.user_id = p.user_id OR ru.user_id = p.id OR ru.profile_id = p.id)
        AND ru.achievement_id = 'xp_10000'
        AND COALESCE(ru.created_at, now()) <= COALESCE(p.created_at, now()) + interval '1 day'
   );

DO $$
DECLARE
  v_sql text;
BEGIN
  IF to_regclass('public.user_levels') IS NOT NULL THEN
    v_sql := 'UPDATE public.user_levels ul SET total_xp = 100, current_level = 2';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_levels' AND column_name='current_xp') THEN
      v_sql := v_sql || ', current_xp = 100';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_levels' AND column_name='updated_at') THEN
      v_sql := v_sql || ', updated_at = now()';
    END IF;
    v_sql := v_sql || ' FROM public.profiles p WHERE (ul.user_id = p.user_id OR ul.user_id = p.id) AND p.created_at >= now() - interval ''1 day'' AND (COALESCE(ul.total_xp,0) >= 10000 OR COALESCE(ul.current_level,1) >= 25)';
    EXECUTE v_sql;
  END IF;
END $$;

ALTER TABLE public.oculto_aura_rare_unlocks REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='oculto_aura_rare_unlocks'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_rare_unlocks';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Auditoria pós-execução — deve retornar 0 linhas:
-- SELECT username, created_at, aura_xp, aura_level, public.aura_level_from_xp(aura_xp) AS nivel_calculado
--   FROM public.profiles
--  WHERE created_at >= now() - interval '1 day'
--    AND (aura_xp >= 10000 OR aura_level >= 25)
--  ORDER BY created_at DESC;