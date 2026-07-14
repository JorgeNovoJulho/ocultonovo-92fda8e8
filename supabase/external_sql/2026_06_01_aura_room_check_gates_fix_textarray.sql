-- Fix: v_reasons como text[] (estava como jsonb numa versão anterior).
-- Cole no SQL Editor do Supabase EXTERNO.

DROP FUNCTION IF EXISTS public._aura_room_check_gates(text, uuid);

CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_uid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room    record;
  v_prof    record;
  v_gender  text;
  v_plan    text;
  v_reasons text[] := ARRAY[]::text[];
BEGIN
  IF p_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reasons', to_jsonb(ARRAY['no_auth']::text[]));
  END IF;
  BEGIN
    IF public._aura_is_master(p_uid) THEN
      RETURN jsonb_build_object('allowed', true, 'master', true, 'reasons', '[]'::jsonb);
    END IF;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reasons', to_jsonb(ARRAY['room_not_found']::text[]));
  END IF;
  IF COALESCE(v_room.open_to_all, false) THEN
    RETURN jsonb_build_object('allowed', true, 'reasons', '[]'::jsonb);
  END IF;

  SELECT
    lower(coalesce(p.plan_type,'free')) AS plan_type,
    COALESCE(p.is_verified,false) AS is_verified,
    p.gender, p.profile_type,
    COALESCE(p.aura_level,0) AS aura_level,
    COALESCE((to_jsonb(p)->>'social_score')::int,0) AS social_score,
    COALESCE((to_jsonb(p)->>'prestige_xp')::int,(to_jsonb(p)->>'prestige_points')::int,(to_jsonb(p)->>'xp')::int,0) AS prestige_xp
  INTO v_prof FROM public.profiles p WHERE p.user_id = p_uid;

  v_plan   := COALESCE(v_prof.plan_type,'free');
  v_gender := public._aura_normalize_gender(v_prof.gender, v_prof.profile_type);

  IF COALESCE(v_room.vip_only,false) AND v_plan NOT IN ('vip','vip_plus') THEN
    v_reasons := array_append(v_reasons,'plan_vip_required'); END IF;
  IF lower(coalesce(v_room.required_plan,''))='premium' AND v_plan NOT IN ('premium','vip','vip_plus') THEN
    v_reasons := array_append(v_reasons,'plan_premium_required'); END IF;
  IF lower(coalesce(v_room.required_plan,''))='vip' AND v_plan NOT IN ('vip','vip_plus') THEN
    v_reasons := array_append(v_reasons,'plan_vip_required'); END IF;
  IF COALESCE(v_room.requires_kyc,false) AND NOT COALESCE(v_prof.is_verified,false) THEN
    v_reasons := array_append(v_reasons,'kyc_required'); END IF;
  IF COALESCE(v_room.couple_only,false) AND v_gender IS DISTINCT FROM 'casal' THEN
    v_reasons := array_append(v_reasons,'couple_only'); END IF;
  IF v_room.allowed_genders IS NOT NULL AND array_length(v_room.allowed_genders,1) IS NOT NULL THEN
    IF v_gender IS NULL OR NOT (v_gender = ANY(v_room.allowed_genders)) THEN
      v_reasons := array_append(v_reasons,'gender_not_allowed'); END IF;
  END IF;
  IF COALESCE(v_room.min_aura_level,0)   > v_prof.aura_level   THEN v_reasons := array_append(v_reasons,'aura_level_low'); END IF;
  IF COALESCE(v_room.min_social_score,0) > v_prof.social_score THEN v_reasons := array_append(v_reasons,'social_score_low'); END IF;
  IF COALESCE(v_room.min_prestige_xp,0)  > v_prof.prestige_xp  THEN v_reasons := array_append(v_reasons,'prestige_low'); END IF;

  RETURN jsonb_build_object('allowed',(array_length(v_reasons,1) IS NULL),'reasons',to_jsonb(v_reasons));
END; $$;

GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
