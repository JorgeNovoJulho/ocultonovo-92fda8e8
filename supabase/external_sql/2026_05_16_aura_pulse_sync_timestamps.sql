-- ============================================================================
-- PULSO DE AURA — Sincronia de timing
-- Adiciona `created_at` e `server_now` ao retorno do RPC para que
-- remetente e destinatário tenham EXATAMENTE o mesmo "until" no highlight.
-- 100% idempotente. Reusa toda a lógica da Fase 2.
-- Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

DROP FUNCTION IF EXISTS public.aura_pulse_send(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.aura_pulse_send(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.aura_pulse_send(
  p_room_id    uuid,
  p_target_id  uuid,
  p_message_id uuid DEFAULT NULL,
  p_pulse_type text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_settings public.aura_pulse_settings%ROWTYPE;
  v_target_prefs public.aura_pulse_user_preferences%ROWTYPE;
  v_sender_prefs public.aura_pulse_user_preferences%ROWTYPE;
  v_sender_plan text := 'free';
  v_sender_rank int := 1;
  v_min_rank int := 1;
  v_cooldown int;
  v_limit int;
  v_window int;
  v_last_at timestamptz;
  v_count_in_window int;
  v_pulse_id uuid;
  v_blocked boolean := false;
  v_recent_blocked int := 0;
  v_type text := lower(coalesce(p_pulse_type,'default'));
  v_trust int := 0;
  v_prestige int := 0;
  v_color text;
  v_expires int;
  v_created_at timestamptz;
BEGIN
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated', 'server_now', now());
  END IF;
  IF v_sender = p_target_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_target', 'server_now', now());
  END IF;
  IF v_type NOT IN ('default','premium','rare','silent') THEN
    v_type := 'default';
  END IF;

  SELECT * INTO v_settings FROM public.aura_pulse_settings WHERE id = true;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'disabled', 'server_now', now());
  END IF;

  IF v_type = 'premium' AND NOT v_settings.premium_pulse_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'premium_disabled', 'server_now', now());
  END IF;
  IF v_type = 'rare' AND NOT v_settings.rare_pulse_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rare_disabled', 'server_now', now());
  END IF;

  SELECT * INTO v_sender_prefs FROM public.aura_pulse_user_preferences WHERE user_id = v_sender;
  IF FOUND AND v_sender_prefs.admin_suspended_until IS NOT NULL
     AND v_sender_prefs.admin_suspended_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sender_suspended', 'server_now', now());
  END IF;

  BEGIN
    EXECUTE 'SELECT lower(coalesce(plan_type,''free'')) FROM public.profiles WHERE user_id = $1'
      INTO v_sender_plan USING v_sender;
  EXCEPTION WHEN OTHERS THEN v_sender_plan := 'free';
  END;
  v_sender_rank := public._aura_plan_rank(v_sender_plan);

  BEGIN
    EXECUTE 'SELECT coalesce(trust_score,0)::int FROM public.profiles WHERE user_id = $1'
      INTO v_trust USING v_sender;
  EXCEPTION WHEN OTHERS THEN v_trust := 0;
  END;

  BEGIN
    EXECUTE 'SELECT coalesce(prestige_level,0)::int FROM public.profiles WHERE user_id = $1'
      INTO v_prestige USING v_sender;
  EXCEPTION WHEN OTHERS THEN v_prestige := 0;
  END;

  IF v_type = 'premium' THEN
    v_min_rank := public._aura_plan_rank(v_settings.premium_min_plan);
  ELSIF v_type = 'rare' THEN
    v_min_rank := public._aura_plan_rank(v_settings.rare_min_plan);
    IF v_settings.rare_vip_only AND v_sender_rank < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rare_vip_required', 'server_now', now());
    END IF;
    IF v_trust < v_settings.rare_min_trust_score THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rare_trust_required',
        'required', v_settings.rare_min_trust_score, 'current', v_trust, 'server_now', now());
    END IF;
    IF v_prestige < v_settings.rare_min_prestige_level THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rare_prestige_required',
        'required', v_settings.rare_min_prestige_level, 'current', v_prestige, 'server_now', now());
    END IF;
  ELSE
    IF v_sender_rank = 1 AND NOT v_settings.free_can_send THEN
      RETURN jsonb_build_object('ok', false, 'error', 'plan_required', 'server_now', now());
    END IF;
  END IF;
  IF v_sender_rank < v_min_rank THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_required',
      'required_plan', CASE v_min_rank WHEN 3 THEN 'vip' WHEN 2 THEN 'premium' ELSE 'free' END,
      'server_now', now());
  END IF;

  SELECT * INTO v_target_prefs FROM public.aura_pulse_user_preferences WHERE user_id = p_target_id;
  IF FOUND THEN
    IF NOT v_target_prefs.receive_pulses THEN
      RETURN jsonb_build_object('ok', false, 'error', 'target_opted_out', 'server_now', now());
    END IF;
    IF v_type = 'premium' AND NOT coalesce(v_target_prefs.allow_premium_pulse,true) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'target_blocks_premium', 'server_now', now());
    END IF;
    IF v_type = 'rare' AND NOT coalesce(v_target_prefs.allow_rare_pulse,true) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'target_blocks_rare', 'server_now', now());
    END IF;
  END IF;

  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.blocked_contacts
      WHERE (user_id = p_target_id AND blocked_user_id = v_sender)
         OR (user_id = v_sender AND blocked_user_id = p_target_id)
    ) THEN v_blocked := true; END IF;
  EXCEPTION WHEN OTHERS THEN v_blocked := false;
  END;

  IF v_blocked THEN
    INSERT INTO public.aura_pulses(room_id, sender_id, target_id, message_id, status, pulse_type)
    VALUES (p_room_id, v_sender, p_target_id, p_message_id, 'blocked', v_type);
    RETURN jsonb_build_object('ok', false, 'error', 'blocked', 'server_now', now());
  END IF;

  IF v_type = 'rare' THEN
    v_cooldown := v_settings.rare_cooldown_seconds;
    v_limit    := v_settings.rare_limit_30m;
    v_window   := 30;
    v_color    := v_settings.rare_highlight_color;
    v_expires  := v_settings.rare_highlight_ms;
  ELSIF v_type = 'premium' THEN
    v_cooldown := v_settings.premium_cooldown_seconds;
    v_limit    := v_settings.premium_limit_30m;
    v_window   := 30;
    v_color    := v_settings.premium_highlight_color;
    v_expires  := v_settings.premium_highlight_ms;
  ELSE
    IF v_sender_rank = 3 THEN
      v_cooldown := v_settings.vip_cooldown_seconds;
      v_limit    := v_settings.vip_limit_per_window;
    ELSE
      v_cooldown := v_settings.cooldown_seconds;
      v_limit    := v_settings.limit_per_window;
    END IF;
    v_window  := v_settings.window_minutes;
    v_color   := v_settings.highlight_color;
    v_expires := 12000;
  END IF;

  SELECT count(*) INTO v_recent_blocked
    FROM public.aura_pulses
   WHERE sender_id = v_sender AND status = 'blocked'
     AND created_at > now() - interval '24 hours';
  IF v_recent_blocked >= 3 THEN
    v_cooldown := v_cooldown * 2;
    v_limit := GREATEST(1, v_limit / 2);
  END IF;

  IF v_trust > 0 AND v_trust < 40 THEN
    v_limit := GREATEST(1, v_limit / 2);
  END IF;

  SELECT max(created_at) INTO v_last_at
    FROM public.aura_pulses
   WHERE sender_id = v_sender AND target_id = p_target_id
     AND pulse_type = v_type;
  IF v_last_at IS NOT NULL AND v_last_at > now() - make_interval(secs => v_cooldown) THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'cooldown',
      'retry_after_seconds',
      GREATEST(0, v_cooldown - EXTRACT(EPOCH FROM (now() - v_last_at))::int),
      'server_now', now()
    );
  END IF;

  SELECT count(*) INTO v_count_in_window
    FROM public.aura_pulses
   WHERE sender_id = v_sender
     AND pulse_type = v_type
     AND status <> 'blocked'
     AND created_at > now() - make_interval(mins => v_window);
  IF v_count_in_window >= v_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit',
      'limit', v_limit, 'window_minutes', v_window, 'server_now', now());
  END IF;

  INSERT INTO public.aura_pulses(
    room_id, sender_id, target_id, message_id, status, pulse_type,
    expires_at, metadata
  )
  VALUES (
    p_room_id, v_sender, p_target_id, p_message_id, 'sent', v_type,
    now() + make_interval(secs => GREATEST(60, v_expires/1000)),
    jsonb_build_object('color', v_color, 'highlight_ms', v_expires)
  )
  RETURNING id, created_at INTO v_pulse_id, v_created_at;

  RETURN jsonb_build_object(
    'ok', true,
    'pulse_id', v_pulse_id,
    'pulse_type', v_type,
    'highlight_color', v_color,
    'highlight_ms', v_expires,
    'created_at', v_created_at,
    'server_now', now(),
    'remaining_in_window', GREATEST(0, v_limit - v_count_in_window - 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_pulse_send(
  p_room_id uuid, p_target_id uuid, p_message_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.aura_pulse_send($1, $2, $3, 'default');
$$;
GRANT EXECUTE ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid) TO authenticated;
