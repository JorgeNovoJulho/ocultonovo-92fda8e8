-- ============================================================
-- PROMPT 6 — Assinaturas recorrentes ASAAS (Premium / VIP)
-- Idempotente. Roda no Supabase EXTERNO.
-- ============================================================

-- 1) Tabela de assinaturas recorrentes ASAAS
CREATE TABLE IF NOT EXISTS public.oculto_asaas_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL,                 -- profiles.id (creator/cliente)
  plan_id                UUID,                          -- subscription_plans.id (opcional)
  plan_type              TEXT NOT NULL DEFAULT 'premium' CHECK (plan_type IN ('premium','vip')),
  asaas_customer_id      TEXT,
  asaas_subscription_id  TEXT UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','active','overdue','suspended','cancelled','refunded','chargeback')),
  cycle                  TEXT NOT NULL DEFAULT 'MONTHLY'
                          CHECK (cycle IN ('MONTHLY','YEARLY')),
  value                  NUMERIC(10,2) NOT NULL,
  next_due_date          DATE,
  last_payment_id        TEXT,
  last_event             TEXT,
  cancelled_at           TIMESTAMPTZ,
  suspended_at           TIMESTAMPTZ,
  reactivated_at         TIMESTAMPTZ,
  metadata               JSONB DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oas_user            ON public.oculto_asaas_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_oas_status          ON public.oculto_asaas_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_oas_subscription_id ON public.oculto_asaas_subscriptions(asaas_subscription_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_oas_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_oas_touch_updated_at ON public.oculto_asaas_subscriptions;
CREATE TRIGGER trg_oas_touch_updated_at
BEFORE UPDATE ON public.oculto_asaas_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_oas_touch_updated_at();

-- 2) RLS
ALTER TABLE public.oculto_asaas_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oas_owner_select" ON public.oculto_asaas_subscriptions;
CREATE POLICY "oas_owner_select" ON public.oculto_asaas_subscriptions
FOR SELECT USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "oas_master_select" ON public.oculto_asaas_subscriptions;
CREATE POLICY "oas_master_select" ON public.oculto_asaas_subscriptions
FOR SELECT USING (public.aura_is_master_admin());

DROP POLICY IF EXISTS "oas_master_all" ON public.oculto_asaas_subscriptions;
CREATE POLICY "oas_master_all" ON public.oculto_asaas_subscriptions
FOR ALL USING (public.aura_is_master_admin())
WITH CHECK (public.aura_is_master_admin());

-- 3) Config global de assinaturas (grace period / retry / auto-suspensão)
CREATE TABLE IF NOT EXISTS public.oculto_subscription_settings (
  id                       INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  grace_period_days        INT NOT NULL DEFAULT 3,
  auto_suspend_after_days  INT NOT NULL DEFAULT 7,
  auto_reactivate          BOOLEAN NOT NULL DEFAULT true,
  retry_attempts           INT NOT NULL DEFAULT 3,
  premium_monthly_value    NUMERIC(10,2) NOT NULL DEFAULT 25.90,
  premium_yearly_value     NUMERIC(10,2) NOT NULL DEFAULT 259.00,
  vip_monthly_value        NUMERIC(10,2) NOT NULL DEFAULT 145.90,
  vip_yearly_value         NUMERIC(10,2) NOT NULL DEFAULT 1459.00,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.oculto_subscription_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.oculto_subscription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oss_master_all" ON public.oculto_subscription_settings;
CREATE POLICY "oss_master_all" ON public.oculto_subscription_settings
FOR ALL USING (public.aura_is_master_admin())
WITH CHECK (public.aura_is_master_admin());

DROP POLICY IF EXISTS "oss_read_authenticated" ON public.oculto_subscription_settings;
CREATE POLICY "oss_read_authenticated" ON public.oculto_subscription_settings
FOR SELECT USING (auth.uid() IS NOT NULL);

-- 4) RPC: minha assinatura ativa
CREATE OR REPLACE FUNCTION public.oculto_get_my_subscription()
RETURNS public.oculto_asaas_subscriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.*
  FROM public.oculto_asaas_subscriptions s
  WHERE s.user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  ORDER BY
    CASE s.status WHEN 'active' THEN 0 WHEN 'overdue' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
    s.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_get_my_subscription() TO authenticated;

