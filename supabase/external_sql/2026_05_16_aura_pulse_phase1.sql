-- ============================================================================
-- PULSO DE AURA — Fase 1 (Backend)
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Tabela de pulsos enviados
CREATE TABLE IF NOT EXISTS public.aura_pulses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  target_id uuid NOT NULL,
  message_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','responded','ignored','blocked')),
  CONSTRAINT aura_pulse_no_self CHECK (sender_id <> target_id)
);

CREATE INDEX IF NOT EXISTS idx_aura_pulses_target_created
  ON public.aura_pulses(target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_pulses_sender_created
  ON public.aura_pulses(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_pulses_room
  ON public.aura_pulses(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_pulses_pair_recent
  ON public.aura_pulses(sender_id, target_id, created_at DESC);

ALTER TABLE public.aura_pulses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_pulses_select_own" ON public.aura_pulses;
CREATE POLICY "aura_pulses_select_own"
  ON public.aura_pulses FOR SELECT
  USING (sender_id = auth.uid() OR target_id = auth.uid());

DROP POLICY IF EXISTS "aura_pulses_service_all" ON public.aura_pulses;
CREATE POLICY "aura_pulses_service_all"
  ON public.aura_pulses FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2) Settings singleton (Admin Master configura tudo)
CREATE TABLE IF NOT EXISTS public.aura_pulse_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT true,
  cooldown_seconds integer NOT NULL DEFAULT 30,
  limit_per_window integer NOT NULL DEFAULT 5,
  window_minutes integer NOT NULL DEFAULT 30,
  vip_limit_per_window integer NOT NULL DEFAULT 15,
  vip_cooldown_seconds integer NOT NULL DEFAULT 10,
  free_can_send boolean NOT NULL DEFAULT true,
  sound_enabled_default boolean NOT NULL DEFAULT true,
  haptic_enabled_default boolean NOT NULL DEFAULT true,
  highlight_color text NOT NULL DEFAULT '#D4AF37',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

INSERT INTO public.aura_pulse_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.aura_pulse_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_pulse_settings_read_all" ON public.aura_pulse_settings;
CREATE POLICY "aura_pulse_settings_read_all"
  ON public.aura_pulse_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "aura_pulse_settings_service_write" ON public.aura_pulse_settings;
CREATE POLICY "aura_pulse_settings_service_write"
  ON public.aura_pulse_settings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3) Preferências de usuário (opt-out, som, vibração)
CREATE TABLE IF NOT EXISTS public.aura_pulse_user_preferences (
  user_id uuid PRIMARY KEY,
  receive_pulses boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  haptic_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_pulse_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_pulse_prefs_own_select" ON public.aura_pulse_user_preferences;
CREATE POLICY "aura_pulse_prefs_own_select"
  ON public.aura_pulse_user_preferences FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "aura_pulse_prefs_own_upsert" ON public.aura_pulse_user_preferences;
CREATE POLICY "aura_pulse_prefs_own_upsert"
  ON public.aura_pulse_user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "aura_pulse_prefs_own_update" ON public.aura_pulse_user_preferences;
CREATE POLICY "aura_pulse_prefs_own_update"
  ON public.aura_pulse_user_preferences FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "aura_pulse_prefs_service_all" ON public.aura_pulse_user_preferences;
CREATE POLICY "aura_pulse_prefs_service_all"
  ON public.aura_pulse_user_preferences FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4) Helper master admin (reuso convenção do projeto)
CREATE OR REPLACE FUNCTION public._aura_pulse_is_master(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _uid
      AND (COALESCE(p.is_admin, false) = true OR p.username = 'ocultomaster')
  );
$$;

-- 5) RPC enviar pulso
CREATE OR REPLACE FUNCTION public.aura_pulse_send(
  p_room_id uuid,
  p_target_id uuid,
  p_message_id uuid DEFAULT NULL
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
  v_is_vip boolean := false;
  v_is_premium boolean := false;
  v_cooldown int;
  v_limit int;
  v_window int;
  v_last_at timestamptz;
  v_count_in_window int;
  v_pulse_id uuid;
  v_blocked boolean := false;
  v_muted boolean := false;
  v_recent_complaints int := 0;
BEGIN
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF v_sender = p_target_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_target');
  END IF;

  SELECT * INTO v_settings FROM public.aura_pulse_settings WHERE id = true;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'disabled');
  END IF;

  -- Plano do remetente
  SELECT
    COALESCE(p.plan_type = 'vip', false),
    COALESCE(p.plan_type = 'premium', false)
  INTO v_is_vip, v_is_premium
  FROM public.profiles p WHERE p.user_id = v_sender;

  IF NOT v_is_vip AND NOT v_is_premium AND NOT v_settings.free_can_send THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_required');
  END IF;

  -- Preferências do alvo
  SELECT * INTO v_target_prefs FROM public.aura_pulse_user_preferences WHERE user_id = p_target_id;
  IF FOUND AND NOT v_target_prefs.receive_pulses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_opted_out');
  END IF;

  -- Bloqueios
  IF EXISTS (
    SELECT 1 FROM public.blocked_contacts
    WHERE (user_id = p_target_id AND blocked_user_id = v_sender)
       OR (user_id = v_sender AND blocked_user_id = p_target_id)
  ) THEN
    v_blocked := true;
  END IF;

  IF v_blocked THEN
    INSERT INTO public.aura_pulses(room_id, sender_id, target_id, message_id, status)
    VALUES (p_room_id, v_sender, p_target_id, p_message_id, 'blocked');
    RETURN jsonb_build_object('ok', false, 'error', 'blocked');
  END IF;

  -- Limites por plano
  IF v_is_vip THEN
    v_cooldown := v_settings.vip_cooldown_seconds;
    v_limit := v_settings.vip_limit_per_window;
  ELSE
    v_cooldown := v_settings.cooldown_seconds;
    v_limit := v_settings.limit_per_window;
  END IF;
  v_window := v_settings.window_minutes;

  -- Antifraude dinâmico: se houver 3+ pulsos marcados como blocked nas últimas 24h, dobra cooldown
  SELECT count(*) INTO v_recent_complaints
  FROM public.aura_pulses
  WHERE sender_id = v_sender
    AND status = 'blocked'
    AND created_at > now() - interval '24 hours';
  IF v_recent_complaints >= 3 THEN
    v_cooldown := v_cooldown * 2;
  END IF;

  -- Cooldown (mesmo par)
  SELECT max(created_at) INTO v_last_at
  FROM public.aura_pulses
  WHERE sender_id = v_sender AND target_id = p_target_id;

  IF v_last_at IS NOT NULL AND v_last_at > now() - make_interval(secs => v_cooldown) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cooldown',
      'retry_after_seconds',
      GREATEST(0, v_cooldown - EXTRACT(EPOCH FROM (now() - v_last_at))::int)
    );
  END IF;

  -- Janela
  SELECT count(*) INTO v_count_in_window
  FROM public.aura_pulses
  WHERE sender_id = v_sender
    AND created_at > now() - make_interval(mins => v_window)
    AND status <> 'blocked';
  IF v_count_in_window >= v_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit', 'limit', v_limit, 'window_minutes', v_window);
  END IF;

  INSERT INTO public.aura_pulses(room_id, sender_id, target_id, message_id, status)
  VALUES (p_room_id, v_sender, p_target_id, p_message_id, 'sent')
  RETURNING id INTO v_pulse_id;

  RETURN jsonb_build_object('ok', true, 'pulse_id', v_pulse_id);
