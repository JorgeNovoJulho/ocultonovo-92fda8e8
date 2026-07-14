-- ============================================================================
-- PULSO DE AURA — Fase 2
-- Evoluções: Pulso Premium/Raro + Ressonância Pública + Histórico de Atenção
-- 100% idempotente. Reusa tabelas/RPCs da Fase 1.
-- Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- ============================================================================
-- 1) ALTER aditivos em aura_pulses (sem duplicar)
-- ============================================================================
ALTER TABLE public.aura_pulses
  ADD COLUMN IF NOT EXISTS pulse_type    text         NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS expires_at    timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS metadata      jsonb        NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aura_pulses_pulse_type_check'
  ) THEN
    ALTER TABLE public.aura_pulses
      ADD CONSTRAINT aura_pulses_pulse_type_check
      CHECK (pulse_type IN ('default','premium','rare','silent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aura_pulses_type_created
  ON public.aura_pulses(pulse_type, created_at DESC);

-- ============================================================================
-- 2) ALTER aditivos em aura_pulse_settings (Admin Master controla tudo)
-- ============================================================================
ALTER TABLE public.aura_pulse_settings
  -- Premium
  ADD COLUMN IF NOT EXISTS premium_pulse_enabled       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS premium_min_plan            text    NOT NULL DEFAULT 'premium',
  ADD COLUMN IF NOT EXISTS premium_cooldown_seconds    integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS premium_limit_30m           integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS premium_highlight_color     text    NOT NULL DEFAULT '#B57BFF',
  ADD COLUMN IF NOT EXISTS premium_highlight_ms        integer NOT NULL DEFAULT 14000,
  ADD COLUMN IF NOT EXISTS premium_sound_enabled       boolean NOT NULL DEFAULT true,
  -- Rare
  ADD COLUMN IF NOT EXISTS rare_pulse_enabled          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rare_min_plan               text    NOT NULL DEFAULT 'vip',
  ADD COLUMN IF NOT EXISTS rare_vip_only               boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rare_min_trust_score        integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS rare_min_prestige_level     integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS rare_cooldown_seconds       integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS rare_limit_30m              integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS rare_highlight_color        text    NOT NULL DEFAULT '#FF3DE0',
  ADD COLUMN IF NOT EXISTS rare_highlight_ms           integer NOT NULL DEFAULT 18000,
  ADD COLUMN IF NOT EXISTS rare_sound_enabled          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rare_block_punished         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rare_block_recently_reported boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rare_addon_price_brl        numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS rare_monetization_enabled   boolean NOT NULL DEFAULT false,
  -- Ressonância
  ADD COLUMN IF NOT EXISTS resonance_enabled           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS resonance_public            boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS resonance_cooldown_seconds  integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS resonance_max_intensity     integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS resonance_expires_seconds   integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS resonance_min_plan          text    NULL,
  ADD COLUMN IF NOT EXISTS resonance_phrases           jsonb   NOT NULL DEFAULT
    '["💜 Uma ressonância surgiu na sala","⚡ Duas auras entraram em sintonia","✨ Sinal mútuo detectado","🌌 Sintonia silenciosa"]'::jsonb,
  -- Histórico
  ADD COLUMN IF NOT EXISTS history_enabled             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS history_retention_days      integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS history_max_rows            integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS history_user_can_delete     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS history_user_can_hide       boolean NOT NULL DEFAULT true;

-- ============================================================================
-- 3) ALTER aditivos em preferências do usuário
-- ============================================================================
ALTER TABLE public.aura_pulse_user_preferences
  ADD COLUMN IF NOT EXISTS allow_premium_pulse      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_rare_pulse         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_resonance_public    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS save_attention_history   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hide_my_history          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS silent_mode              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_rare_sound         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_rare_effects       boolean NOT NULL DEFAULT false;

-- Suspensão administrativa de pulsos por usuário
ALTER TABLE public.aura_pulse_user_preferences
  ADD COLUMN IF NOT EXISTS admin_suspended_until    timestamptz NULL;

-- ============================================================================
-- 4) Tabela de RESSONÂNCIA pública
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.aura_resonance_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL,
  user_a          uuid NOT NULL,
  user_b          uuid NOT NULL,
  source_pulse_id uuid NULL,
  resonance_type  text NOT NULL DEFAULT 'pulse_response',
  intensity       integer NOT NULL DEFAULT 1,
  is_public       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_resonance_no_self CHECK (user_a <> user_b)
);

