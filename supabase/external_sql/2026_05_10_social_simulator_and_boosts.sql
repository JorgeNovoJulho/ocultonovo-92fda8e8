-- ============================================================================
-- SOCIAL — SIMULADOR ADMIN + BOOSTS DE RANKING + EDIÇÃO DE TRUST SETTINGS
-- 100% idempotente — cole no SQL Editor do Supabase EXTERNO
-- Pré-requisito: 2026_05_10_social_trust_system.sql + 2026_05_10_social_triggers_and_discount.sql
-- ============================================================================

-- ====== ADMIN: SIMULAR EVENTO (ignora cap/cooldown/seed) ======
CREATE OR REPLACE FUNCTION public.social_admin_simulate_event(
  p_user uuid, p_kind text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule  record;
  v_xp    int;
  v_lvl   int;
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user IS NULL OR p_kind IS NULL THEN RAISE EXCEPTION 'args'; END IF;

  SELECT * INTO v_rule FROM oculto_social_rules WHERE kind = p_kind;
  IF v_rule IS NULL THEN RAISE EXCEPTION 'unknown_kind: %', p_kind; END IF;

  INSERT INTO oculto_social_events(user_id, kind, weight, ref_id)
  VALUES (p_user, p_kind, v_rule.weight, 'sim:' || extract(epoch FROM now())::text);

  INSERT INTO oculto_social_scores(user_id, total_xp, level, last_event_at)
  VALUES (p_user, GREATEST(0, v_rule.weight), 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET total_xp = GREATEST(0, oculto_social_scores.total_xp + v_rule.weight),
        last_event_at = now(),
        updated_at = now()
  RETURNING total_xp INTO v_xp;

  SELECT max(level) INTO v_lvl FROM oculto_social_levels WHERE min_xp <= v_xp;
  v_lvl := coalesce(v_lvl, 1);
  UPDATE oculto_social_scores SET level = v_lvl WHERE user_id = p_user;

  RETURN jsonb_build_object('ok', true, 'xp', v_xp, 'level', v_lvl, 'delta', v_rule.weight);
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_simulate_event(uuid,text) TO authenticated;

-- ====== ADMIN: RESET XP DO USUÁRIO ======
CREATE OR REPLACE FUNCTION public.social_admin_reset_user(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM oculto_social_events WHERE user_id = p_user;
  UPDATE oculto_social_scores
     SET total_xp = 0, level = 1, breakdown = '{}'::jsonb, updated_at = now()
   WHERE user_id = p_user;
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_reset_user(uuid) TO authenticated;

-- ====== ADMIN: BUSCA RÁPIDA DE USUÁRIOS PARA O PICKER ======
CREATE OR REPLACE FUNCTION public.social_admin_search_users(p_query text)
RETURNS TABLE(id uuid, username text, name text, avatar_url text, plan_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.name, p.avatar_url, p.plan_type
    FROM profiles p
   WHERE public._is_master_admin()
     AND (
       p.username ILIKE '%' || coalesce(p_query,'') || '%'
       OR p.name  ILIKE '%' || coalesce(p_query,'') || '%'
     )
     AND coalesce(p.is_seed,false) = false
   ORDER BY p.updated_at DESC NULLS LAST
   LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.social_admin_search_users(text) TO authenticated;

-- ====== ADMIN: SALVAR TRUST SETTING (JSON) ======
CREATE OR REPLACE FUNCTION public.trust_admin_set_setting(p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO oculto_trust_settings(key, value)
  VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_admin_set_setting(text,jsonb) TO authenticated;

-- ====== BOOSTS DE RANKING (boost_radar / boost_aura) ======
-- Retorna multiplicador (1.0 quando sem boost) para cada user_id pedido.
CREATE OR REPLACE FUNCTION public.social_boosts_for_users(
  p_users uuid[], p_kind text
) RETURNS TABLE(user_id uuid, multiplier numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT unnest(p_users) AS uid
  ),
  scored AS (
    SELECT b.uid AS user_id, coalesce(s.level, 1) AS lvl
      FROM base b
      LEFT JOIN oculto_social_scores s ON s.user_id = b.uid
  )
  SELECT
    sc.user_id,
    coalesce(
      (SELECT max(r.value) FROM oculto_social_rewards r
        WHERE r.active AND r.kind = p_kind AND r.level_min <= sc.lvl),
      1
    ) AS multiplier
  FROM scored sc;
$$;
GRANT EXECUTE ON FUNCTION public.social_boosts_for_users(uuid[],text) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
