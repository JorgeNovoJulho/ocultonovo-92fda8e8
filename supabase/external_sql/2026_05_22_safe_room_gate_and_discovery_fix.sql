-- ============================================================================
-- SAFE FIX — Salas Aura + Reconciliação Discovery
-- Compatível com banco externo mesmo sem public.looking_now_matches
-- Idempotente. Pode colar inteiro no SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_room_presence (
  room_slug   text NOT NULL,
  user_id     uuid NOT NULL,
  entered_at  timestamptz NOT NULL DEFAULT now(),
  last_ping   timestamptz NOT NULL DEFAULT now(),
  is_observer boolean NOT NULL DEFAULT false,
  PRIMARY KEY (room_slug, user_id)
);

CREATE TABLE IF NOT EXISTS public.oculto_aura_room_waitlist (
  room_slug   text NOT NULL,
  user_id     uuid NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_slug, user_id)
);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_presence_active
  ON public.oculto_aura_room_presence (room_slug, last_ping DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_waitlist_room_time
  ON public.oculto_aura_room_waitlist (room_slug, enqueued_at ASC);

ALTER TABLE public.oculto_discovery_likes
  ADD COLUMN IF NOT EXISTS matched_at timestamptz;

ALTER TABLE public.oculto_discovery_likes
  ADD COLUMN IF NOT EXISTS match_id uuid;

CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room record;
  v_plan text := 'free';
  v_verified boolean := false;
  v_aura_level int := 0;
  v_social_xp int := 0;
  v_prestige_xp int := 0;
  v_reasons text[] := '{}';
  v_profile_sql text;
  v_has_plan_type boolean;
  v_has_is_verified boolean;
  v_has_document_verified boolean;
  v_has_aura_level boolean;
  v_has_prestige_xp boolean;
  v_has_open_to_all boolean;
  v_has_active boolean;
  v_jsonb jsonb;
  v_is_master boolean := false;
BEGIN
  IF p_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reasons', jsonb_build_array('no_auth'));
  END IF;

  BEGIN
    v_is_master := public._aura_is_master(p_uid);
  EXCEPTION WHEN OTHERS THEN
    v_is_master := false;
  END;

  IF v_is_master THEN
    RETURN jsonb_build_object('allowed', true, 'master', true, 'reasons', '[]'::jsonb);
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'oculto_aura_rooms' AND column_name = 'active'
         ),
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'oculto_aura_rooms' AND column_name = 'open_to_all'
         )
    INTO v_has_active, v_has_open_to_all;

  EXECUTE format(
    'SELECT * FROM public.oculto_aura_rooms WHERE slug = $1 %s LIMIT 1',
    CASE WHEN v_has_active THEN 'AND active = true' ELSE '' END
  ) INTO v_room USING p_slug;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reasons', jsonb_build_array('room_not_found'));
  END IF;

  IF v_has_open_to_all AND COALESCE(v_room.open_to_all, false) THEN
    RETURN jsonb_build_object('allowed', true, 'reasons', '[]'::jsonb, 'open', true);
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'plan_type'
         ),
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_verified'
         ),
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'document_verified'
         ),
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'aura_level'
         ),
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'prestige_xp'
         )
    INTO v_has_plan_type, v_has_is_verified, v_has_document_verified, v_has_aura_level, v_has_prestige_xp;

  v_profile_sql := format(
    'SELECT %s AS plan_type, %s AS verified, %s AS aura_level, %s AS prestige_xp
       FROM public.profiles
      WHERE user_id = $1
      LIMIT 1',
    CASE WHEN v_has_plan_type THEN 'COALESCE(plan_type, ''free'')' ELSE '''free''' END,
    CASE
      WHEN v_has_is_verified AND v_has_document_verified THEN 'COALESCE(is_verified,false) OR COALESCE(document_verified,false)'
      WHEN v_has_document_verified THEN 'COALESCE(document_verified,false)'
      WHEN v_has_is_verified THEN 'COALESCE(is_verified,false)'
      ELSE 'false'
    END,
    CASE WHEN v_has_aura_level THEN 'COALESCE(aura_level,0)' ELSE '0' END,
    CASE WHEN v_has_prestige_xp THEN 'COALESCE(prestige_xp,0)' ELSE '0' END
  );

  EXECUTE v_profile_sql INTO v_plan, v_verified, v_aura_level, v_prestige_xp USING p_uid;

  BEGIN
    SELECT COALESCE(total_xp, 0)
      INTO v_social_xp
      FROM public.oculto_social_scores
     WHERE user_id = p_uid
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_social_xp := 0;
  END;

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

  IF COALESCE(v_room.requires_kyc, false) AND NOT COALESCE(v_verified, false) THEN
    v_reasons := v_reasons || 'kyc_required';
  END IF;

  IF COALESCE(v_room.couple_only, false) THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = p_uid
          AND lower(COALESCE(profile_type, '')) IN ('couple', 'casal')
      ) THEN
        v_reasons := v_reasons || 'couple_only';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_reasons := v_reasons || 'couple_only';
    END;
  END IF;

  IF COALESCE(v_room.min_aura_level, 0) > COALESCE(v_aura_level, 0) THEN
    v_reasons := v_reasons || 'aura_level_low';
  END IF;

  IF COALESCE(v_room.min_social_score, 0) > COALESCE(v_social_xp, 0) THEN
    v_reasons := v_reasons || 'social_score_low';
  END IF;

  IF COALESCE(v_room.min_prestige_xp, 0) > COALESCE(v_prestige_xp, 0) THEN
    v_reasons := v_reasons || 'prestige_low';
  END IF;

  RETURN jsonb_build_object(
    'allowed', array_length(v_reasons, 1) IS NULL,
    'observer', array_length(v_reasons, 1) IS NOT NULL,
    'reasons', to_jsonb(v_reasons),
    'reason', CASE WHEN array_length(v_reasons, 1) IS NULL THEN NULL ELSE v_reasons[1] END,
    'have', jsonb_build_object(
      'aura_level', COALESCE(v_aura_level, 0),
      'social_score', COALESCE(v_social_xp, 0),
      'prestige_xp', COALESCE(v_prestige_xp, 0),
      'plan', COALESCE(v_plan, 'free'),
      'verified', COALESCE(v_verified, false)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_room_preview_gate(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._aura_room_check_gates(p_slug, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_preview_gate(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.aura_room_join(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check jsonb;
  v_obs boolean;
  v_count int := 0;
  v_cap int := 12;
  v_pos int := NULL;
  v_open boolean := false;
  v_master boolean := false;
  v_has_open_to_all boolean;
  v_has_max_capacity boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_auth', 'reasons', jsonb_build_array('no_auth'));
  END IF;

  BEGIN
    v_master := public._aura_is_master(v_uid);
  EXCEPTION WHEN OTHERS THEN
    v_master := false;
  END;

  v_check := public._aura_room_check_gates(p_slug, v_uid);
  v_obs := NOT COALESCE((v_check->>'allowed')::boolean, false);

  SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'oculto_aura_rooms' AND column_name = 'open_to_all'
         ),
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'oculto_aura_rooms' AND column_name = 'max_capacity'
         )
    INTO v_has_open_to_all, v_has_max_capacity;

  EXECUTE format(
    'SELECT %s, %s FROM public.oculto_aura_rooms WHERE slug = $1 LIMIT 1',
    CASE WHEN v_has_max_capacity THEN 'COALESCE(max_capacity, 12)' ELSE '12' END,
    CASE WHEN v_has_open_to_all THEN 'COALESCE(open_to_all, false)' ELSE 'false' END
  ) INTO v_cap, v_open USING p_slug;

  IF v_open THEN
    v_obs := false;
  END IF;

  IF v_master THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, false, now())
    ON CONFLICT (room_slug, user_id)
    DO UPDATE SET last_ping = now(), is_observer = false;

    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'reasons', '[]'::jsonb, 'master', true);
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
      'reasons', jsonb_build_array('room_full'),
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
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'reasons', '[]'::jsonb, 'open', true);
  END IF;

  RETURN v_check;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_join(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_discovery_match_state_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF to_regclass('public.looking_now_matches') IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'looking_now_matches_missing'
    );
  END IF;

  EXECUTE $sql$
    WITH active_pairs AS (
      SELECT id AS match_id, user1_id, user2_id, matched_at, COALESCE(is_expired, false) AS is_expired
      FROM public.looking_now_matches
    ), patched AS (
      UPDATE public.oculto_discovery_likes odl
         SET status = CASE WHEN ap.is_expired THEN 'cancelled' ELSE 'matched' END,
             match_id = ap.match_id,
             matched_at = CASE
               WHEN ap.is_expired THEN COALESCE(odl.matched_at, ap.matched_at, now())
               ELSE COALESCE(ap.matched_at, odl.matched_at, now())
             END
        FROM active_pairs ap
       WHERE odl.source = 'explorar_misteriosos'
         AND (
           (odl.user_profile_id = ap.user1_id AND odl.target_profile_id = ap.user2_id)
           OR
           (odl.user_profile_id = ap.user2_id AND odl.target_profile_id = ap.user1_id)
         )
         AND (
           odl.status IS DISTINCT FROM CASE WHEN ap.is_expired THEN 'cancelled' ELSE 'matched' END
           OR odl.match_id IS DISTINCT FROM ap.match_id
           OR (NOT ap.is_expired AND odl.matched_at IS NULL)
         )
      RETURNING 1
    )
    SELECT count(*) FROM patched
  $sql$ INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'updated_rows', v_updated, 'skipped', false);
END;
$$;

SELECT public.reconcile_discovery_match_state_safe();

NOTIFY pgrst, 'reload schema';