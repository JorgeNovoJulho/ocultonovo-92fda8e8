-- =====================================================================
-- PRIORIDADE 2 — Presença Invisível
-- Sinais discretos, anti-spam, anonimizados. Cole no SQL Editor externo.
-- Idempotente.
-- =====================================================================

-- 1) Config singleton (admin master)
CREATE TABLE IF NOT EXISTS public.oculto_presence_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  enabled boolean NOT NULL DEFAULT true,
  cooldown_seconds_per_pair integer NOT NULL DEFAULT 1800,    -- 30 min entre sinais do mesmo par
  daily_cap_per_user integer NOT NULL DEFAULT 12,             -- máx por receptor/dia
  hourly_cap_per_user integer NOT NULL DEFAULT 4,             -- máx por receptor/hora
  intensity smallint NOT NULL DEFAULT 50 CHECK (intensity BETWEEN 0 AND 100),
  premium_hint_boost numeric(3,2) NOT NULL DEFAULT 1.50,
  signal_weights jsonb NOT NULL DEFAULT '{
    "profile_observed": 1,
    "aura_passed_near": 1,
    "attention_received": 2,
    "almost_interacted": 2,
    "rare_presence_detected": 3,
    "room_energy_shift": 1,
    "hidden_interest_signal": 2
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presence_singleton CHECK (id = 'singleton')
);
INSERT INTO public.oculto_presence_config (id) VALUES ('singleton') ON CONFLICT DO NOTHING;
ALTER TABLE public.oculto_presence_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presence_config_read" ON public.oculto_presence_config;
CREATE POLICY "presence_config_read" ON public.oculto_presence_config FOR SELECT TO authenticated USING (true);

-- 2) Tabela de sinais (NUNCA expõe identidade do emissor para o receptor)
CREATE TABLE IF NOT EXISTS public.oculto_presence_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiver_id uuid NOT NULL,
  sender_id uuid NULL,                       -- nullable: pode ser sinal agregado
  signal_type text NOT NULL CHECK (signal_type IN (
    'profile_observed','aura_passed_near','attention_received',
    'almost_interacted','rare_presence_detected','room_energy_shift','hidden_interest_signal'
  )),
  intensity smallint NOT NULL DEFAULT 1 CHECK (intensity BETWEEN 1 AND 5),
  is_premium_hint boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours'
);
CREATE INDEX IF NOT EXISTS idx_presence_recv_recent ON public.oculto_presence_signals (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presence_pair ON public.oculto_presence_signals (receiver_id, sender_id, signal_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presence_expires ON public.oculto_presence_signals (expires_at);

ALTER TABLE public.oculto_presence_signals ENABLE ROW LEVEL SECURITY;

-- Receptor lê seus próprios sinais — sem ver sender_id (vista filtra)
DROP POLICY IF EXISTS "presence_owner_read" ON public.oculto_presence_signals;
CREATE POLICY "presence_owner_read"
  ON public.oculto_presence_signals FOR SELECT
  TO authenticated
  USING (receiver_id = auth.uid());

-- 3) View pública (anonimizada) — nunca expõe sender_id
CREATE OR REPLACE VIEW public.v_presence_signals_anon
WITH (security_invoker = true)
AS
SELECT id, receiver_id, signal_type, intensity, is_premium_hint, created_at, expires_at
FROM public.oculto_presence_signals
WHERE receiver_id = auth.uid() AND expires_at > now();

GRANT SELECT ON public.v_presence_signals_anon TO authenticated;

-- 4) RPC: emite sinal com checks (cooldown, caps, blocked, ghost mode)
CREATE OR REPLACE FUNCTION public.presence_emit_signal(
  p_receiver uuid,
  p_signal text,
  p_intensity smallint DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_cfg public.oculto_presence_config%ROWTYPE;
  v_blocked boolean := false;
  v_recent_pair int := 0;
  v_hourly int := 0;
  v_daily int := 0;
  v_ghost boolean := false;
BEGIN
  IF v_sender IS NULL OR p_receiver IS NULL OR v_sender = p_receiver THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_cfg FROM public.oculto_presence_config WHERE id='singleton';
  IF NOT v_cfg.enabled THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;

  -- Bloqueios em qualquer direção
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.blocked_contacts
      WHERE (user_id = p_receiver AND blocked_user_id = v_sender)
         OR (user_id = v_sender AND blocked_user_id = p_receiver)
    ) INTO v_blocked;
  EXCEPTION WHEN OTHERS THEN v_blocked := false; END;
  IF v_blocked THEN RETURN jsonb_build_object('ok', false, 'reason', 'blocked'); END IF;

  -- Ghost mode: emissor invisível não gera sinal
  BEGIN
    SELECT COALESCE(ghost_mode_enabled, false) INTO v_ghost FROM public.profiles WHERE id = v_sender;
  EXCEPTION WHEN OTHERS THEN v_ghost := false; END;
  IF v_ghost THEN RETURN jsonb_build_object('ok', false, 'reason', 'ghost'); END IF;

  -- Cooldown por par+tipo
  SELECT count(*) INTO v_recent_pair FROM public.oculto_presence_signals
  WHERE receiver_id = p_receiver AND sender_id = v_sender AND signal_type = p_signal
    AND created_at > now() - make_interval(secs => v_cfg.cooldown_seconds_per_pair);
  IF v_recent_pair > 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'cooldown'); END IF;

  -- Caps por receptor
  SELECT count(*) INTO v_hourly FROM public.oculto_presence_signals
  WHERE receiver_id = p_receiver AND created_at > now() - interval '1 hour';
  IF v_hourly >= v_cfg.hourly_cap_per_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'hourly_cap'); END IF;

  SELECT count(*) INTO v_daily FROM public.oculto_presence_signals
  WHERE receiver_id = p_receiver AND created_at > now() - interval '24 hours';
  IF v_daily >= v_cfg.daily_cap_per_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap'); END IF;

  INSERT INTO public.oculto_presence_signals (receiver_id, sender_id, signal_type, intensity)
  VALUES (p_receiver, v_sender, p_signal, GREATEST(1, LEAST(5, COALESCE(p_intensity, 1))));

  RETURN jsonb_build_object('ok', true);