-- 5) RPC: aplicar evento ASAAS na assinatura (chamado pelo webhook)
--    p_event examples: PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_RECEIVED_AFTER_OVERDUE,
--    PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED, SUBSCRIPTION_DELETED
CREATE OR REPLACE FUNCTION public.oculto_apply_subscription_event(
  p_asaas_subscription_id TEXT,
  p_event                 TEXT,
  p_payment_id            TEXT DEFAULT NULL,
  p_next_due              DATE DEFAULT NULL
) RETURNS public.oculto_asaas_subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub  public.oculto_asaas_subscriptions;
  v_cfg  public.oculto_subscription_settings;
  v_plan_expiry TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_sub FROM public.oculto_asaas_subscriptions
  WHERE asaas_subscription_id = p_asaas_subscription_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cfg FROM public.oculto_subscription_settings WHERE id = 1;

  IF p_event IN ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED','PAYMENT_RECEIVED_AFTER_OVERDUE') THEN
    -- ativa / reativa o plano
    v_plan_expiry := CASE WHEN v_sub.cycle = 'YEARLY' THEN now() + INTERVAL '365 days'
                          ELSE now() + INTERVAL '30 days' END;

    UPDATE public.profiles
       SET plan_type        = v_sub.plan_type,
           payment_status   = 'active',
           payment_due_date = v_plan_expiry,
           is_verified      = (v_sub.plan_type = 'vip')
     WHERE id = v_sub.user_id;

    UPDATE public.oculto_asaas_subscriptions
       SET status          = 'active',
           last_payment_id = COALESCE(p_payment_id, last_payment_id),
           next_due_date   = COALESCE(p_next_due, next_due_date),
           last_event      = p_event,
           reactivated_at  = CASE WHEN p_event = 'PAYMENT_RECEIVED_AFTER_OVERDUE' THEN now() ELSE reactivated_at END
     WHERE id = v_sub.id
     RETURNING * INTO v_sub;

  ELSIF p_event = 'PAYMENT_OVERDUE' THEN
    UPDATE public.oculto_asaas_subscriptions
       SET status     = 'overdue',
           last_event = p_event
     WHERE id = v_sub.id
     RETURNING * INTO v_sub;

    -- se passou do grace + auto suspend, suspende plano
    IF v_sub.next_due_date IS NOT NULL
       AND v_sub.next_due_date + (v_cfg.grace_period_days + v_cfg.auto_suspend_after_days) * INTERVAL '1 day' < now() THEN
      UPDATE public.profiles
         SET plan_type      = 'free',
             payment_status = 'overdue'
       WHERE id = v_sub.user_id;

      UPDATE public.oculto_asaas_subscriptions
         SET status       = 'suspended',
             suspended_at = now()
       WHERE id = v_sub.id
       RETURNING * INTO v_sub;
    END IF;

  ELSIF p_event IN ('PAYMENT_REFUNDED','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE') THEN
    UPDATE public.profiles
       SET plan_type      = 'free',
           payment_status = 'revoked'
     WHERE id = v_sub.user_id;

    UPDATE public.oculto_asaas_subscriptions
       SET status     = CASE WHEN p_event = 'PAYMENT_REFUNDED' THEN 'refunded' ELSE 'chargeback' END,
           last_event = p_event
     WHERE id = v_sub.id
     RETURNING * INTO v_sub;

  ELSIF p_event IN ('SUBSCRIPTION_DELETED','SUBSCRIPTION_CANCELLED') THEN
    UPDATE public.oculto_asaas_subscriptions
       SET status       = 'cancelled',
           cancelled_at = now(),
           last_event   = p_event
     WHERE id = v_sub.id
     RETURNING * INTO v_sub;

  ELSE
    UPDATE public.oculto_asaas_subscriptions
       SET last_event = p_event
     WHERE id = v_sub.id
     RETURNING * INTO v_sub;
  END IF;

  RETURN v_sub;
END $$;

REVOKE ALL ON FUNCTION public.oculto_apply_subscription_event(TEXT,TEXT,TEXT,DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_apply_subscription_event(TEXT,TEXT,TEXT,DATE) TO service_role;

-- 6) RPC admin: recalcular suspensões (cron diário)
CREATE OR REPLACE FUNCTION public.oculto_subscriptions_auto_suspend()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg public.oculto_subscription_settings; v_count INT;
BEGIN
  SELECT * INTO v_cfg FROM public.oculto_subscription_settings WHERE id = 1;

  WITH suspended AS (
    UPDATE public.oculto_asaas_subscriptions s
       SET status = 'suspended', suspended_at = now()
     WHERE status = 'overdue'
       AND next_due_date IS NOT NULL
       AND next_due_date + (v_cfg.grace_period_days + v_cfg.auto_suspend_after_days) * INTERVAL '1 day' < now()
    RETURNING user_id
  )
  UPDATE public.profiles p
     SET plan_type = 'free', payment_status = 'overdue'
   FROM suspended s WHERE p.id = s.user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.oculto_subscriptions_auto_suspend() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_subscriptions_auto_suspend() TO service_role;
