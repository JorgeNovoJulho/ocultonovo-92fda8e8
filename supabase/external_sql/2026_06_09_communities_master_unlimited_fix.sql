-- =====================================================================
-- Comunidades Ocultas — Master admin ILIMITADO (correção do cast app_role)
-- Idempotente. Execute no SQL Editor do Supabase EXTERNO.
-- =====================================================================
-- Bug: a versão anterior chamava has_role(uid, 'admin_master') sem o cast
-- ::app_role; o Postgres lançava undefined_function, o EXCEPTION engolia,
-- v_is_master ficava false e o master continuava limitado.
-- Correção: usar 'admin_master'::public.app_role.
-- =====================================================================

-- 1) community_can_create — master bypass corrigido
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
  -- Master admin bypass (com cast correto para app_role)
  BEGIN
    SELECT public.has_role(_user, 'admin_master'::public.app_role) INTO v_is_master;
  EXCEPTION WHEN OTHERS THEN
    v_is_master := false;
  END;

  IF v_is_master THEN
    RETURN jsonb_build_object('allowed', true, 'limit', 999999, 'current', 0, 'master', true);
  END IF;

  SELECT * INTO v_settings FROM public.oculto_community_settings LIMIT 1;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  END IF;

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

  RETURN jsonb_build_object('allowed', true, 'limit', v_limit, 'current', v_count, 'beta', v_beta);
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_can_create(UUID) TO authenticated;

-- 2) community_create — master bypass corrigido
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

  BEGIN
    SELECT public.has_role(auth.uid(), 'admin_master'::public.app_role) INTO v_is_master;
  EXCEPTION WHEN OTHERS THEN
    v_is_master := false;
  END;

  IF NOT v_is_master THEN
    v_can := public.community_can_create(auth.uid());
    IF NOT (v_can->>'allowed')::BOOLEAN THEN
      RAISE EXCEPTION 'cannot_create: %', v_can->>'reason';
    END IF;
  END IF;

  SELECT * INTO v_settings FROM public.oculto_community_settings LIMIT 1;
  IF v_settings.require_admin_approval_for_new_communities AND NOT v_is_master THEN
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

-- 3) Validação automática segura: confirma que @oculto_master cria sem pending_review
CREATE OR REPLACE FUNCTION public.community_master_create_validation()
RETURNS TABLE(ok boolean, created_status text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master uuid;
  v_id uuid;
  v_slug text := 'oculto-master-validation-' || replace(gen_random_uuid()::text, '-', '');
  v_status text;
BEGIN
  SELECT p.user_id INTO v_master
    FROM public.profiles p
   WHERE lower(COALESCE(p.username, '')) = 'oculto_master'
      OR lower(COALESCE(p.email, '')) = 'ocultomaster@ocultoswing.com.br'
   LIMIT 1;

  IF v_master IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'master_profile_not_found'::text;
    RETURN;
  END IF;

  INSERT INTO public.oculto_communities(
    owner_id, title, slug, description, visibility, status, is_adult, last_activity_at
  ) VALUES (
    v_master, 'Validação Master', v_slug, 'Validação automática removida após execução.', 'public', 'active', false, now()
  ) RETURNING id, status INTO v_id, v_status;

  INSERT INTO public.oculto_community_members(community_id, user_id, role, status, joined_at)
  VALUES (v_id, v_master, 'owner', 'active', now())
  ON CONFLICT (community_id, user_id) DO NOTHING;

  DELETE FROM public.oculto_communities WHERE id = v_id;

  RETURN QUERY SELECT (v_status <> 'pending_review'), v_status, NULL::text;
EXCEPTION WHEN OTHERS THEN
  IF v_id IS NOT NULL THEN
    DELETE FROM public.oculto_communities WHERE id = v_id;
  END IF;
  RETURN QUERY SELECT false, COALESCE(v_status, NULL)::text, SQLERRM::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_master_create_validation() TO authenticated;

NOTIFY pgrst, 'reload schema';
