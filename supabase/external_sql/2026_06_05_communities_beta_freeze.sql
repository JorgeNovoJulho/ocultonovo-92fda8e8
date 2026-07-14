-- =====================================================================
-- Comunidades Ocultas — Beta liberado para Free + Congelamento pós-beta
-- Idempotente. Execute no SQL Editor do Supabase externo
-- (rvybbrkzmboqbhcemqar).
-- =====================================================================

-- 1) community_can_create: durante o beta (platform_runtime_settings.platform_mode='beta'
--    e beta_enabled=true) usuários FREE podem criar até 1 comunidade,
--    mesmo que oculto_community_settings.allow_free_create=false.
CREATE OR REPLACE FUNCTION public.community_can_create(_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_settings RECORD;
  v_runtime RECORD;
  v_count INTEGER;
  v_limit INTEGER;
  v_beta BOOLEAN := false;
BEGIN
  SELECT * INTO v_settings FROM public.oculto_community_settings LIMIT 1;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  END IF;

  -- Verifica beta ativo
  BEGIN
    SELECT platform_mode, beta_enabled
      INTO v_runtime
      FROM public.platform_runtime_settings
      LIMIT 1;
    IF FOUND AND v_runtime.platform_mode = 'beta' AND COALESCE(v_runtime.beta_enabled, false) THEN
      v_beta := true;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    v_beta := false;
  END;

  SELECT COALESCE(plan_type, 'free') INTO v_plan FROM public.profiles WHERE id = _user;

  IF v_plan = 'vip' THEN
    v_limit := v_settings.vip_max_communities;
  ELSIF v_plan IN ('premium','monthly') THEN
    IF NOT v_settings.allow_premium_create THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_allowed');
    END IF;
    v_limit := v_settings.premium_max_communities;
  ELSE
    -- Free: liberado durante o beta (1 comunidade); fora do beta segue regra normal.
    IF v_beta THEN
      v_limit := 1;
    ELSE
      IF NOT v_settings.allow_free_create THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_allowed');
      END IF;
      v_limit := 1;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.oculto_communities
   WHERE owner_id = _user AND status IN ('active','pending_review','frozen');

  IF v_count >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached',
                              'limit', v_limit, 'current', v_count);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'limit', v_limit, 'current', v_count,
                            'beta', v_beta);
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_can_create(UUID) TO authenticated;


-- 2) Função para congelar comunidades de donos FREE quando o beta terminar.
--    Idempotente — pode ser chamada manualmente ou agendada via cron.
CREATE OR REPLACE FUNCTION public.community_freeze_free_owners_if_beta_ended()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
  v_affected INTEGER := 0;
BEGIN
  SELECT platform_mode INTO v_mode
    FROM public.platform_runtime_settings
    LIMIT 1;

  IF v_mode IS NULL OR v_mode = 'beta' THEN
    RETURN 0;
  END IF;

  WITH upd AS (
    UPDATE public.oculto_communities c
       SET status = 'frozen'
      FROM public.profiles p
     WHERE p.id = c.owner_id
       AND COALESCE(p.plan_type, 'free') = 'free'
       AND c.status = 'active'
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_affected FROM upd;

  RETURN v_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_freeze_free_owners_if_beta_ended() TO service_role;


-- 3) RPC para o dono Premium/VIP reativar a própria comunidade congelada.
CREATE OR REPLACE FUNCTION public.community_reactivate(_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_status TEXT;
  v_plan TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT owner_id, status INTO v_owner, v_status
    FROM public.oculto_communities WHERE id = _id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'community_not_found';
  END IF;
  IF v_owner <> auth.uid() AND NOT public.oculto_is_master() THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  IF v_status <> 'frozen' THEN
    RETURN true;
  END IF;

  SELECT COALESCE(plan_type, 'free') INTO v_plan
    FROM public.profiles WHERE id = auth.uid();

  IF NOT public.oculto_is_master() AND v_plan NOT IN ('premium','monthly','vip') THEN
    RAISE EXCEPTION 'plan_required';
  END IF;

  UPDATE public.oculto_communities
     SET status = 'active'
   WHERE id = _id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_reactivate(UUID) TO authenticated;
