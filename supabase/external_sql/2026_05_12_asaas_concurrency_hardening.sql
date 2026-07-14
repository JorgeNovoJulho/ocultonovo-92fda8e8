-- =====================================================================
-- HARDENING DE CONCORRÊNCIA — ASAAS / SPLIT / WALLET / WITHDRAWAL
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. Sem perda de dados.
--
-- Resolve:
--   #1 Race em saque (oculto_withdrawal_to_ledger sem FOR UPDATE)
--   #2 Split duplicado (process_payment_split sem idempotência)
--   #3 Webhook reprocessado quando event_id é NULL
-- =====================================================================

-- =====================================================================
-- 1) UNIQUE para idempotência de split por payment_external_id
-- =====================================================================
-- Evita que process_payment_split processe o mesmo pagamento 2x
-- mesmo se o webhook ASAAS retentar com event_id diferente.

ALTER TABLE public.transaction_split_logs
  ADD COLUMN IF NOT EXISTS dedup_key TEXT
    GENERATED ALWAYS AS (COALESCE(payment_external_id, transaction_id)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS ux_transaction_split_logs_dedup
  ON public.transaction_split_logs (dedup_key)
  WHERE dedup_key IS NOT NULL;

-- =====================================================================
-- 2) process_payment_split — HARDENED com guard de idempotência
-- =====================================================================
-- Mantém assinatura idêntica (não quebra pix-webhook).
-- Se já existe split para este payment_external_id, retorna sem reprocessar.