CREATE INDEX IF NOT EXISTS idx_aura_resonance_room_created
  ON public.aura_resonance_events (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_resonance_users
  ON public.aura_resonance_events (user_a, user_b, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_resonance_expires
  ON public.aura_resonance_events (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.aura_resonance_events ENABLE ROW LEVEL SECURITY;

-- Envolvidos veem detalhes
DROP POLICY IF EXISTS "aura_resonance_select_involved" ON public.aura_resonance_events;
CREATE POLICY "aura_resonance_select_involved"
  ON public.aura_resonance_events FOR SELECT
  USING (auth.uid() IN (user_a, user_b));

-- Eventos públicos: qualquer autenticado vê (anonimizados pelo client/view)
DROP POLICY IF EXISTS "aura_resonance_select_public" ON public.aura_resonance_events;
CREATE POLICY "aura_resonance_select_public"
  ON public.aura_resonance_events FOR SELECT
  USING (
    is_public = true
    AND auth.uid() IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "aura_resonance_service_all" ON public.aura_resonance_events;
CREATE POLICY "aura_resonance_service_all"
  ON public.aura_resonance_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Master admin total
DROP POLICY IF EXISTS "aura_resonance_master_all" ON public.aura_resonance_events;
CREATE POLICY "aura_resonance_master_all"
  ON public.aura_resonance_events FOR ALL
  USING (public._aura_pulse_is_master(auth.uid()))
  WITH CHECK (public._aura_pulse_is_master(auth.uid()));

-- Realtime
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename='aura_resonance_events';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_resonance_events';
  END IF;
END $$;
ALTER TABLE public.aura_resonance_events REPLICA IDENTITY FULL;

-- ============================================================================
-- 5) Helper: resolve plano numericamente (free<premium<vip)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._aura_plan_rank(_plan text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_plan,'free'))
    WHEN 'vip' THEN 3
    WHEN 'premium' THEN 2
    ELSE 1
  END;
$$;

-- ============================================================================
-- 6) RPC ENVIAR PULSO — sobrescreve com suporte a pulse_type
--    (mantém assinatura antiga via overload de 3 args para compat retro)
-- ============================================================================
-- Drop assinaturas antigas para permitir mudar defaults/parametros sem erro 42P13
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
BEGIN
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF v_sender = p_target_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_target');
  END IF;
  IF v_type NOT IN ('default','premium','rare','silent') THEN
    v_type := 'default';
  END IF;

  SELECT * INTO v_settings FROM public.aura_pulse_settings WHERE id = true;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'disabled');
  END IF;

  -- Type kill-switches
  IF v_type = 'premium' AND NOT v_settings.premium_pulse_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'premium_disabled');
  END IF;
  IF v_type = 'rare' AND NOT v_settings.rare_pulse_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rare_disabled');
  END IF;

  -- Sender prefs (suspensão admin)
  SELECT * INTO v_sender_prefs FROM public.aura_pulse_user_preferences WHERE user_id = v_sender;
  IF FOUND AND v_sender_prefs.admin_suspended_until IS NOT NULL
     AND v_sender_prefs.admin_suspended_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sender_suspended');
  END IF;

  -- Plano + trust + prestígio do sender (best-effort, colunas opcionais)
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

  -- Plano mínimo por tipo
  IF v_type = 'premium' THEN
    v_min_rank := public._aura_plan_rank(v_settings.premium_min_plan);
  ELSIF v_type = 'rare' THEN
    v_min_rank := public._aura_plan_rank(v_settings.rare_min_plan);
    IF v_settings.rare_vip_only AND v_sender_rank < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rare_vip_required');
    END IF;
    IF v_trust < v_settings.rare_min_trust_score THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rare_trust_required',
        'required', v_settings.rare_min_trust_score, 'current', v_trust);
    END IF;
    IF v_prestige < v_settings.rare_min_prestige_level THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rare_prestige_required',
        'required', v_settings.rare_min_prestige_level, 'current', v_prestige);
    END IF;
  ELSE
    IF v_sender_rank = 1 AND NOT v_settings.free_can_send THEN
      RETURN jsonb_build_object('ok', false, 'error', 'plan_required');
    END IF;
  END IF;
  IF v_sender_rank < v_min_rank THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_required',
      'required_plan', CASE v_min_rank WHEN 3 THEN 'vip' WHEN 2 THEN 'premium' ELSE 'free' END);
  END IF;

  -- Preferências do alvo
  SELECT * INTO v_target_prefs FROM public.aura_pulse_user_preferences WHERE user_id = p_target_id;
  IF FOUND THEN
    IF NOT v_target_prefs.receive_pulses THEN
      RETURN jsonb_build_object('ok', false, 'error', 'target_opted_out');
    END IF;
    IF v_type = 'premium' AND NOT coalesce(v_target_prefs.allow_premium_pulse,true) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'target_blocks_premium');
    END IF;
    IF v_type = 'rare' AND NOT coalesce(v_target_prefs.allow_rare_pulse,true) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'target_blocks_rare');
    END IF;
  END IF;

  -- Bloqueios
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
    RETURN jsonb_build_object('ok', false, 'error', 'blocked');
  END IF;

  -- Cooldown e limites por tipo
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

  -- Antifraude dinâmico
  SELECT count(*) INTO v_recent_blocked
    FROM public.aura_pulses
   WHERE sender_id = v_sender AND status = 'blocked'
     AND created_at > now() - interval '24 hours';
  IF v_recent_blocked >= 3 THEN
    v_cooldown := v_cooldown * 2;
    v_limit := GREATEST(1, v_limit / 2);
  END IF;

  -- Trust score baixo reduz limite
  IF v_trust > 0 AND v_trust < 40 THEN
    v_limit := GREATEST(1, v_limit / 2);
  END IF;

  -- Cooldown contra mesmo par + mesmo tipo
  SELECT max(created_at) INTO v_last_at
    FROM public.aura_pulses
   WHERE sender_id = v_sender AND target_id = p_target_id
     AND pulse_type = v_type;
  IF v_last_at IS NOT NULL AND v_last_at > now() - make_interval(secs => v_cooldown) THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'cooldown',
      'retry_after_seconds',
      GREATEST(0, v_cooldown - EXTRACT(EPOCH FROM (now() - v_last_at))::int)
    );
  END IF;

  -- Janela por tipo
  SELECT count(*) INTO v_count_in_window
    FROM public.aura_pulses
   WHERE sender_id = v_sender
     AND pulse_type = v_type
     AND status <> 'blocked'
     AND created_at > now() - make_interval(mins => v_window);
  IF v_count_in_window >= v_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit',
      'limit', v_limit, 'window_minutes', v_window);
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
  RETURNING id INTO v_pulse_id;

  RETURN jsonb_build_object(
    'ok', true,
    'pulse_id', v_pulse_id,
    'pulse_type', v_type,
    'highlight_color', v_color,
    'highlight_ms', v_expires,
    'remaining_in_window', GREATEST(0, v_limit - v_count_in_window - 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid, text) TO authenticated;

-- Compat overload (chamadas antigas com 3 args continuam funcionando)
CREATE OR REPLACE FUNCTION public.aura_pulse_send(
  p_room_id uuid, p_target_id uuid, p_message_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.aura_pulse_send($1, $2, $3, 'default');
$$;
GRANT EXECUTE ON FUNCTION public.aura_pulse_send(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- 7) RPC RESPONDER PULSO — agora emite ressonância automaticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION public.aura_pulse_respond(p_pulse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings public.aura_pulse_settings%ROWTYPE;
  v_pulse public.aura_pulses%ROWTYPE;
  v_a_prefs public.aura_pulse_user_preferences%ROWTYPE;
  v_b_prefs public.aura_pulse_user_preferences%ROWTYPE;
  v_recent int := 0;
  v_intensity int := 1;
  v_blocked boolean := false;
  v_resonance_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  UPDATE public.aura_pulses
     SET responded_at = now(), status = 'responded'
   WHERE id = p_pulse_id AND target_id = v_uid AND status = 'sent'
  RETURNING * INTO v_pulse;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_owner');
  END IF;

  SELECT * INTO v_settings FROM public.aura_pulse_settings WHERE id = true;
  IF NOT v_settings.resonance_enabled THEN
    RETURN jsonb_build_object('ok', true, 'resonance', false);
  END IF;

  -- Preferências dos dois lados (ambos precisam permitir)
  SELECT * INTO v_a_prefs FROM public.aura_pulse_user_preferences WHERE user_id = v_pulse.sender_id;
  IF FOUND THEN
    IF NOT coalesce(v_a_prefs.show_resonance_public,true) OR coalesce(v_a_prefs.silent_mode,false) THEN
      RETURN jsonb_build_object('ok', true, 'resonance', false);
    END IF;
  END IF;
  SELECT * INTO v_b_prefs FROM public.aura_pulse_user_preferences WHERE user_id = v_pulse.target_id;
  IF FOUND THEN
    IF NOT coalesce(v_b_prefs.show_resonance_public,true) OR coalesce(v_b_prefs.silent_mode,false) THEN
      RETURN jsonb_build_object('ok', true, 'resonance', false);
    END IF;
  END IF;

  -- Bloqueio cancela
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.blocked_contacts
      WHERE (user_id = v_pulse.sender_id AND blocked_user_id = v_pulse.target_id)
         OR (user_id = v_pulse.target_id AND blocked_user_id = v_pulse.sender_id)
    ) THEN v_blocked := true; END IF;
  EXCEPTION WHEN OTHERS THEN v_blocked := false;
  END;
  IF v_blocked THEN
    RETURN jsonb_build_object('ok', true, 'resonance', false);
  END IF;

  -- Cooldown de ressonância por par
  IF EXISTS (
    SELECT 1 FROM public.aura_resonance_events
     WHERE ((user_a = v_pulse.sender_id AND user_b = v_pulse.target_id)
         OR (user_a = v_pulse.target_id AND user_b = v_pulse.sender_id))
       AND created_at > now() - make_interval(secs => v_settings.resonance_cooldown_seconds)
  ) THEN
    RETURN jsonb_build_object('ok', true, 'resonance', false, 'reason', 'cooldown');
  END IF;

  -- Intensidade = pulsos trocados nos últimos 30min (cap)
  SELECT count(*) INTO v_recent
    FROM public.aura_pulses
   WHERE ((sender_id = v_pulse.sender_id AND target_id = v_pulse.target_id)
       OR (sender_id = v_pulse.target_id AND target_id = v_pulse.sender_id))
     AND status IN ('sent','responded')
     AND created_at > now() - interval '30 minutes';
  v_intensity := LEAST(GREATEST(1, v_recent), v_settings.resonance_max_intensity);

  INSERT INTO public.aura_resonance_events(
    room_id, user_a, user_b, source_pulse_id,
    resonance_type, intensity, is_public, expires_at,
    metadata
  ) VALUES (
    v_pulse.room_id, v_pulse.sender_id, v_pulse.target_id, v_pulse.id,
    'pulse_response', v_intensity, v_settings.resonance_public,
    now() + make_interval(secs => v_settings.resonance_expires_seconds),
    jsonb_build_object('pulse_type', v_pulse.pulse_type)
  ) RETURNING id INTO v_resonance_id;

  RETURN jsonb_build_object(
    'ok', true,
    'resonance', true,
    'resonance_id', v_resonance_id,
    'intensity', v_intensity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_pulse_respond(uuid) TO authenticated;

-- ============================================================================
-- 8) RPC ADMIN — estendida para todos os novos campos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.aura_pulse_admin_update_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._aura_pulse_is_master(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.aura_pulse_settings SET
    -- base
    enabled                 = COALESCE((p_patch->>'enabled')::boolean, enabled),
    cooldown_seconds        = COALESCE((p_patch->>'cooldown_seconds')::int, cooldown_seconds),
    limit_per_window        = COALESCE((p_patch->>'limit_per_window')::int, limit_per_window),
    window_minutes          = COALESCE((p_patch->>'window_minutes')::int, window_minutes),
    vip_limit_per_window    = COALESCE((p_patch->>'vip_limit_per_window')::int, vip_limit_per_window),
    vip_cooldown_seconds    = COALESCE((p_patch->>'vip_cooldown_seconds')::int, vip_cooldown_seconds),
    free_can_send           = COALESCE((p_patch->>'free_can_send')::boolean, free_can_send),
    sound_enabled_default   = COALESCE((p_patch->>'sound_enabled_default')::boolean, sound_enabled_default),
    haptic_enabled_default  = COALESCE((p_patch->>'haptic_enabled_default')::boolean, haptic_enabled_default),
    highlight_color         = COALESCE(p_patch->>'highlight_color', highlight_color),
    -- premium
    premium_pulse_enabled   = COALESCE((p_patch->>'premium_pulse_enabled')::boolean, premium_pulse_enabled),
    premium_min_plan        = COALESCE(p_patch->>'premium_min_plan', premium_min_plan),
    premium_cooldown_seconds= COALESCE((p_patch->>'premium_cooldown_seconds')::int, premium_cooldown_seconds),
    premium_limit_30m       = COALESCE((p_patch->>'premium_limit_30m')::int, premium_limit_30m),
    premium_highlight_color = COALESCE(p_patch->>'premium_highlight_color', premium_highlight_color),
    premium_highlight_ms    = COALESCE((p_patch->>'premium_highlight_ms')::int, premium_highlight_ms),
    premium_sound_enabled   = COALESCE((p_patch->>'premium_sound_enabled')::boolean, premium_sound_enabled),
    -- rare
    rare_pulse_enabled      = COALESCE((p_patch->>'rare_pulse_enabled')::boolean, rare_pulse_enabled),
    rare_min_plan           = COALESCE(p_patch->>'rare_min_plan', rare_min_plan),
    rare_vip_only           = COALESCE((p_patch->>'rare_vip_only')::boolean, rare_vip_only),
    rare_min_trust_score    = COALESCE((p_patch->>'rare_min_trust_score')::int, rare_min_trust_score),
    rare_min_prestige_level = COALESCE((p_patch->>'rare_min_prestige_level')::int, rare_min_prestige_level),
    rare_cooldown_seconds   = COALESCE((p_patch->>'rare_cooldown_seconds')::int, rare_cooldown_seconds),
    rare_limit_30m          = COALESCE((p_patch->>'rare_limit_30m')::int, rare_limit_30m),
    rare_highlight_color    = COALESCE(p_patch->>'rare_highlight_color', rare_highlight_color),
    rare_highlight_ms       = COALESCE((p_patch->>'rare_highlight_ms')::int, rare_highlight_ms),
    rare_sound_enabled      = COALESCE((p_patch->>'rare_sound_enabled')::boolean, rare_sound_enabled),
    rare_block_punished     = COALESCE((p_patch->>'rare_block_punished')::boolean, rare_block_punished),
    rare_block_recently_reported = COALESCE((p_patch->>'rare_block_recently_reported')::boolean, rare_block_recently_reported),
    rare_addon_price_brl    = COALESCE((p_patch->>'rare_addon_price_brl')::numeric, rare_addon_price_brl),
    rare_monetization_enabled = COALESCE((p_patch->>'rare_monetization_enabled')::boolean, rare_monetization_enabled),
    -- resonance
    resonance_enabled          = COALESCE((p_patch->>'resonance_enabled')::boolean, resonance_enabled),
    resonance_public           = COALESCE((p_patch->>'resonance_public')::boolean, resonance_public),
    resonance_cooldown_seconds = COALESCE((p_patch->>'resonance_cooldown_seconds')::int, resonance_cooldown_seconds),
    resonance_max_intensity    = COALESCE((p_patch->>'resonance_max_intensity')::int, resonance_max_intensity),
    resonance_expires_seconds  = COALESCE((p_patch->>'resonance_expires_seconds')::int, resonance_expires_seconds),
    resonance_min_plan         = COALESCE(p_patch->>'resonance_min_plan', resonance_min_plan),
    resonance_phrases          = COALESCE(p_patch->'resonance_phrases', resonance_phrases),
    -- history
    history_enabled         = COALESCE((p_patch->>'history_enabled')::boolean, history_enabled),
    history_retention_days  = COALESCE((p_patch->>'history_retention_days')::int, history_retention_days),
    history_max_rows        = COALESCE((p_patch->>'history_max_rows')::int, history_max_rows),
    history_user_can_delete = COALESCE((p_patch->>'history_user_can_delete')::boolean, history_user_can_delete),
    history_user_can_hide   = COALESCE((p_patch->>'history_user_can_hide')::boolean, history_user_can_hide),

    updated_at = now(),
    updated_by = v_uid
  WHERE id = true;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_pulse_admin_update_settings(jsonb) TO authenticated;

-- ============================================================================
-- 9) RPC ADMIN — suspender pulsos de um usuário específico
-- ============================================================================
CREATE OR REPLACE FUNCTION public.aura_pulse_admin_suspend_user(
  p_user_id uuid, p_until timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._aura_pulse_is_master(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  INSERT INTO public.aura_pulse_user_preferences(user_id, admin_suspended_until)
  VALUES (p_user_id, p_until)
  ON CONFLICT (user_id) DO UPDATE SET admin_suspended_until = EXCLUDED.admin_suspended_until;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_pulse_admin_suspend_user(uuid, timestamptz) TO authenticated;

-- ============================================================================
-- 10) RPC HISTÓRICO DE ATENÇÃO (paginado, respeitando privacidade)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.aura_attention_history(
  p_direction text DEFAULT 'all',   -- all|received|sent|responded|expired
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings public.aura_pulse_settings%ROWTYPE;
  v_my_prefs public.aura_pulse_user_preferences%ROWTYPE;
  v_retention int;
  v_max int;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT * INTO v_settings FROM public.aura_pulse_settings WHERE id = true;
  IF FOUND AND NOT v_settings.history_enabled THEN RETURN; END IF;
  v_retention := COALESCE(v_settings.history_retention_days, 30);
  v_max := LEAST(COALESCE(p_limit,50), COALESCE(v_settings.history_max_rows,200));

  SELECT * INTO v_my_prefs FROM public.aura_pulse_user_preferences WHERE user_id = v_uid;
  IF FOUND AND NOT coalesce(v_my_prefs.save_attention_history,true) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    CASE WHEN p.sender_id = v_uid THEN 'sent' ELSE 'received' END AS direction,
    CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END AS other_user_id,
    pr.username, pr.name, pr.avatar_url,
    p.room_id, p.pulse_type, p.status,
    p.created_at, p.responded_at, p.expires_at
  FROM public.aura_pulses p
  LEFT JOIN public.profiles pr
    ON pr.user_id = CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END
  -- esconde se o outro lado pediu hide_my_history
  LEFT JOIN public.aura_pulse_user_preferences other_prefs
    ON other_prefs.user_id = (CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END)
  WHERE (p.sender_id = v_uid OR p.target_id = v_uid)
    AND p.status <> 'blocked'
    AND p.created_at > now() - make_interval(days => v_retention)
    AND (p_before IS NULL OR p.created_at < p_before)
    AND (p_direction = 'all'
         OR (p_direction = 'received' AND p.target_id = v_uid)
         OR (p_direction = 'sent' AND p.sender_id = v_uid)
         OR (p_direction = 'responded' AND p.status = 'responded')
         OR (p_direction = 'expired'
             AND p.status = 'sent'
             AND p.expires_at IS NOT NULL AND p.expires_at < now()))
    -- esconde linhas onde o outro lado optou por ocultar seu próprio histórico
    AND NOT coalesce(other_prefs.hide_my_history, false)
    -- esconde bloqueios mútuos
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_contacts b
      WHERE (b.user_id = v_uid AND b.blocked_user_id =
              (CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END))
         OR (b.blocked_user_id = v_uid AND b.user_id =
              (CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END))
    )
  ORDER BY p.created_at DESC
  LIMIT v_max;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_attention_history(text, int, timestamptz) TO authenticated;

-- ============================================================================
-- 11) RPC apagar histórico do próprio usuário
-- ============================================================================
CREATE OR REPLACE FUNCTION public.aura_attention_history_clear(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings public.aura_pulse_settings%ROWTYPE;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  SELECT * INTO v_settings FROM public.aura_pulse_settings WHERE id = true;
  IF NOT COALESCE(v_settings.history_user_can_delete,true) THEN
    RETURN jsonb_build_object('ok',false,'error','disabled');
  END IF;
  DELETE FROM public.aura_pulses
   WHERE (sender_id = v_uid OR target_id = v_uid)
     AND (p_user IS NULL OR sender_id = p_user OR target_id = p_user);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_attention_history_clear(uuid) TO authenticated;

-- ============================================================================
-- 12) View métricas estendida (por tipo) — usada pelo Admin
-- ============================================================================
CREATE OR REPLACE VIEW public.v_aura_pulse_metrics_by_type
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at) AS day,
  pulse_type,
  count(*) FILTER (WHERE status = 'sent')      AS sent,
  count(*) FILTER (WHERE status = 'responded') AS responded,
  count(*) FILTER (WHERE status = 'blocked')   AS blocked,
  count(DISTINCT sender_id) AS unique_senders,
  count(DISTINCT target_id) AS unique_targets
FROM public.aura_pulses
WHERE created_at > now() - interval '30 days'
GROUP BY 1,2
ORDER BY 1 DESC, 2;

CREATE OR REPLACE VIEW public.v_aura_resonance_metrics
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS resonances,
  avg(intensity)::numeric(6,2) AS avg_intensity,
  count(DISTINCT room_id) AS rooms
FROM public.aura_resonance_events
WHERE created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;
