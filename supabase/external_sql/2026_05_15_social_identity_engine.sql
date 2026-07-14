-- =====================================================================
-- ONDA A — Social Identity Engine + Aura Dashboard Batch
-- Consolida score + prestige + trust + aura num único RPC.
-- Idempotente. Cole inteiro no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- social_identity_get(p_user uuid)
-- Retorna JSON unificado: { score, prestige, trust, aura, updated_at }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_identity_get(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_score jsonb;
  v_prestige jsonb;
  v_trust jsonb;
  v_aura jsonb;
BEGIN
  v_user := COALESCE(p_user, auth.uid());
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'no_user');
  END IF;

  -- Score
  BEGIN
    SELECT to_jsonb(public.social_score_get(v_user)) INTO v_score;
  EXCEPTION WHEN OTHERS THEN
    v_score := NULL;
  END;

  -- Prestige
  BEGIN
    SELECT to_jsonb(public.social_prestige_get(v_user)) INTO v_prestige;
  EXCEPTION WHEN OTHERS THEN
    v_prestige := NULL;
  END;

  -- Trust score (lê tabela direto)
  BEGIN
    SELECT to_jsonb(t.*) INTO v_trust
    FROM public.user_trust_scores t
    WHERE t.user_id = v_user
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_trust := NULL;
  END;

  -- Aura básica (xp/level/streak) — best-effort
  BEGIN
    SELECT to_jsonb(r) INTO v_aura
    FROM (
      SELECT xp, level, streak_days, xp_in_level, xp_to_next
      FROM public.aura_get_progress()
    ) r
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_aura := NULL;
  END;

  RETURN jsonb_build_object(
    'user_id', v_user,
    'score', v_score,
    'prestige', v_prestige,
    'trust', v_trust,
    'aura', v_aura,
    'updated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.social_identity_get(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- aura_dashboard_get() — best-effort batch
-- Reúne progress + streak + storm/attention/passersby/weekly_chest
-- em UMA chamada. Cada bloco é tolerante (NULL se RPC não existir).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_dashboard_get()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_progress jsonb;
  v_storm jsonb;
  v_attention jsonb;
  v_passersby jsonb;
  v_weekly jsonb;
  v_my_rank jsonb;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'no_user');
  END IF;

  BEGIN
    SELECT to_jsonb(r) INTO v_progress FROM (
      SELECT * FROM public.aura_get_progress() LIMIT 1
    ) r;
  EXCEPTION WHEN OTHERS THEN v_progress := NULL; END;

  BEGIN
    SELECT to_jsonb(r) INTO v_storm FROM (
      SELECT * FROM public.aura_storm_current() LIMIT 1
    ) r;
  EXCEPTION WHEN OTHERS THEN v_storm := NULL; END;

  BEGIN
    SELECT to_jsonb(r) INTO v_attention FROM (
      SELECT * FROM public.aura_attention_get() LIMIT 1
    ) r;
  EXCEPTION WHEN OTHERS THEN v_attention := NULL; END;

  BEGIN
    SELECT to_jsonb(r) INTO v_passersby FROM (
      SELECT * FROM public.aura_passersby_count() LIMIT 1
    ) r;
  EXCEPTION WHEN OTHERS THEN v_passersby := NULL; END;

  BEGIN
    SELECT to_jsonb(r) INTO v_weekly FROM (
      SELECT * FROM public.aura_weekly_chest_status() LIMIT 1
    ) r;
  EXCEPTION WHEN OTHERS THEN v_weekly := NULL; END;

  BEGIN
    SELECT to_jsonb(r) INTO v_my_rank FROM (
      SELECT * FROM public.aura_my_rank() LIMIT 1
    ) r;
  EXCEPTION WHEN OTHERS THEN v_my_rank := NULL; END;

  RETURN jsonb_build_object(
    'user_id', v_user,
    'progress', v_progress,
    'storm', v_storm,
    'attention', v_attention,
    'passersby', v_passersby,
    'weekly_chest', v_weekly,
    'my_rank', v_my_rank,
    'updated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_dashboard_get() TO authenticated;
