-- =============================================================
-- RETENTION V2 — XP CLAIM (resgate manual de XP por missão)
-- Separa "concluída" de "XP resgatado":
--   1) usuário faz a ação  -> mission marcada como COMPLETED (sem XP)
--   2) usuário clica "Resgatar XP" -> XP creditado e mission CLAIMED
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =============================================================

-- 1) Nova coluna p/ controle de resgate (jsonb com array de keys)
ALTER TABLE public.oculto_retention_progress
  ADD COLUMN IF NOT EXISTS claimed_missions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) retention_mission_complete: APENAS marca como concluída (sem XP).
DROP FUNCTION IF EXISTS public.retention_mission_complete(text);
CREATE OR REPLACE FUNCTION public.retention_mission_complete(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_existing jsonb;
  v_exists   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.oculto_retention_missions_config
     WHERE key = p_key AND active = true
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  INSERT INTO public.oculto_retention_progress (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  SELECT completed_missions INTO v_existing
    FROM public.oculto_retention_progress WHERE user_id = v_uid;

  IF v_existing ? p_key THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  UPDATE public.oculto_retention_progress
     SET completed_missions = COALESCE(v_existing,'[]'::jsonb) || to_jsonb(p_key),
         last_active_at     = now(),
         updated_at         = now()
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'completed', true);
END $$;
GRANT EXECUTE ON FUNCTION public.retention_mission_complete(text) TO authenticated;

-- 3) retention_mission_claim_xp: credita o XP (multiplica x2 no dia 7).
DROP FUNCTION IF EXISTS public.retention_mission_claim_xp(text);
CREATE OR REPLACE FUNCTION public.retention_mission_claim_xp(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_xp        int;
  v_done      jsonb;
  v_claimed   jsonb;
  v_user_day  int;
  v_mult      int := 1;
  v_awarded   int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT xp_reward INTO v_xp
    FROM public.oculto_retention_missions_config
    WHERE key = p_key AND active = true;
  IF v_xp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  INSERT INTO public.oculto_retention_progress (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(completed_missions,'[]'::jsonb),
         COALESCE(claimed_missions,'[]'::jsonb),
         COALESCE(retention_day,1)
    INTO v_done, v_claimed, v_user_day
    FROM public.oculto_retention_progress WHERE user_id = v_uid;

  IF NOT (v_done ? p_key) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completed');
  END IF;
  IF v_claimed ? p_key THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true);
  END IF;

  IF COALESCE(v_user_day,1) >= 7 THEN v_mult := 2; END IF;
  v_awarded := v_xp * v_mult;

  UPDATE public.oculto_retention_progress
     SET claimed_missions = v_claimed || to_jsonb(p_key),
         last_active_at   = now(),
         updated_at       = now()
   WHERE user_id = v_uid;

  BEGIN
    PERFORM public.aura_award_xp(v_awarded, 'retention_mission_claim:' || p_key);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'xp_awarded', v_awarded, 'multiplier', v_mult);
END $$;
GRANT EXECUTE ON FUNCTION public.retention_mission_claim_xp(text) TO authenticated;

-- 4) retention_missions_for_me: agora retorna também "claimed"
DROP FUNCTION IF EXISTS public.retention_missions_for_me();
CREATE OR REPLACE FUNCTION public.retention_missions_for_me()
RETURNS TABLE (
  key text, title text, body text, cta_label text, cta_route text,
  icon text, hue int, reward text, sort_order int,
  completed boolean, claimed boolean,
  xp_reward int, day int, is_last_chance boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_day     int  := 1;
  v_done    jsonb := '[]'::jsonb;
  v_claimed jsonb := '[]'::jsonb;
  v_is_d7   boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT COALESCE(p.retention_day,1),
         COALESCE(p.completed_missions,'[]'::jsonb),
         COALESCE(p.claimed_missions,'[]'::jsonb)
    INTO v_day, v_done, v_claimed
    FROM public.oculto_retention_progress p WHERE p.user_id = v_uid;
  v_day     := COALESCE(v_day, 1);
  v_done    := COALESCE(v_done, '[]'::jsonb);
  v_claimed := COALESCE(v_claimed, '[]'::jsonb);
  v_is_d7   := (v_day >= 7);

  IF v_is_d7 THEN
    -- Dia 7: catch-up — só lista missões NÃO concluídas dos dias 1..6
    -- (uma vez concluída e resgatada, sai da lista).
    RETURN QUERY
    SELECT m.key, m.title, m.body, m.cta_label, m.cta_route, m.icon, m.hue, m.reward, m.sort_order,
           (v_done ? m.key)     AS completed,
           (v_claimed ? m.key)  AS claimed,
           (m.xp_reward * 2)::int AS xp_reward,
           m.day, true AS is_last_chance
      FROM public.oculto_retention_missions_config m
     WHERE m.active = true
       AND m.day BETWEEN 1 AND 6
       AND NOT (v_claimed ? m.key)
     ORDER BY m.day ASC, m.sort_order ASC;
  ELSE
    RETURN QUERY
    SELECT m.key, m.title, m.body, m.cta_label, m.cta_route, m.icon, m.hue, m.reward, m.sort_order,
           (v_done ? m.key)    AS completed,
           (v_claimed ? m.key) AS claimed,
           m.xp_reward, m.day, false AS is_last_chance
      FROM public.oculto_retention_missions_config m
     WHERE m.active = true AND m.day = v_day
     ORDER BY (v_claimed ? m.key) ASC,
              (v_done ? m.key)    ASC,
              m.sort_order ASC;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.retention_missions_for_me() TO authenticated;

NOTIFY pgrst, 'reload schema';
