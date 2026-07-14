-- =====================================================================
-- Aura Match v2 — Bloco C: Daily Quests + Conexões Raras
-- Tabela:
--   oculto_aura_daily_quests  (user_id, quest_key, day, progress, target, claimed_at, xp_reward)
-- RPCs:
--   aura_get_daily_quests()       -> quests do dia atual (cria automaticamente se faltar)
--   aura_progress_quest(key, n)   -> incrementa progresso de uma quest
--   aura_claim_quest(key)         -> resgata XP quando progress >= target
--   aura_rare_connections(limit)  -> auras "raras" (poucas interações + alto plano)
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_daily_quests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  quest_key   text NOT NULL,
  day         date NOT NULL DEFAULT (now() at time zone 'America/Sao_Paulo')::date,
  progress    integer NOT NULL DEFAULT 0,
  target      integer NOT NULL DEFAULT 1,
  xp_reward   integer NOT NULL DEFAULT 20,
  claimed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_key, day)
);

CREATE INDEX IF NOT EXISTS idx_aura_quests_user_day
  ON public.oculto_aura_daily_quests (user_id, day);

ALTER TABLE public.oculto_aura_daily_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_quests_select_own" ON public.oculto_aura_daily_quests;
CREATE POLICY "aura_quests_select_own"
  ON public.oculto_aura_daily_quests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "aura_quests_insert_own" ON public.oculto_aura_daily_quests;
CREATE POLICY "aura_quests_insert_own"
  ON public.oculto_aura_daily_quests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "aura_quests_update_own" ON public.oculto_aura_daily_quests;
CREATE POLICY "aura_quests_update_own"
  ON public.oculto_aura_daily_quests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.aura_ensure_daily_quests()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.oculto_aura_daily_quests (user_id, quest_key, day, progress, target, xp_reward)
  VALUES
    (v_uid, 'visit_aura',     v_today, 0, 1, 15),
    (v_uid, 'tap_3_auras',    v_today, 0, 3, 25),
    (v_uid, 'send_super_dm',  v_today, 0, 1, 40)
  ON CONFLICT (user_id, quest_key, day) DO NOTHING;
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
     SET progress = LEAST(target, progress + GREATEST(p_amount, 1))
   WHERE user_id = v_uid AND day = v_today AND quest_key = p_quest_key
     AND claimed_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_claim_quest(p_quest_key text)
RETURNS TABLE(awarded_xp integer, total_xp integer, level integer, level_up boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_q RECORD;
  v_award_result RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_q FROM public.oculto_aura_daily_quests
   WHERE user_id = v_uid AND day = v_today AND quest_key = p_quest_key
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quest not found'; END IF;
  IF v_q.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'already claimed'; END IF;
  IF v_q.progress < v_q.target THEN RAISE EXCEPTION 'quest incomplete'; END IF;
  UPDATE public.oculto_aura_daily_quests SET claimed_at = now() WHERE id = v_q.id;
  SELECT * INTO v_award_result FROM public.aura_award_xp(v_q.xp_reward, 'quest:' || p_quest_key);
  awarded_xp := v_q.xp_reward;
  total_xp := COALESCE(v_award_result.xp, 0);
  level := COALESCE(v_award_result.level, 1);
  level_up := COALESCE(v_award_result.level_up, false);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_rare_connections(p_limit integer DEFAULT 6)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  plan_type text,
  aura_level integer,
  rarity_score numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.plan_type,
    COALESCE(p.aura_level, 1) AS aura_level,
    (
      COALESCE(p.aura_level, 1) * 1.5
      + CASE p.plan_type WHEN 'vip' THEN 4 WHEN 'premium' THEN 2 ELSE 0 END
      - LEAST(COALESCE(p.aura_streak_days, 0), 5) * 0.4
      + CASE WHEN p.last_seen >= now() - interval '24 hours' THEN 2 ELSE 0 END
    )::numeric AS rarity_score
  FROM public.profiles p
  WHERE p.user_id <> v_uid
    AND COALESCE(p.is_seed, false) = false
    AND COALESCE(p.is_test_account, false) = false
    AND COALESCE(p.banned, false) = false
    AND p.plan_type IN ('premium', 'vip', 'monthly')
    AND p.last_seen >= now() - interval '7 days'
  ORDER BY rarity_score DESC, p.last_seen DESC
  LIMIT GREATEST(1, p_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_ensure_daily_quests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_get_daily_quests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_progress_quest(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_claim_quest(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_rare_connections(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
