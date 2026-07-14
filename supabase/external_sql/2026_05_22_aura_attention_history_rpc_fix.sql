-- =====================================================================
-- FIX: histórico de atenção RPC compatível com frontend antigo e novo
-- Idempotente, seguro para executar mais de uma vez.
-- Alvo: Supabase EXTERNO
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_attention_history(
  p_direction text DEFAULT 'all',
  p_limit int DEFAULT 50,
  p_before timestamptz DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  direction text,
  other_user_id uuid,
  other_username text,
  other_name text,
  other_avatar text,
  room_id uuid,
  pulse_type text,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_pulses boolean := to_regclass('public.aura_pulses') IS NOT NULL;
  v_has_settings boolean := to_regclass('public.aura_pulse_settings') IS NOT NULL;
  v_has_prefs boolean := to_regclass('public.aura_pulse_user_preferences') IS NOT NULL;
  v_has_blocks boolean := to_regclass('public.blocked_contacts') IS NOT NULL;
  v_history_enabled boolean := true;
  v_retention int := 30;
  v_max int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_save_history boolean := true;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF v_has_settings THEN
    SELECT
      COALESCE(history_enabled, true),
      COALESCE(history_retention_days, 30),
      LEAST(GREATEST(COALESCE(p_limit, 50), 1), COALESCE(history_max_rows, 200))
    INTO v_history_enabled, v_retention, v_max
    FROM public.aura_pulse_settings
    WHERE id = true;
  END IF;

  IF NOT COALESCE(v_history_enabled, true) THEN
    RETURN;
  END IF;

  IF v_has_prefs THEN
    SELECT COALESCE(save_attention_history, true)
      INTO v_save_history
    FROM public.aura_pulse_user_preferences
    WHERE user_id = v_uid;

    IF COALESCE(v_save_history, true) = false THEN
      RETURN;
    END IF;
  END IF;

  IF v_has_pulses THEN
    RETURN QUERY
    SELECT
      p.id,
      CASE WHEN p.sender_id = v_uid THEN 'sent' ELSE 'received' END AS direction,
      CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END AS other_user_id,
      pr.username,
      COALESCE(pr.name, pr.display_name, pr.username) AS other_name,
      pr.avatar_url,
      p.room_id,
      p.pulse_type,
      p.status,
      p.created_at,
      p.responded_at,
      p.expires_at
    FROM public.aura_pulses p
    LEFT JOIN public.profiles pr
      ON pr.user_id = CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END
    WHERE (p.sender_id = v_uid OR p.target_id = v_uid)
      AND p.status <> 'blocked'
      AND p.created_at > now() - make_interval(days => COALESCE(v_retention, 30))
      AND (p_before IS NULL OR p.created_at < p_before)
      AND (
        p_direction = 'all'
        OR (p_direction = 'received' AND p.target_id = v_uid)
        OR (p_direction = 'sent' AND p.sender_id = v_uid)
        OR (p_direction = 'responded' AND p.status = 'responded')
        OR (
          p_direction = 'expired'
          AND p.status = 'sent'
          AND p.expires_at IS NOT NULL
          AND p.expires_at < now()
        )
      )
      AND (
        NOT v_has_prefs
        OR NOT COALESCE((
          SELECT opp.hide_my_history
          FROM public.aura_pulse_user_preferences opp
          WHERE opp.user_id = CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END
        ), false)
      )
      AND (
        NOT v_has_blocks
        OR NOT EXISTS (
          SELECT 1
          FROM public.blocked_contacts b
          WHERE (b.user_id = v_uid AND b.blocked_user_id = CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END)
             OR (b.blocked_user_id = v_uid AND b.user_id = CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END)
        )
      )
    ORDER BY p.created_at DESC
    LIMIT v_max;

    RETURN;
  END IF;

  IF to_regclass('public.oculto_aura_attentions') IS NOT NULL THEN
    RETURN QUERY
    SELECT
      a.id,
      CASE WHEN a.sender_id = v_uid THEN 'sent' ELSE 'received' END AS direction,
      CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END AS other_user_id,
      p.username,
      COALESCE(p.display_name, p.name, p.username) AS other_name,
      p.avatar_url,
      NULL::uuid AS room_id,
      'default'::text AS pulse_type,
      'sent'::text AS status,
      a.created_at,
      NULL::timestamptz AS responded_at,
      NULL::timestamptz AS expires_at
    FROM public.oculto_aura_attentions a
    LEFT JOIN public.profiles p
      ON p.user_id = CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END
    WHERE (a.sender_id = v_uid OR a.target_id = v_uid)
      AND (p_before IS NULL OR a.created_at < p_before)
      AND (
        p_direction = 'all'
        OR (p_direction = 'received' AND a.target_id = v_uid)
        OR (p_direction = 'sent' AND a.sender_id = v_uid)
      )
    ORDER BY a.created_at DESC
    LIMIT v_max;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_attention_history(text, int, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_attention_history_clear(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can_delete boolean := true;
  v_deleted int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF to_regclass('public.aura_pulse_settings') IS NOT NULL THEN
    SELECT COALESCE(history_user_can_delete, true)
      INTO v_can_delete
    FROM public.aura_pulse_settings
    WHERE id = true;
  END IF;

  IF COALESCE(v_can_delete, true) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'disabled');
  END IF;

  IF to_regclass('public.aura_pulses') IS NOT NULL THEN
    DELETE FROM public.aura_pulses
    WHERE (sender_id = v_uid OR target_id = v_uid)
      AND (p_user IS NULL OR sender_id = p_user OR target_id = p_user);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
  END IF;

  IF to_regclass('public.oculto_aura_attentions') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_attentions
    WHERE (sender_id = v_uid OR target_id = v_uid)
      AND (p_user IS NULL OR sender_id = p_user OR target_id = p_user);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted', 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_attention_history_clear(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';