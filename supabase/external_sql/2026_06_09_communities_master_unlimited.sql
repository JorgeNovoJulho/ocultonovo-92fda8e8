-- =====================================================================
-- Comunidades Ocultas — Master admin ilimitado
-- Idempotente. Execute no SQL Editor do Supabase EXTERNO.
-- =====================================================================
-- Objetivo: permite que o usuário master admin (@oculto_master)
-- crie comunidades sem limites de plano ou quantidade.
-- =====================================================================

-- -------------------------------------------------------------------
-- 1) community_can_create: exceção master admin no topo
-- -------------------------------------------------------------------
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
  v_is_master BOOLEAN := false;
BEGIN
  -- Master admin bypass imediato
  BEGIN
    SELECT public.has_role(_user, 'admin_master') INTO v_is_master;
  EXCEPTION WHEN undefined_function THEN
    v_is_master := false;
  END;

  IF v_is_master THEN
    RETURN jsonb_build_object('allowed', true, 'limit', 9999, 'current', 0, 'master', true);
  END IF;

  SELECT * INTO v_settings FROM public.oculto_community_settings LIMIT 1;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  END IF;

  -- Verifica beta ativo (mantido da versão beta_freeze)
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

-- -------------------------------------------------------------------
-- 2) community_create: garante que master admin passe direto
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_create(
  _title TEXT, _slug TEXT, _description TEXT, _category_id UUID,
  _visibility TEXT DEFAULT 'public', _is_adult BOOLEAN DEFAULT FALSE,
  _cover_url TEXT DEFAULT NULL, _avatar_url TEXT DEFAULT NULL,
  _rules TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can JSONB; v_id UUID; v_status TEXT := 'active'; v_settings RECORD;
  v_is_master BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Master admin bypass
  BEGIN
    SELECT public.has_role(auth.uid(), 'admin_master') INTO v_is_master;
  EXCEPTION WHEN undefined_function THEN
    v_is_master := false;
  END;

  IF NOT v_is_master THEN
    v_can := public.community_can_create(auth.uid());
    IF NOT (v_can->>'allowed')::BOOLEAN THEN
      RAISE EXCEPTION 'cannot_create: %', v_can->>'reason';
    END IF;
  END IF;

  SELECT * INTO v_settings FROM public.oculto_community_settings LIMIT 1;
  IF v_settings.require_admin_approval_for_new_communities THEN
    v_status := 'pending_review';
  END IF;

  INSERT INTO public.oculto_communities(
    owner_id, title, slug, description, category_id, visibility, status,
    is_adult, cover_url, avatar_url, rules, last_activity_at
  ) VALUES (
    auth.uid(), _title, _slug, _description, _category_id, _visibility, v_status,
    _is_adult, _cover_url, _avatar_url, _rules, NOW()
  ) RETURNING id INTO v_id;

  INSERT INTO public.oculto_community_members(community_id, user_id, role, status, joined_at)
  VALUES (v_id, auth.uid(), 'owner', 'active', NOW());

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_create(TEXT,TEXT,TEXT,UUID,TEXT,BOOLEAN,TEXT,TEXT,TEXT) TO authenticated;