CREATE OR REPLACE FUNCTION public.process_payment_split(
  p_transaction_id TEXT,
  p_payment_external_id TEXT,
  p_flow_type TEXT,
  p_gross_amount DECIMAL(10,2),
  p_creator_id UUID DEFAULT NULL,
  p_affiliate_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT 'platform'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg RECORD;
  v_tax_rate DECIMAL(5,4);
  v_platform_rate DECIMAL(5,4);
  v_affiliate_rate DECIMAL(5,4);
  v_tax DECIMAL(10,2);
  v_base DECIMAL(10,2);
  v_platform DECIMAL(10,2);
  v_affiliate DECIMAL(10,2) := 0;
  v_creator DECIMAL(10,2) := 0;
  v_dedup TEXT;
  v_existing_id UUID;
  v_result JSONB;
BEGIN
  -- ✅ Guard de idempotência (chave: payment_external_id || transaction_id)
  v_dedup := COALESCE(p_payment_external_id, p_transaction_id);
  IF v_dedup IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.transaction_split_logs
     WHERE COALESCE(payment_external_id, transaction_id) = v_dedup
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'existing_split_id', v_existing_id,
        'dedup_key', v_dedup
      );
    END IF;
  END IF;

  -- Carregar config ativa
  SELECT platform_percent, tax_percent, creator_percent, affiliate_percent
    INTO v_cfg
  FROM public.split_config
  WHERE is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_cfg IS NULL THEN
    v_tax_rate := 0.06; v_platform_rate := 0.20; v_affiliate_rate := 0.05;
    v_cfg := ROW(20.00, 6.00, 69.00, 5.00)::RECORD;
  ELSE
    v_tax_rate := v_cfg.tax_percent / 100.0;
    v_platform_rate := v_cfg.platform_percent / 100.0;
    v_affiliate_rate := v_cfg.affiliate_percent / 100.0;
  END IF;

  v_tax := ROUND(p_gross_amount * v_tax_rate, 2);
  v_base := ROUND(p_gross_amount - v_tax, 2);

  IF p_flow_type = 'platform_plan' THEN
    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
      v_platform := ROUND(v_base - v_affiliate, 2);
    ELSE
      v_platform := v_base;
    END IF;
    v_creator := 0;
  ELSIF p_flow_type = 'creator_content' THEN
    v_platform := ROUND(v_base * v_platform_rate, 2);
    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
    END IF;
    v_creator := ROUND(v_base - v_platform - v_affiliate, 2);
  ELSE
    v_platform := 0; v_creator := 0; v_affiliate := 0;
  END IF;

  -- ✅ INSERT do log PRIMEIRO (com ON CONFLICT) — atua como lock atômico
  BEGIN
    INSERT INTO public.transaction_split_logs (
      transaction_id, payment_external_id, flow_type,
      gross_amount, tax_amount, tax_rate, base_amount,
      platform_amount, platform_rate,
      affiliate_amount, affiliate_rate,
      creator_amount, creator_id, affiliate_id, provider
    ) VALUES (
      p_transaction_id, p_payment_external_id, p_flow_type,
      p_gross_amount, v_tax, v_tax_rate, v_base,
      v_platform, CASE WHEN p_flow_type='platform_plan' THEN 1.00 - v_affiliate_rate ELSE v_platform_rate END,
      v_affiliate, v_affiliate_rate,
      v_creator, p_creator_id, p_affiliate_id, p_provider
    );
  EXCEPTION WHEN unique_violation THEN
    -- Outro processo já gravou — replay idempotente
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'dedup_key', v_dedup);
  END;

  -- Crédito do criador (idempotência herdada do log)
  IF v_creator > 0 AND p_creator_id IS NOT NULL THEN
    UPDATE public.profiles
       SET pending_balance = COALESCE(pending_balance, 0) + v_creator
     WHERE id = p_creator_id;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_creator_id, v_creator, 'creator_content_income', now() + INTERVAL '7 days', 'pending');
  END IF;

  IF v_affiliate > 0 AND p_affiliate_id IS NOT NULL THEN
    UPDATE public.profiles
       SET pending_balance = COALESCE(pending_balance, 0) + v_affiliate
     WHERE id = p_affiliate_id;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_affiliate_id, v_affiliate, 'affiliate_commission', now() + INTERVAL '7 days', 'pending');
  END IF;

  v_result := jsonb_build_object(
    'gross', p_gross_amount, 'tax', v_tax, 'base', v_base,
    'platform', v_platform, 'affiliate', v_affiliate, 'creator', v_creator,
    'flow_type', p_flow_type, 'idempotent_replay', false,
    'config', jsonb_build_object(
      'tax_pct', v_cfg.tax_percent, 'platform_pct', v_cfg.platform_percent,
      'creator_pct', v_cfg.creator_percent, 'affiliate_pct', v_cfg.affiliate_percent
    )
  );
  RETURN v_result;
END;
$$;

-- =====================================================================
-- 3) oculto_withdrawal_to_ledger — HARDENED com FOR UPDATE
-- =====================================================================
-- Trava a row da wallet ANTES de checar saldo → impede 2 saques simultâneos
-- de drenarem mais do que existe.