END;
$$;

REVOKE ALL ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid) TO authenticated;

-- 6) RPC marcar como respondido
CREATE OR REPLACE FUNCTION public.aura_pulse_respond(p_pulse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  UPDATE public.aura_pulses
  SET responded_at = now(), status = 'responded'
  WHERE id = p_pulse_id
    AND target_id = v_uid
    AND status = 'sent';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_owner');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.aura_pulse_respond(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_pulse_respond(uuid) TO authenticated;

-- 7) RPC admin atualizar settings
CREATE OR REPLACE FUNCTION public.aura_pulse_admin_update_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public._aura_pulse_is_master(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.aura_pulse_settings SET
    enabled = COALESCE((p_patch->>'enabled')::boolean, enabled),
    cooldown_seconds = COALESCE((p_patch->>'cooldown_seconds')::int, cooldown_seconds),
    limit_per_window = COALESCE((p_patch->>'limit_per_window')::int, limit_per_window),
    window_minutes = COALESCE((p_patch->>'window_minutes')::int, window_minutes),
    vip_limit_per_window = COALESCE((p_patch->>'vip_limit_per_window')::int, vip_limit_per_window),
    vip_cooldown_seconds = COALESCE((p_patch->>'vip_cooldown_seconds')::int, vip_cooldown_seconds),
    free_can_send = COALESCE((p_patch->>'free_can_send')::boolean, free_can_send),
    sound_enabled_default = COALESCE((p_patch->>'sound_enabled_default')::boolean, sound_enabled_default),
    haptic_enabled_default = COALESCE((p_patch->>'haptic_enabled_default')::boolean, haptic_enabled_default),
    highlight_color = COALESCE(p_patch->>'highlight_color', highlight_color),
    updated_at = now(),
    updated_by = v_uid
  WHERE id = true;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.aura_pulse_admin_update_settings(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_pulse_admin_update_settings(jsonb) TO authenticated;

-- 8) View métricas para admin
CREATE OR REPLACE VIEW public.v_aura_pulse_metrics
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at) AS day,
  count(*) FILTER (WHERE status = 'sent')      AS sent,
  count(*) FILTER (WHERE status = 'responded') AS responded,
  count(*) FILTER (WHERE status = 'blocked')   AS blocked,
  count(DISTINCT sender_id)                    AS unique_senders,
  count(DISTINCT target_id)                    AS unique_targets
FROM public.aura_pulses
WHERE created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 9) Realtime
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'aura_pulses';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_pulses';
  END IF;
END $$;

ALTER TABLE public.aura_pulses REPLICA IDENTITY FULL;
