-- =====================================================================
-- Aura Match — Gate por gênero/tipo + Preview RPC + Config das 5 salas
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Coluna allowed_genders (lista canônica em PT: homem/mulher/casal/trans)
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS allowed_genders text[] NOT NULL DEFAULT '{}'::text[];

-- 2) Normalizador de gênero (combina profiles.gender + profile_type)
CREATE OR REPLACE FUNCTION public._aura_normalize_gender(p_gender text, p_profile_type text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(NULLIF(trim(p_gender),''), NULLIF(trim(p_profile_type),''), ''))
    WHEN 'homem'         THEN 'homem'
    WHEN 'man'           THEN 'homem'
    WHEN 'male'          THEN 'homem'
    WHEN 'mulher'        THEN 'mulher'
    WHEN 'woman'         THEN 'mulher'
    WHEN 'female'        THEN 'mulher'
    WHEN 'casal'         THEN 'casal'
    WHEN 'couple'        THEN 'casal'
    WHEN 'couples'       THEN 'casal'
    WHEN 'trans'         THEN 'trans'
    WHEN 'trans_man'     THEN 'trans'
    WHEN 'trans_woman'   THEN 'trans'
    WHEN 'transgender'   THEN 'trans'
    WHEN 'travesti'      THEN 'trans'
    WHEN 'single'        THEN NULL  -- single sem gênero definido: cai no fallback
    ELSE NULL
  END;
$$;
GRANT EXECUTE ON FUNCTION public._aura_normalize_gender(text, text) TO authenticated;

-- 3) Núcleo do gate (inclui couple_only, allowed_genders, plan_premium_required)
DROP FUNCTION IF EXISTS public._aura_room_check_gates(text, uuid);
CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room    record;
  v_prof    record;
  v_gender  text;
  v_reasons text[] := '{}'::text[];
  v_plan    text;
BEGIN
  IF p_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reasons', jsonb_build_array('no_auth'));
  END IF;

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

  SELECT plan_type, is_verified, gender, profile_type,
         COALESCE(social_score, 0)  AS social_score,
         COALESCE(prestige_xp, 0)   AS prestige_xp,
         COALESCE(aura_level, 0)    AS aura_level
    INTO v_prof
    FROM public.profiles WHERE user_id = p_uid;

  v_plan   := lower(coalesce(v_prof.plan_type, 'free'));
  v_gender := public._aura_normalize_gender(v_prof.gender, v_prof.profile_type);

  -- Plano
  IF COALESCE(v_room.vip_only, false) AND v_plan NOT IN ('vip','vip_plus') THEN
    v_reasons := v_reasons || 'plan_vip_required';
  END IF;
  IF lower(coalesce(v_room.required_plan,'')) = 'premium'
     AND v_plan NOT IN ('premium','vip','vip_plus') THEN
    v_reasons := v_reasons || 'plan_premium_required';
  END IF;
  IF lower(coalesce(v_room.required_plan,'')) = 'vip'
     AND v_plan NOT IN ('vip','vip_plus') THEN
    v_reasons := v_reasons || 'plan_vip_required';
  END IF;

  -- KYC
  IF COALESCE(v_room.requires_kyc, false) AND COALESCE(v_prof.is_verified, false) = false THEN
    v_reasons := v_reasons || 'kyc_required';
  END IF;

  -- Casal-only
  IF COALESCE(v_room.couple_only, false) AND v_gender IS DISTINCT FROM 'casal' THEN
    v_reasons := v_reasons || 'couple_only';
  END IF;

  -- Whitelist de gêneros/tipos permitidos
  IF v_room.allowed_genders IS NOT NULL
     AND array_length(v_room.allowed_genders, 1) IS NOT NULL THEN
    IF v_gender IS NULL OR NOT (v_gender = ANY (v_room.allowed_genders)) THEN
      v_reasons := v_reasons || 'gender_not_allowed';
    END IF;
  END IF;

  -- Aura / Score / Prestígio
  IF COALESCE(v_room.min_aura_level, 0) > v_prof.aura_level THEN
    v_reasons := v_reasons || 'aura_level_low';
  END IF;
  IF COALESCE(v_room.min_social_score, 0) > v_prof.social_score THEN
    v_reasons := v_reasons || 'social_score_low';
  END IF;
  IF COALESCE(v_room.min_prestige_xp, 0) > v_prof.prestige_xp THEN
    v_reasons := v_reasons || 'prestige_low';
  END IF;

  RETURN jsonb_build_object(
    'allowed', array_length(v_reasons, 1) IS NULL,
    'reasons', to_jsonb(v_reasons)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;

-- 4) Preview RPC — read-only, sem escrever em presence/waitlist
CREATE OR REPLACE FUNCTION public.aura_room_preview_gate(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public._aura_room_check_gates(p_slug, auth.uid());
  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_preview_gate(text) TO authenticated, anon;

-- 5) Configuração explícita das 5 salas pedidas pelo usuário
-- ---------------------------------------------------------------
-- 5.1) CASAIS EM SINTONIA — apenas tipo CASAL
UPDATE public.oculto_aura_rooms SET
  couple_only      = true,
  allowed_genders  = ARRAY['casal']::text[],
  open_to_all      = false
WHERE slug = 'casais-em-sintonia';

-- 5.2) LOUNGE SOLTEIROS — homem, mulher, trans (sem casais)
UPDATE public.oculto_aura_rooms SET
  couple_only      = false,
  allowed_genders  = ARRAY['homem','mulher','trans']::text[],
  open_to_all      = false
WHERE slug = 'lounge-solteiros';

-- 5.3) LGBTQIA+ — abre para trans (ênfase), homem, mulher, casal
UPDATE public.oculto_aura_rooms SET
  couple_only      = false,
  allowed_genders  = ARRAY['trans','homem','mulher','casal']::text[],
  open_to_all      = false
WHERE slug = 'lgbtqia-plus';

-- 5.4) ADORAMOS MENAGE — casal, homem, mulher, trans
UPDATE public.oculto_aura_rooms SET
  couple_only      = false,
  allowed_genders  = ARRAY['casal','homem','mulher','trans']::text[],
  open_to_all      = false
WHERE slug = 'adoramos-menage';

-- 5.5) ENERGIA LIVRE — mantém aura 1+ e score 100+, aberto a todos os gêneros
UPDATE public.oculto_aura_rooms SET
  couple_only      = false,
  allowed_genders  = '{}'::text[],
  min_aura_level   = 1,
  min_social_score = 100,
  open_to_all      = false
WHERE slug = 'energia-livre';

NOTIFY pgrst, 'reload schema';
