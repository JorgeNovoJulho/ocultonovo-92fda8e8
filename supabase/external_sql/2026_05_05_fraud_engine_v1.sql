-- =====================================================================
-- FRAUD ENGINE v1 — Decisão + Execução automática
-- Idempotente. Não duplica tabelas existentes (ml_predictions, ml_actions,
-- financial_alerts, profiles, user_credits, withdrawal_requests).
-- Roda no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Aliases semânticos (views) — sem duplicar dados
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.fraud_scores AS
SELECT
  id,
  user_id,
  fraud_score AS score,
  risk_level,
  features_id,
  model_version,
  created_at
FROM public.ml_predictions;

CREATE OR REPLACE VIEW public.fraud_actions AS
SELECT
  id,
  user_id,
  action_type AS action,
  reason,
  metadata,
  applied,
  created_at
FROM public.ml_actions;

GRANT SELECT ON public.fraud_scores  TO authenticated;
GRANT SELECT ON public.fraud_actions TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Helper: extrai sinais reais do usuário (sem mock)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_extract_signals(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_count_24h     INT     := 0;
  v_tx_count_7d      INT     := 0;
  v_avg_amount       NUMERIC := 0;
  v_max_amount       NUMERIC := 0;
  v_total_30d        NUMERIC := 0;
  v_total_prev_30d   NUMERIC := 0;
  v_growth_ratio     NUMERIC := 0;
  v_pending_payouts  INT     := 0;
  v_self_referrals   INT     := 0;
  v_kyc_ok           BOOLEAN := false;
  v_account_age_days INT     := 0;
  v_ip_collisions    INT     := 0;
BEGIN
  -- Transações reais
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='transactions') THEN
    SELECT
      COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
      COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days'),
      COALESCE(AVG(amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0),
      COALESCE(MAX(amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0),
      COALESCE(SUM(amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0),
      COALESCE(SUM(amount) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days'), 0)
    INTO v_tx_count_24h, v_tx_count_7d, v_avg_amount, v_max_amount, v_total_30d, v_total_prev_30d
    FROM public.transactions
    WHERE (user_id = p_user_id OR seller_id = p_user_id)
      AND status = 'completed';
  END IF;

  v_growth_ratio := CASE WHEN v_total_prev_30d > 0
                         THEN ROUND((v_total_30d / v_total_prev_30d)::numeric, 2)
                         ELSE CASE WHEN v_total_30d > 0 THEN 99 ELSE 0 END
                    END;

  -- Saques pendentes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='withdrawal_requests') THEN
    SELECT COUNT(*) INTO v_pending_payouts
    FROM public.withdrawal_requests
    WHERE user_id = p_user_id AND status = 'pending';
  END IF;

  -- Auto-indicação (referral apontando p/ si mesmo via IP/device — heurística leve)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='referrals') THEN
    SELECT COUNT(*) INTO v_self_referrals
    FROM public.referrals
    WHERE referrer_user_id = p_user_id AND referred_user_id = p_user_id;
  END IF;

  -- KYC + idade da conta
  SELECT
    COALESCE(document_verified, false),
    EXTRACT(DAY FROM (now() - created_at))::int
  INTO v_kyc_ok, v_account_age_days
  FROM public.profiles
  WHERE id = p_user_id OR user_id = p_user_id
  LIMIT 1;

  -- Colisão de IP/device (multi-conta) via tabela de sessões, se existir
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_sessions') THEN
    EXECUTE format($f$
      SELECT COUNT(DISTINCT s2.user_id)
      FROM public.user_sessions s1
      JOIN public.user_sessions s2 ON s1.ip = s2.ip AND s1.user_id <> s2.user_id
      WHERE s1.user_id = %L
    $f$, p_user_id) INTO v_ip_collisions;
  END IF;

  RETURN jsonb_build_object(
    'tx_count_24h', v_tx_count_24h,
    'tx_count_7d', v_tx_count_7d,
    'avg_amount', v_avg_amount,
    'max_amount', v_max_amount,
    'total_30d', v_total_30d,
    'total_prev_30d', v_total_prev_30d,
    'growth_ratio', v_growth_ratio,
    'pending_payouts', v_pending_payouts,
    'self_referrals', v_self_referrals,
    'kyc_ok', v_kyc_ok,
    'account_age_days', COALESCE(v_account_age_days, 0),
    'ip_collisions', COALESCE(v_ip_collisions, 0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.fraud_extract_signals(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Engine principal — calcula score, persiste e aplica ações
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_fraud_score(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signals     JSONB;
  v_score       NUMERIC := 0;
  v_risk        TEXT := 'low';
  v_features_id UUID;
  v_pred_id     UUID;
  v_reasons     TEXT[] := ARRAY[]::TEXT[];
  v_action      TEXT := NULL;
BEGIN
  v_signals := public.fraud_extract_signals(p_user_id);

  -- Pesos (somam 1.0 no pior caso). Tudo clamp em [0,1].
  -- Frequência anormal
  IF (v_signals->>'tx_count_24h')::int >= 20 THEN
    v_score := v_score + 0.20; v_reasons := array_append(v_reasons, 'tx_burst_24h');
  ELSIF (v_signals->>'tx_count_24h')::int >= 10 THEN
    v_score := v_score + 0.10;
  END IF;

  -- Explosão de ganhos vs mês anterior
  IF (v_signals->>'growth_ratio')::numeric >= 10 THEN
    v_score := v_score + 0.25; v_reasons := array_append(v_reasons, 'revenue_explosion');
  ELSIF (v_signals->>'growth_ratio')::numeric >= 4 THEN
    v_score := v_score + 0.12;
  END IF;

  -- Multi-conta (IP/device colisão)
  IF (v_signals->>'ip_collisions')::int >= 3 THEN
    v_score := v_score + 0.20; v_reasons := array_append(v_reasons, 'multi_account_ip');
  ELSIF (v_signals->>'ip_collisions')::int >= 1 THEN
    v_score := v_score + 0.08;
  END IF;

  -- Auto-indicação
  IF (v_signals->>'self_referrals')::int > 0 THEN
    v_score := v_score + 0.15; v_reasons := array_append(v_reasons, 'self_referral');
  END IF;

  -- KYC ausente + valor alto
  IF NOT (v_signals->>'kyc_ok')::boolean AND (v_signals->>'max_amount')::numeric > 500 THEN
    v_score := v_score + 0.15; v_reasons := array_append(v_reasons, 'no_kyc_high_value');
  END IF;

  -- Conta nova + payout pendente
  IF (v_signals->>'account_age_days')::int < 7 AND (v_signals->>'pending_payouts')::int > 0 THEN
    v_score := v_score + 0.10; v_reasons := array_append(v_reasons, 'new_account_payout');
  END IF;

  v_score := LEAST(v_score, 1.0);

  -- Classificação
  v_risk := CASE
    WHEN v_score >= 0.85 THEN 'critical'
    WHEN v_score >= 0.65 THEN 'high'
    WHEN v_score >= 0.40 THEN 'medium'
    ELSE 'low'
  END;

  -- Persiste features + predição
  INSERT INTO public.ml_features (user_id, features)
  VALUES (p_user_id, v_signals)
  ON CONFLICT (user_id, snapshot_at) DO NOTHING
  RETURNING id INTO v_features_id;

  INSERT INTO public.ml_predictions (user_id, fraud_score, risk_level, features_id, model_version)
  VALUES (p_user_id, v_score, v_risk, v_features_id, 'fraud_engine_v1')
  RETURNING id INTO v_pred_id;

  -- Ações automáticas
  IF v_risk = 'medium' THEN
    v_action := 'limit_withdrawal';
    INSERT INTO public.ml_actions (user_id, action_type, reason, metadata, applied)
    VALUES (p_user_id, v_action, array_to_string(v_reasons, ','),
            jsonb_build_object('score', v_score, 'signals', v_signals), true);

    -- bloqueia saques pendentes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='withdrawal_requests') THEN
      UPDATE public.withdrawal_requests
         SET status = 'rejected',
             admin_notes = COALESCE(admin_notes,'') || ' [auto: medium fraud risk]'
       WHERE user_id = p_user_id AND status = 'pending';
    END IF;

  ELSIF v_risk IN ('high','critical') THEN
    v_action := 'freeze_account';
    INSERT INTO public.ml_actions (user_id, action_type, reason, metadata, applied)
    VALUES (p_user_id, v_action, array_to_string(v_reasons, ','),
            jsonb_build_object('score', v_score, 'signals', v_signals), true);

    -- congela saldo + créditos
    UPDATE public.profiles
       SET balance_frozen = true,
           balance_frozen_reason = 'auto_fraud:' || array_to_string(v_reasons, ','),
           balance_frozen_at = now()
     WHERE id = p_user_id OR user_id = p_user_id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_credits') THEN
      UPDATE public.user_credits
         SET credits_frozen = true,
             frozen_reason = 'auto_fraud:' || array_to_string(v_reasons, ','),
             frozen_at = now()
       WHERE user_id = p_user_id;
    END IF;

    -- cancela payouts pendentes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='withdrawal_requests') THEN
      UPDATE public.withdrawal_requests
         SET status = 'rejected',
             admin_notes = COALESCE(admin_notes,'') || ' [auto: ' || v_risk || ' fraud]'
       WHERE user_id = p_user_id AND status = 'pending';
    END IF;

    -- alerta financeiro
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_alerts') THEN
      INSERT INTO public.financial_alerts (alert_type, severity, title, message, payload, status)
      VALUES ('affiliate_fraud',
              CASE WHEN v_risk = 'critical' THEN 'critical' ELSE 'high' END,
              'Conta congelada por fraude (' || v_risk || ')',
              'user_id=' || p_user_id || ' score=' || v_score,
              jsonb_build_object('user_id', p_user_id, 'score', v_score, 'reasons', v_reasons, 'signals', v_signals),
              'open');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'score', v_score,
    'risk_level', v_risk,
    'reasons', v_reasons,
    'action', v_action,
    'prediction_id', v_pred_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.compute_fraud_score(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Sweep em lote — para cron / edge function
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_fraud_sweep(p_limit INT DEFAULT 200)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_processed INT := 0;
  v_high INT := 0;
  v_med  INT := 0;
  v_res JSONB;
BEGIN
  FOR v_user IN
    SELECT DISTINCT u.user_id
    FROM (
      SELECT user_id  FROM public.transactions
       WHERE created_at >= now() - interval '24 hours' AND user_id IS NOT NULL
      UNION
      SELECT seller_id FROM public.transactions
       WHERE created_at >= now() - interval '24 hours' AND seller_id IS NOT NULL
      UNION
      SELECT user_id  FROM public.withdrawal_requests
       WHERE created_at >= now() - interval '24 hours'
    ) u
    LIMIT p_limit
  LOOP
    v_res := public.compute_fraud_score(v_user.user_id);
    v_processed := v_processed + 1;
    IF v_res->>'risk_level' IN ('high','critical') THEN v_high := v_high + 1; END IF;
    IF v_res->>'risk_level' = 'medium' THEN v_med := v_med + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'high_or_critical', v_high,
    'medium', v_med,
    'ran_at', now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.run_fraud_sweep(INT) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Trigger guard: bloqueia INSERT em withdrawal_requests se usuário
--    tiver ação ativa de freeze/limit nas últimas 24h.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_withdrawal_fraud()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked BOOLEAN := false;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.ml_actions
    WHERE user_id = NEW.user_id
      AND action_type IN ('freeze_account','limit_withdrawal')
      AND applied = true
      AND created_at >= now() - interval '24 hours'
  ) INTO v_blocked;

  IF v_blocked THEN
    RAISE EXCEPTION 'Saque bloqueado pelo sistema antifraude. Contate o suporte.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_withdrawal_fraud ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_fraud
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_fraud();

-- ---------------------------------------------------------------------
-- 6) RPC para admin: revisar (falso positivo) + alimentar ml_feedback
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_review_decision(
  p_user_id UUID,
  p_prediction_id UUID,
  p_actual_fraud BOOLEAN,
  p_unfreeze BOOLEAN DEFAULT false,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pred RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_pred FROM public.ml_predictions WHERE id = p_prediction_id;

  INSERT INTO public.ml_feedback (prediction_id, user_id, predicted_fraud, actual_fraud, notes)
  VALUES (p_prediction_id, p_user_id, v_pred.risk_level IN ('high','critical'), p_actual_fraud, p_notes);

  IF p_unfreeze THEN
    UPDATE public.profiles
       SET balance_frozen = false, balance_frozen_reason = NULL, balance_frozen_at = NULL
     WHERE id = p_user_id OR user_id = p_user_id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_credits') THEN
      UPDATE public.user_credits SET credits_frozen = false, frozen_reason = NULL, frozen_at = NULL
       WHERE user_id = p_user_id;
    END IF;

    INSERT INTO public.ml_actions (user_id, action_type, reason, metadata, applied)
    VALUES (p_user_id, 'unfreeze', 'admin_review_false_positive',
            jsonb_build_object('prediction_id', p_prediction_id, 'admin', auth.uid()), true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'unfrozen', p_unfreeze);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fraud_review_decision(UUID, UUID, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
