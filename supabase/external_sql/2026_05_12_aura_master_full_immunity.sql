-- =============================================================================
-- Hotfix: imunidade total do Master em todas as funções da Aura Match.
-- - _aura_is_master agora reconhece e-mail ocultomaster@ + role admin/master.
-- - _aura_room_check_gates retorna allowed=true para Master.
-- - aura_rooms_list / aura_room_join / aura_room_post_message respeitam Master.
-- Idempotente: pode rodar várias vezes.
-- =============================================================================

-- Dropa assinaturas antigas (param name antigo era p_user) antes de recriar
DROP FUNCTION IF EXISTS public._aura_room_check_gates(text, uuid);
DROP FUNCTION IF EXISTS public._aura_is_master(uuid);

CREATE OR REPLACE FUNCTION public._aura_is_master(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT lower(email) IN ('ocultomaster@ocultoswing.com.br','ocultomaster@oculto.com.br')
       FROM auth.users WHERE id = p_uid),
    false
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_uid AND role IN ('admin','master','super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = p_uid AND lower(coalesce(username,'')) = 'ocultomaster'
  );
$$;
GRANT EXECUTE ON FUNCTION public._aura_is_master(uuid) TO authenticated;

-- Cure do gate: Master sempre allowed.
CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room   record;
  v_prof   record;
  v_reasons text[] := '{}';
BEGIN
  IF public._aura_is_master(p_uid) THEN
    RETURN jsonb_build_object('allowed', true, 'master', true, 'reasons', '[]'::jsonb);
  END IF;

  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reasons', jsonb_build_array('room_not_found'));
  END IF;
  IF COALESCE(v_room.open_to_all, false) THEN
    RETURN jsonb_build_object('allowed', true, 'reasons', '[]'::jsonb);
  END IF;

  SELECT plan_type, is_verified, COALESCE(social_score,0) AS social_score,
         COALESCE(prestige_xp,0) AS prestige_xp, COALESCE(aura_level,0) AS aura_level
    INTO v_prof FROM public.profiles WHERE user_id = p_uid;

  IF COALESCE(v_room.vip_only, false)
     AND lower(COALESCE(v_prof.plan_type,'free')) NOT IN ('vip','premium','vip_plus') THEN
    v_reasons := v_reasons || 'vip_required';
  END IF;
  IF COALESCE(v_room.requires_kyc, false) AND COALESCE(v_prof.is_verified,false) = false THEN
    v_reasons := v_reasons || 'kyc_required';
  END IF;
  IF COALESCE(v_room.min_aura_level,0) > COALESCE(v_prof.aura_level,0) THEN
    v_reasons := v_reasons || 'aura_level';
  END IF;
  IF COALESCE(v_room.min_social_score,0) > COALESCE(v_prof.social_score,0) THEN
    v_reasons := v_reasons || 'social_score';
  END IF;
  IF COALESCE(v_room.min_prestige_xp,0) > COALESCE(v_prof.prestige_xp,0) THEN
    v_reasons := v_reasons || 'prestige_xp';
  END IF;

  RETURN jsonb_build_object(
    'allowed', array_length(v_reasons,1) IS NULL,
    'reasons', to_jsonb(v_reasons)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
