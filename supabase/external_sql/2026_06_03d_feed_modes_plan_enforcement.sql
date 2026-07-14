-- ============================================================
-- ETAPA 4 — Enforcement de plano para Modos de Feed (server-side)
-- Externo: rvybbrkzmboqbhcemqar.supabase.co
-- Idempotente
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_feed_mode(p_mode text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_cfg       record;
  v_user_plan text;
  v_rank      int;
  v_min_rank  int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_cfg FROM public.oculto_feed_modes_config WHERE mode_id = p_mode;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RAISE EXCEPTION 'mode_not_available';
  END IF;

  -- Lê o plano efetivo do usuário (free/premium/vip)
  SELECT COALESCE(plan_type, 'free') INTO v_user_plan
    FROM public.profiles
   WHERE id = v_uid OR user_id = v_uid
   LIMIT 1;

  v_user_plan := COALESCE(v_user_plan, 'free');

  v_rank := CASE v_user_plan WHEN 'vip' THEN 3 WHEN 'premium' THEN 2 ELSE 1 END;
  v_min_rank := CASE v_cfg.min_plan WHEN 'vip' THEN 3 WHEN 'premium' THEN 2 ELSE 1 END;

  IF v_rank < v_min_rank THEN
    RAISE EXCEPTION 'plan_insufficient: requires %', v_cfg.min_plan;
  END IF;

  UPDATE public.profiles
     SET feed_mode = p_mode
   WHERE id = v_uid OR user_id = v_uid;

  RETURN p_mode;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_feed_mode(text) TO authenticated;
