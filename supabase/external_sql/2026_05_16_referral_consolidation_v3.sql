-- ============================================================
-- REFERRAL CONSOLIDATION v3 — Programa de Indicações OCULTO
-- Idempotente. Não destrutivo. Rodar no SQL Editor do Supabase EXTERNO.
--
-- Camadas adicionadas (sem mexer no que já existe):
--   1) referral_program_config           -> singleton configurável pelo Admin Master
--   2) referral_users_tracking           -> rastreamento por indicado (janela 90 dias)
--   3) referral_withdrawals              -> saques PIX da plataforma (mín R$250, 3/mês)
--   4) referral_antifraud_events         -> log dedicado de fraude do programa
--   5) v_referral_dashboard_user         -> view privada do dashboard de cada usuário
--   6) RPCs: referral_request_withdrawal, referral_on_first_paid_subscription,
--           referral_can_withdraw, referral_register_tracking_on_signup
-- ============================================================

-- ============================================================
-- 1) CONFIG SINGLETON (Admin Master)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_program_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),  -- singleton
  enabled boolean NOT NULL DEFAULT true,
  commission_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  valid_plans text[] NOT NULL DEFAULT ARRAY['premium','vip']::text[],
  tracking_window_days integer NOT NULL DEFAULT 90,
  -- saque
  withdraw_min_amount numeric(10,2) NOT NULL DEFAULT 250.00,
  withdraw_monthly_limit integer NOT NULL DEFAULT 3,
  withdraw_processing_business_days integer NOT NULL DEFAULT 7,
  withdraw_cooldown_hours integer NOT NULL DEFAULT 24,
  -- planos bloqueados de saque (FREE não saca)
  withdraw_blocked_plans text[] NOT NULL DEFAULT ARRAY['free']::text[],
  -- antifraude
  antifraud_block_self boolean NOT NULL DEFAULT true,
  antifraud_block_same_device boolean NOT NULL DEFAULT true,
  antifraud_block_same_ip boolean NOT NULL DEFAULT false,
  -- comissão
  commission_only_first_subscription boolean NOT NULL DEFAULT true,
  tracking_start_from text NOT NULL DEFAULT 'joined_at' CHECK (tracking_start_from IN ('joined_at','click_at')),
  -- ranking
  public_ranking_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.referral_program_config (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.referral_program_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rpc_read_all ON public.referral_program_config;
CREATE POLICY rpc_read_all ON public.referral_program_config
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS rpc_master_write ON public.referral_program_config;
CREATE POLICY rpc_master_write ON public.referral_program_config
  FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

-- ============================================================
-- 2) TRACKING POR INDICADO (janela 90 dias)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_users_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL UNIQUE,
  referred_username text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  click_at timestamptz,
  current_plan text NOT NULL DEFAULT 'free',
  first_paid_plan text,
  first_paid_at timestamptz,
  commission_generated numeric(10,2) NOT NULL DEFAULT 0,
  commission_status text NOT NULL DEFAULT 'pending'
    CHECK (commission_status IN ('pending','confirmed','paid','expired','cancelled','blocked')),
  tracking_expires_at timestamptz NOT NULL,
  source_code text,
  device_fingerprint text,
  signup_ip inet,
  fraud_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rut_inviter ON public.referral_users_tracking(inviter_user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_rut_referred ON public.referral_users_tracking(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_rut_expires ON public.referral_users_tracking(tracking_expires_at) WHERE commission_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rut_status ON public.referral_users_tracking(commission_status);

ALTER TABLE public.referral_users_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rut_self_read ON public.referral_users_tracking;
CREATE POLICY rut_self_read ON public.referral_users_tracking
  FOR SELECT TO authenticated
  USING (inviter_user_id = auth.uid() OR public.is_admin_master());

DROP POLICY IF EXISTS rut_service_all ON public.referral_users_tracking;
CREATE POLICY rut_service_all ON public.referral_users_tracking
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS rut_master_write ON public.referral_users_tracking;
CREATE POLICY rut_master_write ON public.referral_users_tracking
  FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

-- ============================================================
-- 3) SAQUES PIX DA PLATAFORMA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  pix_key text NOT NULL,
  pix_key_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','processing','paid','rejected','cancelled')),
  rejection_reason text,
  asaas_transfer_id text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rw_user ON public.referral_withdrawals(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rw_status ON public.referral_withdrawals(status, requested_at DESC);

ALTER TABLE public.referral_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rw_self_read ON public.referral_withdrawals;
CREATE POLICY rw_self_read ON public.referral_withdrawals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_master());

DROP POLICY IF EXISTS rw_service_all ON public.referral_withdrawals;
CREATE POLICY rw_service_all ON public.referral_withdrawals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS rw_master_write ON public.referral_withdrawals;
CREATE POLICY rw_master_write ON public.referral_withdrawals
  FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

-- ============================================================
-- 4) ANTIFRAUDE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_antifraud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id uuid,
  referred_user_id uuid,
  event_type text NOT NULL,   -- self_referral | same_device | same_ip | chargeback | suspicious_withdraw | multi_account
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rae_inviter ON public.referral_antifraud_events(inviter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rae_type ON public.referral_antifraud_events(event_type, severity);

ALTER TABLE public.referral_antifraud_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rae_master_only ON public.referral_antifraud_events;
CREATE POLICY rae_master_only ON public.referral_antifraud_events
  FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

DROP POLICY IF EXISTS rae_service_all ON public.referral_antifraud_events;
CREATE POLICY rae_service_all ON public.referral_antifraud_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5) VIEW DO DASHBOARD POR USUÁRIO (sem PII)
-- ============================================================
CREATE OR REPLACE VIEW public.v_referral_dashboard_user
WITH (security_invoker=true) AS
SELECT
  t.id,
  t.inviter_user_id,
  t.referred_user_id,
  COALESCE(t.referred_username, p.username, 'anônimo') AS username,
  t.joined_at,
  t.current_plan,
  t.first_paid_plan,
  t.first_paid_at,
  t.commission_generated,
  t.commission_status,
  t.tracking_expires_at,
  CASE
    WHEN t.commission_status = 'pending' AND t.tracking_expires_at > now()
      THEN GREATEST(0, EXTRACT(DAY FROM (t.tracking_expires_at - now()))::int)
    ELSE 0
  END AS days_remaining