END;$$;

GRANT EXECUTE ON FUNCTION public.presence_emit_signal(uuid, text, smallint) TO authenticated;

-- 5) RPC: lê sinais recentes (anonimizado)
CREATE OR REPLACE FUNCTION public.presence_recent_signals(p_limit int DEFAULT 12)
RETURNS TABLE (
  id uuid,
  signal_type text,
  intensity smallint,
  is_premium_hint boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, signal_type, intensity, is_premium_hint, created_at
  FROM public.oculto_presence_signals
  WHERE receiver_id = auth.uid() AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(50, COALESCE(p_limit, 12)));
$$;
GRANT EXECUTE ON FUNCTION public.presence_recent_signals(int) TO authenticated;

-- 6) Update da config (master only)
CREATE OR REPLACE FUNCTION public.presence_config_update(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_master boolean := false;
BEGIN
  BEGIN SELECT public.has_role(auth.uid(),'master_admin') INTO v_master;
  EXCEPTION WHEN OTHERS THEN
    BEGIN SELECT COALESCE(is_master,false) INTO v_master FROM public.profiles WHERE id=auth.uid();
    EXCEPTION WHEN OTHERS THEN v_master := false; END;
  END;
  IF NOT COALESCE(v_master,false) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.oculto_presence_config SET
    enabled = COALESCE((p_patch->>'enabled')::boolean, enabled),
    cooldown_seconds_per_pair = COALESCE((p_patch->>'cooldown_seconds_per_pair')::int, cooldown_seconds_per_pair),
    daily_cap_per_user = COALESCE((p_patch->>'daily_cap_per_user')::int, daily_cap_per_user),
    hourly_cap_per_user = COALESCE((p_patch->>'hourly_cap_per_user')::int, hourly_cap_per_user),
    intensity = COALESCE((p_patch->>'intensity')::smallint, intensity),
    premium_hint_boost = COALESCE((p_patch->>'premium_hint_boost')::numeric, premium_hint_boost),
    signal_weights = COALESCE(p_patch->'signal_weights', signal_weights),
    updated_at = now()
  WHERE id = 'singleton';

  RETURN (SELECT to_jsonb(c.*) FROM public.oculto_presence_config c WHERE id='singleton');
END;$$;
GRANT EXECUTE ON FUNCTION public.presence_config_update(jsonb) TO authenticated;

-- 7) Limpeza periódica (best-effort)
CREATE OR REPLACE FUNCTION public.presence_cleanup_expired()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.oculto_presence_signals WHERE expires_at < now() RETURNING 1)
  SELECT count(*)::int FROM d;
$$;
GRANT EXECUTE ON FUNCTION public.presence_cleanup_expired() TO authenticated;
