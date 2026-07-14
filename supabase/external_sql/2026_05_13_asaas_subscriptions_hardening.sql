-- ============================================================
-- PROMPT 3 — Hardening Assinaturas ASAAS Premium/VIP
-- Idempotente. Roda no Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- ============================================================

-- 1) Histórico imutável de eventos de assinatura
CREATE TABLE IF NOT EXISTS public.oculto_subscription_history (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asaas_subscription_id  TEXT,
  asaas_payment_id       TEXT,
  user_id                UUID,
  plan_type              TEXT,
  event_type             TEXT NOT NULL,           -- SUBSCRIPTION_* / PAYMENT_*
  prev_status            TEXT,
  new_status             TEXT,
  amount                 NUMERIC(10,2),
  notes                  TEXT,
  payload                JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osh_sub      ON public.oculto_subscription_history(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_osh_user     ON public.oculto_subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_osh_event    ON public.oculto_subscription_history(event_type);
CREATE INDEX IF NOT EXISTS idx_osh_created  ON public.oculto_subscription_history(created_at DESC);

ALTER TABLE public.oculto_subscription_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "osh_master_all" ON public.oculto_subscription_history;
CREATE POLICY "osh_master_all" ON public.oculto_subscription_history
FOR ALL USING (public.aura_is_master_admin())
WITH CHECK (public.aura_is_master_admin());

DROP POLICY IF EXISTS "osh_owner_select" ON public.oculto_subscription_history;
CREATE POLICY "osh_owner_select" ON public.oculto_subscription_history
FOR SELECT USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- 2) Garantir colunas extras necessárias em oculto_asaas_subscriptions
ALTER TABLE public.oculto_asaas_subscriptions
  ADD COLUMN IF NOT EXISTS overdue_since   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_balance  NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3) RPC: aplicar evento de SUBSCRIPTION_* (CREATED/UPDATED/DELETED/INACTIVATED)
CREATE OR REPLACE FUNCTION public.oculto_subscription_apply_lifecycle(
  p_asaas_subscription_id TEXT,
  p_event_type            TEXT,
  p_payload               JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub          public.oculto_asaas_subscriptions%ROWTYPE;
  v_new_status   TEXT;
  v_prev_status  TEXT;
BEGIN
  SELECT * INTO v_sub
  FROM public.oculto_asaas_subscriptions
  WHERE asaas_subscription_id = p_asaas_subscription_id
  FOR UPDATE;

  v_prev_status := COALESCE(v_sub.status, 'pending');

  v_new_status := CASE p_event_type
    WHEN 'SUBSCRIPTION_CREATED'     THEN COALESCE(v_sub.status, 'pending')
    WHEN 'SUBSCRIPTION_UPDATED'     THEN COALESCE(v_sub.status, 'active')
    WHEN 'SUBSCRIPTION_DELETED'     THEN 'cancelled'
    WHEN 'SUBSCRIPTION_INACTIVATED' THEN 'suspended'
    ELSE COALESCE(v_sub.status, 'pending')
  END;

  IF v_sub.id IS NULL THEN
    INSERT INTO public.oculto_asaas_subscriptions (
      user_id, plan_type, asaas_subscription_id, status, value, last_event, metadata
    ) VALUES (
      NULLIF((p_payload->'subscription'->>'externalReference'),'')::UUID,
      COALESCE(p_payload->'subscription'->>'planType', 'premium'),
      p_asaas_subscription_id,
      v_new_status,
      COALESCE((p_payload->'subscription'->>'value')::NUMERIC, 0),
      p_event_type,
      p_payload
    )
    ON CONFLICT (asaas_subscription_id) DO NOTHING
    RETURNING * INTO v_sub;
  ELSE
    UPDATE public.oculto_asaas_subscriptions
       SET status         = v_new_status,
           last_event     = p_event_type,
           cancelled_at   = CASE WHEN v_new_status = 'cancelled' THEN now() ELSE cancelled_at END,
           suspended_at   = CASE WHEN v_new_status = 'suspended' THEN now() ELSE suspended_at END,
           reactivated_at = CASE WHEN v_prev_status IN ('suspended','overdue') AND v_new_status = 'active' THEN now() ELSE reactivated_at END,
           metadata       = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('last_lifecycle', p_event_type)
     WHERE id = v_sub.id;
  END IF;

  -- Aplicar reflexo no profile (perda/ganho de plano)
  IF v_sub.user_id IS NOT NULL THEN
    IF v_new_status = 'cancelled' OR v_new_status = 'suspended' THEN
      UPDATE public.profiles
         SET payment_status = 'inactive'
       WHERE id = v_sub.user_id;
    END IF;
  END IF;

  INSERT INTO public.oculto_subscription_history(
    asaas_subscription_id, user_id, plan_type, event_type, prev_status, new_status, payload
  ) VALUES (
    p_asaas_subscription_id, v_sub.user_id, v_sub.plan_type, p_event_type, v_prev_status, v_new_status, p_payload
  );

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'prev_status', v_prev_status,
    'new_status',  v_new_status
  );