FROM public.referral_users_tracking t
LEFT JOIN public.profiles p ON p.user_id = t.referred_user_id;

GRANT SELECT ON public.v_referral_dashboard_user TO authenticated;

-- ============================================================
-- 6) RPCs
-- ============================================================

-- 6.1) Registrar tracking no signup (chamado por trigger ou edge function de signup)
CREATE OR REPLACE FUNCTION public.referral_register_tracking_on_signup(
  p_referred_user_id uuid,
  p_inviter_user_id uuid,
  p_source_code text DEFAULT NULL,
  p_device_fingerprint text DEFAULT NULL,
  p_signup_ip inet DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg public.referral_program_config%ROWTYPE;
  v_id uuid;
  v_username text;
  v_flags jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_cfg FROM public.referral_program_config WHERE id = true;

  IF v_cfg.enabled IS NOT TRUE THEN RETURN NULL; END IF;
  IF p_inviter_user_id IS NULL OR p_referred_user_id IS NULL THEN RETURN NULL; END IF;

  -- Antifraude: autoindicação
  IF v_cfg.antifraud_block_self AND p_inviter_user_id = p_referred_user_id THEN
    INSERT INTO public.referral_antifraud_events(inviter_user_id, referred_user_id, event_type, severity, details)
    VALUES (p_inviter_user_id, p_referred_user_id, 'self_referral', 'high',
            jsonb_build_object('source', p_source_code));
    RETURN NULL;
  END IF;

  -- Mesmo device
  IF v_cfg.antifraud_block_same_device AND p_device_fingerprint IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.referral_users_tracking
      WHERE device_fingerprint = p_device_fingerprint
        AND inviter_user_id = p_inviter_user_id
    ) THEN
      v_flags := v_flags || jsonb_build_array('same_device');
      INSERT INTO public.referral_antifraud_events(inviter_user_id, referred_user_id, event_type, severity, details)
      VALUES (p_inviter_user_id, p_referred_user_id, 'same_device', 'medium',
              jsonb_build_object('fingerprint', p_device_fingerprint));
    END IF;
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE user_id = p_referred_user_id;

  INSERT INTO public.referral_users_tracking(
    inviter_user_id, referred_user_id, referred_username,
    tracking_expires_at, source_code, device_fingerprint, signup_ip, fraud_flags
  )
  VALUES (
    p_inviter_user_id, p_referred_user_id, v_username,
    now() + (v_cfg.tracking_window_days || ' days')::interval,
    p_source_code, p_device_fingerprint, p_signup_ip, v_flags
  )
  ON CONFLICT (referred_user_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_register_tracking_on_signup(uuid,uuid,text,text,inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_register_tracking_on_signup(uuid,uuid,text,text,inet) TO service_role, authenticated;

-- 6.2) Disparado quando primeira assinatura paga é confirmada
CREATE OR REPLACE FUNCTION public.referral_on_first_paid_subscription(
  p_user_id uuid,
  p_plan text,
  p_gross_amount numeric,
  p_source_ref uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg public.referral_program_config%ROWTYPE;
  v_track public.referral_users_tracking%ROWTYPE;
  v_commission numeric(10,2);
  v_ledger_id uuid;
BEGIN
  SELECT * INTO v_cfg FROM public.referral_program_config WHERE id = true;
  IF v_cfg.enabled IS NOT TRUE THEN RETURN NULL; END IF;

  -- Plano elegível?
  IF NOT (lower(p_plan) = ANY(v_cfg.valid_plans)) THEN RETURN NULL; END IF;

  -- Existe tracking? Está na janela? Já gerou comissão?
  SELECT * INTO v_track FROM public.referral_users_tracking WHERE referred_user_id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_track.commission_status IN ('confirmed','paid','cancelled','blocked','expired') THEN RETURN NULL; END IF;
  IF now() > v_track.tracking_expires_at THEN
    UPDATE public.referral_users_tracking
      SET commission_status='expired', updated_at=now()
      WHERE id = v_track.id;
    RETURN NULL;
  END IF;
  IF v_cfg.commission_only_first_subscription AND v_track.first_paid_at IS NOT NULL THEN RETURN NULL; END IF;
  IF jsonb_array_length(v_track.fraud_flags) > 0 THEN
    UPDATE public.referral_users_tracking SET commission_status='blocked', updated_at=now()
      WHERE id = v_track.id;
    RETURN NULL;
  END IF;

  v_commission := ROUND(p_gross_amount * v_cfg.commission_pct / 100.0, 2);

  -- Registra no ledger canônico (já existente)
  v_ledger_id := public.register_referral_commission(
    p_affiliate_id      => v_track.inviter_user_id,
    p_referred_user_id  => p_user_id,
    p_creator_id        => NULL,
    p_source            => 'subscription',
    p_source_ref        => p_source_ref,
    p_gross_amount      => p_gross_amount,
    p_commission_amount => v_commission,
    p_commission_pct    => v_cfg.commission_pct,
    p_metadata          => jsonb_build_object('plan', p_plan, 'tracking_id', v_track.id)
  );

  UPDATE public.referral_users_tracking
    SET first_paid_plan = lower(p_plan),
        first_paid_at   = now(),
        current_plan    = lower(p_plan),
        commission_generated = v_commission,
        commission_status = 'confirmed',
        updated_at = now()
    WHERE id = v_track.id;

  -- Atualiza pending_balance do indicador
  UPDATE public.profiles
    SET pending_balance = COALESCE(pending_balance, 0) + v_commission,
        updated_at = now()
    WHERE user_id = v_track.inviter_user_id;

  RETURN v_ledger_id;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_on_first_paid_subscription(uuid,text,numeric,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_on_first_paid_subscription(uuid,text,numeric,uuid) TO service_role;

-- 6.3) Checagem se usuário pode sacar (FREE não saca)
CREATE OR REPLACE FUNCTION public.referral_can_withdraw(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg public.referral_program_config%ROWTYPE;
  v_plan text;
  v_balance numeric(10,2);
  v_month_count integer;
  v_last_request timestamptz;
BEGIN
  SELECT * INTO v_cfg FROM public.referral_program_config WHERE id = true;
  SELECT lower(COALESCE(plan_type,'free')), COALESCE(balance,0)
    INTO v_plan, v_balance
    FROM public.profiles WHERE user_id = p_user_id;

  IF v_plan = ANY(v_cfg.withdraw_blocked_plans) THEN
    RETURN jsonb_build_object('can_withdraw', false, 'reason', 'plan_blocked', 'min_plan_required', 'premium');
  END IF;

  SELECT COUNT(*), MAX(requested_at)
    INTO v_month_count, v_last_request
    FROM public.referral_withdrawals
    WHERE user_id = p_user_id
      AND requested_at > date_trunc('month', now());

  IF v_month_count >= v_cfg.withdraw_monthly_limit THEN
    RETURN jsonb_build_object('can_withdraw', false, 'reason', 'monthly_limit', 'limit', v_cfg.withdraw_monthly_limit);
  END IF;

  IF v_last_request IS NOT NULL AND v_last_request > now() - (v_cfg.withdraw_cooldown_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('can_withdraw', false, 'reason', 'cooldown', 'next_allowed_at', v_last_request + (v_cfg.withdraw_cooldown_hours || ' hours')::interval);
  END IF;

  IF v_balance < v_cfg.withdraw_min_amount THEN
    RETURN jsonb_build_object('can_withdraw', false, 'reason', 'below_minimum', 'minimum', v_cfg.withdraw_min_amount, 'balance', v_balance);
  END IF;

  RETURN jsonb_build_object('can_withdraw', true, 'balance', v_balance, 'minimum', v_cfg.withdraw_min_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.referral_can_withdraw(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_can_withdraw(uuid) TO authenticated, service_role;

-- 6.4) Solicita saque PIX
CREATE OR REPLACE FUNCTION public.referral_request_withdrawal(
  p_amount numeric,
  p_pix_key text DEFAULT NULL,
  p_pix_key_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_check jsonb;
  v_id uuid;
  v_pix_key text := p_pix_key;
  v_pix_type text := p_pix_key_type;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  v_check := public.referral_can_withdraw(v_user);
  IF (v_check->>'can_withdraw')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'withdraw_denied: %', v_check->>'reason';
  END IF;
  IF (v_check->>'balance')::numeric < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  -- Fallback p/ PIX cadastrado no profile
  IF v_pix_key IS NULL OR v_pix_type IS NULL THEN
    SELECT pix_key, pix_key_type INTO v_pix_key, v_pix_type
      FROM public.profiles WHERE user_id = v_user;
  END IF;
  IF v_pix_key IS NULL OR v_pix_type IS NULL THEN RAISE EXCEPTION 'pix_key_missing'; END IF;

  INSERT INTO public.referral_withdrawals(user_id, amount, pix_key, pix_key_type)
    VALUES (v_user, p_amount, v_pix_key, v_pix_type)
    RETURNING id INTO v_id;

  -- Reserva imediata do saldo
  UPDATE public.profiles
    SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = v_user;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_request_withdrawal(numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_request_withdrawal(numeric,text,text) TO authenticated;

-- 6.5) Cancela comissão em chargeback (chamado pelo hub de refund)
CREATE OR REPLACE FUNCTION public.referral_cancel_on_chargeback(p_referred_user_id uuid, p_reason text DEFAULT 'chargeback')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_track public.referral_users_tracking%ROWTYPE;
BEGIN
  SELECT * INTO v_track FROM public.referral_users_tracking WHERE referred_user_id = p_referred_user_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_track.commission_status = 'confirmed' AND v_track.commission_generated > 0 THEN
    UPDATE public.profiles
      SET pending_balance = GREATEST(0, COALESCE(pending_balance,0) - v_track.commission_generated)
      WHERE user_id = v_track.inviter_user_id;
  END IF;
  UPDATE public.referral_users_tracking
    SET commission_status='cancelled',
        fraud_flags = fraud_flags || jsonb_build_array(p_reason),
        updated_at=now()
    WHERE id = v_track.id;

  INSERT INTO public.referral_antifraud_events(inviter_user_id, referred_user_id, event_type, severity, details)
  VALUES (v_track.inviter_user_id, p_referred_user_id, 'chargeback', 'high',
          jsonb_build_object('reason', p_reason, 'amount', v_track.commission_generated));
END;
$$;

REVOKE ALL ON FUNCTION public.referral_cancel_on_chargeback(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_cancel_on_chargeback(uuid,text) TO service_role;

-- ============================================================
-- 7) TRIGGER opcional: mantém current_plan em sync
-- ============================================================
CREATE OR REPLACE FUNCTION public.referral_sync_current_plan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    UPDATE public.referral_users_tracking
      SET current_plan = lower(NEW.plan_type), updated_at = now()
      WHERE referred_user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_sync_current_plan ON public.profiles;
CREATE TRIGGER trg_referral_sync_current_plan
  AFTER UPDATE OF plan_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.referral_sync_current_plan();

-- ============================================================
-- 8) REALTIME
-- ============================================================
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_users_tracking';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_users_tracking';
  END IF;
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_withdrawals';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_withdrawals';
  END IF;
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_program_config';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_program_config';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 9) HELPER: vincular signup por share_code (resolve inviter)
-- ============================================================
CREATE OR REPLACE FUNCTION public.referral_track_signup_by_share_code(
  p_child_user_id uuid,
  p_share_code text,
  p_device_fingerprint text DEFAULT NULL,
  p_signup_ip inet DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inviter uuid;
BEGIN
  IF p_share_code IS NULL OR p_child_user_id IS NULL THEN RETURN NULL; END IF;

  -- Resolve inviter a partir do referral_code em referral_affiliates
  SELECT user_id INTO v_inviter
    FROM public.referral_affiliates
    WHERE referral_code = p_share_code OR custom_slug = p_share_code
    LIMIT 1;

  IF v_inviter IS NULL THEN RETURN NULL; END IF;

  RETURN public.referral_register_tracking_on_signup(
    p_referred_user_id   => p_child_user_id,
    p_inviter_user_id    => v_inviter,
    p_source_code        => p_share_code,
    p_device_fingerprint => p_device_fingerprint,
    p_signup_ip          => p_signup_ip
  );
END; $$;

REVOKE ALL ON FUNCTION public.referral_track_signup_by_share_code(uuid,text,text,inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_track_signup_by_share_code(uuid,text,text,inet) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
