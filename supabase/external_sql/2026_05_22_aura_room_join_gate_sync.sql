-- =============================================================
-- HOTFIX 2026-05-22 — Aura Room Join + Gate Sync
-- Corrige o fluxo real de entrada em TODAS as salas para usar
-- as fontes canônicas de Aura / Score Social / Prestígio.
-- Idempotente. Execute no SQL Editor do Supabase EXTERNO.
-- =============================================================

CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room        record;
  v_plan        text;
  v_is_verified boolean;
  v_aura_level  int := 0;
  v_social_xp   int := 0;
  v_prestige_xp int := 0;
  v_reasons     text[] := '{}';
  v_jsonb       jsonb;
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

  SELECT plan_type,
         COALESCE(is_verified, false),
         COALESCE(aura_level, 0),
         COALESCE(prestige_xp, 0)
    INTO v_plan, v_is_verified, v_aura_level, v_prestige_xp
    FROM public.profiles
   WHERE user_id = p_uid;

  BEGIN
    SELECT COALESCE(total_xp, 0)
      INTO v_social_xp
      FROM public.oculto_social_scores
     WHERE user_id = p_uid;
  EXCEPTION WHEN OTHERS THEN
    v_social_xp := 0;
  END;

  v_social_xp := COALESCE(v_social_xp, 0);

  BEGIN
    v_jsonb := public.social_prestige_get(p_uid);
    IF v_jsonb IS NOT NULL THEN
      v_prestige_xp := GREATEST(
        v_prestige_xp,
        COALESCE((v_jsonb->>'xp')::int, (v_jsonb->>'total_xp')::int, 0)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF COALESCE(v_room.vip_only, false)
     AND lower(COALESCE(v_plan, 'free')) NOT IN ('vip', 'premium', 'vip_plus') THEN
    v_reasons := v_reasons || 'plan_vip_required';
  END IF;

  IF lower(COALESCE(v_room.required_plan, '')) = 'premium'
     AND lower(COALESCE(v_plan, 'free')) NOT IN ('premium', 'vip', 'vip_plus') THEN
    v_reasons := v_reasons || 'plan_premium_required';
  END IF;

  IF lower(COALESCE(v_room.required_plan, '')) = 'vip'
     AND lower(COALESCE(v_plan, 'free')) NOT IN ('vip', 'vip_plus') THEN
    v_reasons := v_reasons || 'plan_vip_required';
  END IF;

  IF COALESCE(v_room.requires_kyc, false) AND v_is_verified = false THEN
    v_reasons := v_reasons || 'kyc_required';
  END IF;

  IF COALESCE(v_room.min_aura_level, 0) > v_aura_level THEN
    v_reasons := v_reasons || 'aura_level_low';
  END IF;

  IF COALESCE(v_room.min_social_score, 0) > v_social_xp THEN
    v_reasons := v_reasons || 'social_score_low';
  END IF;

  IF COALESCE(v_room.min_prestige_xp, 0) > v_prestige_xp THEN
    v_reasons := v_reasons || 'prestige_low';
  END IF;

  RETURN jsonb_build_object(
    'allowed', array_length(v_reasons, 1) IS NULL,
    'reasons', to_jsonb(v_reasons),
    'have', jsonb_build_object(
      'aura_level', v_aura_level,
      'social_score', v_social_xp,
      'prestige_xp', v_prestige_xp,
      'plan', COALESCE(v_plan, 'free'),
      'verified', v_is_verified
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_room_preview_gate(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  v := public._aura_room_check_gates(p_slug, auth.uid());
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_preview_gate(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.aura_room_join(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check jsonb;
  v_obs boolean;
  v_count int;
  v_cap int;
  v_master boolean;
  v_pos int;
  v_open boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_auth');
  END IF;

  v_master := public._aura_is_master(v_uid);
  v_check := public._aura_room_check_gates(p_slug, v_uid);
  v_obs := NOT COALESCE((v_check->>'allowed')::boolean, false);

  SELECT COALESCE(max_capacity, 12), COALESCE(open_to_all, false)
    INTO v_cap, v_open
    FROM public.oculto_aura_rooms
   WHERE slug = p_slug;

  v_cap := COALESCE(v_cap, 12);
  IF v_open THEN v_obs := false; END IF;

  IF v_master THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, false, now())
    ON CONFLICT (room_slug, user_id)
    DO UPDATE SET last_ping = now(), is_observer = false;

    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'master', true);
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.oculto_aura_room_presence
   WHERE room_slug = p_slug
     AND last_ping > now() - interval '2 minutes'
     AND is_observer = false;

  IF v_count >= v_cap AND NOT v_obs THEN
    INSERT INTO public.oculto_aura_room_waitlist(room_slug, user_id)
    VALUES (p_slug, v_uid)
    ON CONFLICT (room_slug, user_id) DO NOTHING;

    SELECT count(*)
      INTO v_pos
      FROM public.oculto_aura_room_waitlist
     WHERE room_slug = p_slug
       AND enqueued_at <= COALESCE(
         (SELECT enqueued_at
            FROM public.oculto_aura_room_waitlist
           WHERE room_slug = p_slug AND user_id = v_uid),
         now()
       );

    RETURN jsonb_build_object(
      'allowed', false,
      'observer', false,
      'reason', 'room_full',
      'queued', true,
      'position', v_pos,
      'capacity', v_cap
    );
  END IF;

  INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
  VALUES (p_slug, v_uid, v_obs, now())
  ON CONFLICT (room_slug, user_id) DO UPDATE
    SET last_ping = now(), is_observer = EXCLUDED.is_observer;

  IF v_open THEN
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'open', true);
  END IF;

  RETURN v_check;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_join(text) TO authenticated;

NOTIFY pgrst, 'reload schema';