END $$;

-- 4) RPC: aplicar evento de PAYMENT_* relacionado à assinatura
CREATE OR REPLACE FUNCTION public.oculto_subscription_apply_payment(
  p_asaas_subscription_id TEXT,
  p_asaas_payment_id      TEXT,
  p_event_type            TEXT,
  p_amount                NUMERIC,
  p_payload               JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub          public.oculto_asaas_subscriptions%ROWTYPE;
  v_settings     public.oculto_subscription_settings%ROWTYPE;
  v_new_status   TEXT;
  v_prev_status  TEXT;
  v_due_days     INT;
  v_next_due     DATE;
BEGIN
  SELECT * INTO v_settings FROM public.oculto_subscription_settings WHERE id = 1;

  SELECT * INTO v_sub
  FROM public.oculto_asaas_subscriptions
  WHERE asaas_subscription_id = p_asaas_subscription_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    -- Sem registro local, apenas loga histórico
    INSERT INTO public.oculto_subscription_history(
      asaas_subscription_id, asaas_payment_id, event_type, amount, notes, payload
    ) VALUES (
      p_asaas_subscription_id, p_asaas_payment_id, p_event_type, p_amount,
      'subscription not found locally — payment event logged only', p_payload
    );
    RETURN jsonb_build_object('subscription_id', NULL, 'status', 'unknown');
  END IF;

  v_prev_status := v_sub.status;
  v_due_days    := CASE WHEN v_sub.cycle = 'YEARLY' THEN 365 ELSE 30 END;

  v_new_status := CASE p_event_type
    WHEN 'PAYMENT_CONFIRMED'              THEN 'active'
    WHEN 'PAYMENT_RECEIVED'               THEN 'active'
    WHEN 'PAYMENT_RECEIVED_AFTER_OVERDUE' THEN 'active'
    WHEN 'PAYMENT_OVERDUE'                THEN 'overdue'
    WHEN 'PAYMENT_REFUNDED'               THEN 'refunded'
    WHEN 'PAYMENT_CHARGEBACK_REQUESTED'   THEN 'chargeback'
    ELSE v_prev_status
  END;

  -- Atualizar assinatura
  IF v_new_status = 'active' THEN
    v_next_due := (CURRENT_DATE + (v_due_days || ' days')::interval)::DATE;
    UPDATE public.oculto_asaas_subscriptions
       SET status          = 'active',
           overdue_since   = NULL,
           retry_count     = 0,
           last_payment_id = p_asaas_payment_id,
           last_payment_at = now(),
           last_event      = p_event_type,
           next_due_date   = v_next_due,
           reactivated_at  = CASE WHEN v_prev_status IN ('overdue','suspended') THEN now() ELSE reactivated_at END
     WHERE id = v_sub.id;

    -- Re-ativar plano no profile + descongelar saldo VIP
    IF v_sub.user_id IS NOT NULL THEN
      UPDATE public.profiles
         SET plan_type        = CASE
                                  WHEN v_sub.plan_type = 'vip'     THEN 'vip'
                                  WHEN v_sub.plan_type = 'premium' THEN 'premium'
                                  ELSE plan_type
                                END,
             payment_status   = 'active',
             payment_due_date = v_next_due
       WHERE id = v_sub.user_id;

      -- VIP: descongela saldo travado
      IF v_sub.plan_type = 'vip' AND v_sub.frozen_balance > 0 THEN
        UPDATE public.oculto_asaas_subscriptions
           SET frozen_balance = 0
         WHERE id = v_sub.id;
        PERFORM public.add_to_balance(
          (SELECT user_id FROM public.profiles WHERE id = v_sub.user_id),
          v_sub.frozen_balance
        );
      END IF;
    END IF;

  ELSIF v_new_status = 'overdue' THEN
    UPDATE public.oculto_asaas_subscriptions
       SET status        = 'overdue',
           overdue_since = COALESCE(overdue_since, now()),
           retry_count   = retry_count + 1,
           last_event    = p_event_type
     WHERE id = v_sub.id;

    -- Suspender automaticamente se passou do limite
    IF v_settings.auto_suspend_after_days IS NOT NULL THEN
      UPDATE public.oculto_asaas_subscriptions
         SET status = 'suspended', suspended_at = now()
       WHERE id = v_sub.id
         AND overdue_since IS NOT NULL
         AND now() - overdue_since > (v_settings.auto_suspend_after_days || ' days')::interval;
    END IF;

    -- VIP: congelar saldo disponível para evitar saque inadimplente
    IF v_sub.plan_type = 'vip' AND v_sub.user_id IS NOT NULL THEN
      DECLARE v_bal NUMERIC; v_uid UUID;
      BEGIN
        SELECT user_id, balance INTO v_uid, v_bal
        FROM public.profiles WHERE id = v_sub.user_id;
        IF v_bal IS NOT NULL AND v_bal > 0 THEN
          UPDATE public.oculto_asaas_subscriptions
             SET frozen_balance = frozen_balance + v_bal
           WHERE id = v_sub.id;
          PERFORM public.add_to_balance(v_uid, -v_bal);
        END IF;
      END;
    END IF;

    -- Marca profile como inadimplente
    IF v_sub.user_id IS NOT NULL THEN
      UPDATE public.profiles SET payment_status = 'overdue' WHERE id = v_sub.user_id;
    END IF;

  ELSIF v_new_status IN ('refunded','chargeback') THEN
    UPDATE public.oculto_asaas_subscriptions
       SET status = v_new_status, last_event = p_event_type
     WHERE id = v_sub.id;
    IF v_sub.user_id IS NOT NULL THEN
      UPDATE public.profiles SET payment_status = 'inactive' WHERE id = v_sub.user_id;
    END IF;
  END IF;

  INSERT INTO public.oculto_subscription_history(
    asaas_subscription_id, asaas_payment_id, user_id, plan_type,
    event_type, prev_status, new_status, amount, payload
  ) VALUES (
    p_asaas_subscription_id, p_asaas_payment_id, v_sub.user_id, v_sub.plan_type,
    p_event_type, v_prev_status, v_new_status, p_amount, p_payload
  );

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'prev_status', v_prev_status,
    'new_status',  v_new_status,
    'next_due',    v_next_due
  );