CREATE OR REPLACE FUNCTION public.oculto_withdrawal_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avail NUMERIC(10,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.oculto_ensure_wallet(NEW.user_id);

    -- ✅ FOR UPDATE: lock pessimista na row da wallet
    SELECT available_balance INTO v_avail
      FROM public.oculto_creator_wallets
     WHERE creator_id = NEW.user_id
     FOR UPDATE;

    IF COALESCE(v_avail, 0) < NEW.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente para saque (disponível: %, solicitado: %)',
        COALESCE(v_avail, 0), NEW.amount
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.oculto_creator_wallets
       SET available_balance = available_balance - NEW.amount,
           blocked_balance   = blocked_balance + NEW.amount,
           updated_at        = now()
     WHERE creator_id = NEW.user_id;

    INSERT INTO public.oculto_wallet_ledger
      (creator_id, type, amount, reference_table, reference_id, metadata)
    VALUES
      (NEW.user_id, 'freeze', NEW.amount, 'withdrawal_requests', NEW.id,
       jsonb_build_object('status', NEW.status))
    ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' AND OLD.status IN ('pending','processing') THEN
      -- ✅ FOR UPDATE no debit final
      PERFORM 1 FROM public.oculto_creator_wallets
        WHERE creator_id = NEW.user_id FOR UPDATE;

      UPDATE public.oculto_creator_wallets
         SET blocked_balance = GREATEST(0, blocked_balance - NEW.amount),
             total_withdrawn = total_withdrawn + NEW.amount,
             updated_at      = now()
       WHERE creator_id = NEW.user_id;
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (NEW.user_id, 'withdrawal', -NEW.amount, 'withdrawal_requests', NEW.id,
         jsonb_build_object('status', NEW.status))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

    ELSIF NEW.status IN ('rejected','cancelled','failed') AND OLD.status IN ('pending','processing') THEN
      PERFORM 1 FROM public.oculto_creator_wallets
        WHERE creator_id = NEW.user_id FOR UPDATE;

      UPDATE public.oculto_creator_wallets
         SET blocked_balance   = GREATEST(0, blocked_balance - NEW.amount),
             available_balance = available_balance + NEW.amount,
             updated_at        = now()
       WHERE creator_id = NEW.user_id;
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (NEW.user_id, 'unfreeze', NEW.amount, 'withdrawal_requests', NEW.id,
         jsonb_build_object('status', NEW.status))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- =====================================================================
-- 4) CHECK constraint defensivo: saldos nunca negativos
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'oculto_wallets_no_negative'
  ) THEN
    ALTER TABLE public.oculto_creator_wallets
      ADD CONSTRAINT oculto_wallets_no_negative CHECK (
        available_balance >= 0 AND
        pending_balance   >= 0 AND
        blocked_balance   >= 0
      ) NOT VALID;
    -- NOT VALID: não rejeita rows existentes inconsistentes,
    -- mas valida toda escrita futura.
  END IF;
END $$;

-- =====================================================================
-- 5) View de telemetria para o painel Stress Test (Admin Master)
-- =====================================================================
CREATE OR REPLACE VIEW public.vw_asaas_concurrency_health AS
SELECT
  -- Webhooks na última hora
  (SELECT COUNT(*) FROM public.oculto_asaas_webhook_logs
    WHERE received_at > now() - INTERVAL '1 hour') AS webhooks_last_hour,
  (SELECT COUNT(*) FROM public.oculto_asaas_webhook_logs
    WHERE received_at > now() - INTERVAL '1 hour' AND status = 'duplicated') AS duplicates_blocked_last_hour,
  (SELECT COUNT(*) FROM public.oculto_asaas_webhook_logs
    WHERE received_at > now() - INTERVAL '1 hour' AND status = 'failed') AS failures_last_hour,
  (SELECT ROUND(AVG(processing_ms))::INT FROM public.oculto_asaas_webhook_logs
    WHERE received_at > now() - INTERVAL '1 hour' AND processing_ms IS NOT NULL) AS avg_processing_ms,
  (SELECT MAX(processing_ms) FROM public.oculto_asaas_webhook_logs
    WHERE received_at > now() - INTERVAL '1 hour') AS max_processing_ms,
  -- Splits idempotentes
  (SELECT COUNT(*) FROM public.transaction_split_logs
    WHERE created_at > now() - INTERVAL '1 hour') AS splits_last_hour,
  -- Wallets com saldo negativo (deve ser sempre 0)
  (SELECT COUNT(*) FROM public.oculto_creator_wallets
    WHERE available_balance < 0 OR pending_balance < 0 OR blocked_balance < 0) AS wallets_corrupted,
  -- Pending releases atrasados
  (SELECT COUNT(*) FROM public.pending_balance_releases
    WHERE status = 'pending' AND release_at < now() - INTERVAL '1 hour') AS overdue_releases
;

GRANT SELECT ON public.vw_asaas_concurrency_health TO authenticated;

NOTIFY pgrst, 'reload schema';