END $$;

-- 5) View consolidada para o admin
CREATE OR REPLACE VIEW public.v_admin_asaas_subscriptions AS
SELECT
  s.id,
  s.asaas_subscription_id,
  s.user_id,
  p.username,
  p.display_name,
  p.full_name,
  s.plan_type,
  s.status,
  s.cycle,
  s.value,
  s.next_due_date,
  s.overdue_since,
  s.retry_count,
  s.last_payment_at,
  s.frozen_balance,
  s.last_event,
  s.cancelled_at,
  s.suspended_at,
  s.reactivated_at,
  s.created_at,
  s.updated_at
FROM public.oculto_asaas_subscriptions s
LEFT JOIN public.profiles p ON p.id = s.user_id;

ALTER VIEW public.v_admin_asaas_subscriptions SET (security_invoker = true);

-- 6) View de KPIs (resumo)
CREATE OR REPLACE VIEW public.v_admin_asaas_subscriptions_kpi AS
SELECT
  COUNT(*) FILTER (WHERE status = 'active')                                  AS active_count,
  COUNT(*) FILTER (WHERE status = 'overdue')                                 AS overdue_count,
  COUNT(*) FILTER (WHERE status = 'suspended')                               AS suspended_count,
  COUNT(*) FILTER (WHERE status = 'cancelled')                               AS cancelled_count,
  COUNT(*) FILTER (WHERE status IN ('refunded','chargeback'))                AS failed_count,
  COUNT(*) FILTER (WHERE reactivated_at IS NOT NULL)                         AS reactivated_count,
  COUNT(*) FILTER (WHERE plan_type = 'premium' AND status = 'active')        AS premium_active,
  COUNT(*) FILTER (WHERE plan_type = 'vip'     AND status = 'active')        AS vip_active,
  COALESCE(SUM(value) FILTER (WHERE status = 'active'), 0)                   AS mrr_active,
  COALESCE(SUM(frozen_balance), 0)                                            AS total_frozen
FROM public.oculto_asaas_subscriptions;

ALTER VIEW public.v_admin_asaas_subscriptions_kpi SET (security_invoker = true);

-- 7) Permissões (autenticados podem ler suas próprias linhas via RLS;
--    o admin master usa as policies já definidas)
GRANT EXECUTE ON FUNCTION public.oculto_subscription_apply_lifecycle(TEXT,TEXT,JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oculto_subscription_apply_payment(TEXT,TEXT,TEXT,NUMERIC,JSONB) TO authenticated, service_role;
