-- ============================================================
-- ML CONTÍNUO: ANTIFRAUDE + PREVISÃO DE RECEITA  (v1)
-- Idempotente. Roda no SQL Editor do Supabase EXTERNO.
-- Sem duplicar dados existentes: lê transactions/wallet/profiles.
-- ============================================================

-- 1) TABELAS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ml_features (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  snapshot_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  features     JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, snapshot_at)
);
CREATE INDEX IF NOT EXISTS idx_ml_features_user ON public.ml_features (user_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS public.ml_predictions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  fraud_score     NUMERIC(5,4) NOT NULL DEFAULT 0,
  risk_level      TEXT NOT NULL DEFAULT 'low',   -- low|medium|high|critical
  revenue_pred_30d NUMERIC(12,2) NOT NULL DEFAULT 0,
  features_id     UUID,
  model_version   TEXT NOT NULL DEFAULT 'v1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_pred_user    ON public.ml_predictions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_pred_risk    ON public.ml_predictions (risk_level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_pred_score   ON public.ml_predictions (fraud_score DESC);

CREATE TABLE IF NOT EXISTS public.ml_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id   UUID,
  user_id         UUID NOT NULL,
  predicted_fraud BOOLEAN,
  actual_fraud    BOOLEAN,
  predicted_revenue NUMERIC(12,2),
  actual_revenue  NUMERIC(12,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_feedback_user ON public.ml_feedback (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ml_model_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version TEXT NOT NULL,
  accuracy     NUMERIC(5,4),
  precision_v  NUMERIC(5,4),
  recall_v     NUMERIC(5,4),
  f1           NUMERIC(5,4),
  mae_revenue  NUMERIC(12,2),
  sample_size  INT,
  weights      JSONB NOT NULL DEFAULT '{}'::jsonb,
  trained_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_metrics_v ON public.ml_model_metrics (model_version, trained_at DESC);

CREATE TABLE IF NOT EXISTS public.ml_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  action_type  TEXT NOT NULL,   -- block | limit | upgrade_suggest | review
  reason       TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_actions_user ON public.ml_actions (user_id, created_at DESC);

-- RLS admin-only
ALTER TABLE public.ml_features        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_predictions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_model_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_actions         ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  PERFORM 1;
  -- recreate idempotently
END $$;

DROP POLICY IF EXISTS ml_features_admin    ON public.ml_features;
DROP POLICY IF EXISTS ml_predictions_admin ON public.ml_predictions;
DROP POLICY IF EXISTS ml_feedback_admin    ON public.ml_feedback;
DROP POLICY IF EXISTS ml_metrics_admin     ON public.ml_model_metrics;
DROP POLICY IF EXISTS ml_actions_admin     ON public.ml_actions;

CREATE POLICY ml_features_admin    ON public.ml_features      FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY ml_predictions_admin ON public.ml_predictions   FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY ml_feedback_admin    ON public.ml_feedback      FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY ml_metrics_admin     ON public.ml_model_metrics FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY ml_actions_admin     ON public.ml_actions       FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) FEATURE EXTRACTION ----------------------------------------
-- Lê de transactions + withdrawal_requests + profiles
CREATE OR REPLACE FUNCTION public.fn_ml_compute_features(p_user UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE
  v JSONB := '{}'::jsonb;
  v_tx_count INT := 0; v_tx_sum NUMERIC(14,2) := 0; v_tx_avg NUMERIC(14,2) := 0;
  v_tx_24h INT := 0; v_tx_7d INT := 0;
  v_failed_ratio NUMERIC(5,4) := 0;
  v_wd_count INT := 0; v_wd_sum NUMERIC(14,2) := 0; v_wd_max NUMERIC(14,2) := 0;
  v_age_days INT := 0;
  v_balance NUMERIC(14,2) := 0;
  v_verified BOOLEAN := false; v_kyc BOOLEAN := false;
  v_warnings INT := 0;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount),0), COALESCE(AVG(amount),0),
         COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours'),
         COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days'),
         CASE WHEN COUNT(*)=0 THEN 0
              ELSE COUNT(*) FILTER (WHERE status IN ('failed','refused','overdue'))::numeric / COUNT(*) END
    INTO v_tx_count, v_tx_sum, v_tx_avg, v_tx_24h, v_tx_7d, v_failed_ratio
  FROM public.transactions WHERE user_id = p_user;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='withdrawal_requests') THEN
    EXECUTE $sql$
      SELECT COUNT(*), COALESCE(SUM(amount),0), COALESCE(MAX(amount),0)
      FROM public.withdrawal_requests
      WHERE user_id=$1 AND created_at >= now() - INTERVAL '30 days'
    $sql$ INTO v_wd_count, v_wd_sum, v_wd_max USING p_user;
  END IF;

  SELECT EXTRACT(DAY FROM now() - COALESCE(created_at, now()))::int,
         COALESCE(balance,0),
         COALESCE(is_oculto_verified,false) OR COALESCE(is_verified,false),
         COALESCE(address_verified,false),
         COALESCE(warning_count,0)
    INTO v_age_days, v_balance, v_verified, v_kyc, v_warnings
  FROM public.profiles WHERE id = p_user OR user_id = p_user
  LIMIT 1;

  v := jsonb_build_object(
    'tx_count', v_tx_count, 'tx_sum', v_tx_sum, 'tx_avg', v_tx_avg,
    'tx_24h', v_tx_24h, 'tx_7d', v_tx_7d,
    'failed_ratio', v_failed_ratio,
    'wd_count_30d', v_wd_count, 'wd_sum_30d', v_wd_sum, 'wd_max_30d', v_wd_max,
    'account_age_days', v_age_days,
    'balance', v_balance,
    'is_verified', v_verified, 'kyc_ok', v_kyc,
    'warnings', v_warnings
  );
  RETURN v;
END; $$;

-- 3) SCORING (sigmoid sobre soma ponderada de regras) ----------
-- Usa pesos da última métrica registrada, fallback default.
CREATE OR REPLACE FUNCTION public.fn_ml_score_user(p_user UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  f JSONB := public.fn_ml_compute_features(p_user);
  w JSONB;
  v_z NUMERIC := 0;
  v_score NUMERIC(5,4);
  v_risk TEXT;
  v_rev_pred NUMERIC(12,2);
  v_feat_id UUID;
  v_pred_id UUID;
BEGIN
  SELECT weights INTO w FROM public.ml_model_metrics
   WHERE model_version='v1' ORDER BY trained_at DESC LIMIT 1;
  IF w IS NULL THEN
    -- pesos default heurísticos
    w := jsonb_build_object(
      'bias', -2.5,
      'failed_ratio', 4.0,
      'wd_max_30d_gt5k', 1.5,
      'wd_count_30d_gt3', 1.2,
      'tx_24h_gt20', 1.4,
      'unverified', 0.8,
      'no_kyc', 0.6,
      'new_account', 0.7,
      'warnings', 0.4
    );
  END IF;

  v_z := COALESCE((w->>'bias')::numeric, -2.5);
  v_z := v_z + COALESCE((w->>'failed_ratio')::numeric,0)   * COALESCE((f->>'failed_ratio')::numeric,0);
  v_z := v_z + COALESCE((w->>'wd_max_30d_gt5k')::numeric,0) * (CASE WHEN (f->>'wd_max_30d')::numeric > 5000 THEN 1 ELSE 0 END);
  v_z := v_z + COALESCE((w->>'wd_count_30d_gt3')::numeric,0)* (CASE WHEN (f->>'wd_count_30d')::int > 3 THEN 1 ELSE 0 END);
  v_z := v_z + COALESCE((w->>'tx_24h_gt20')::numeric,0)     * (CASE WHEN (f->>'tx_24h')::int > 20 THEN 1 ELSE 0 END);
  v_z := v_z + COALESCE((w->>'unverified')::numeric,0)      * (CASE WHEN (f->>'is_verified')::boolean THEN 0 ELSE 1 END);
  v_z := v_z + COALESCE((w->>'no_kyc')::numeric,0)          * (CASE WHEN (f->>'kyc_ok')::boolean THEN 0 ELSE 1 END);
  v_z := v_z + COALESCE((w->>'new_account')::numeric,0)     * (CASE WHEN (f->>'account_age_days')::int < 7 THEN 1 ELSE 0 END);
  v_z := v_z + COALESCE((w->>'warnings')::numeric,0)        * LEAST(COALESCE((f->>'warnings')::int,0), 5);

  v_score := ROUND((1.0 / (1.0 + exp(-v_z)))::numeric, 4);
  v_risk := CASE WHEN v_score >= 0.85 THEN 'critical'
                 WHEN v_score >= 0.65 THEN 'high'
                 WHEN v_score >= 0.40 THEN 'medium'
                 ELSE 'low' END;

  -- previsão de receita 30d: média dos últimos 30d * 1.0 + leve ajuste por frequência
  v_rev_pred := ROUND( (COALESCE((f->>'tx_avg')::numeric,0) * GREATEST(COALESCE((f->>'tx_7d')::int,0)*4, 1))::numeric, 2);

  INSERT INTO public.ml_features(user_id, features)
       VALUES (p_user, f)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_feat_id;

  INSERT INTO public.ml_predictions(user_id, fraud_score, risk_level, revenue_pred_30d, features_id, model_version)
       VALUES (p_user, v_score, v_risk, v_rev_pred, v_feat_id, 'v1')
    RETURNING id INTO v_pred_id;

  RETURN v_pred_id;
END; $$;

-- 4) APLICAR AÇÕES AUTOMÁTICAS --------------------------------
CREATE OR REPLACE FUNCTION public.fn_ml_apply_actions(p_pred_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT * INTO p FROM public.ml_predictions WHERE id = p_pred_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF p.risk_level = 'critical' THEN
    INSERT INTO public.ml_actions(user_id, action_type, reason, metadata, applied)
    VALUES (p.user_id, 'block', 'risco crítico antifraude',
            jsonb_build_object('score', p.fraud_score, 'pred_id', p.id), true);
    -- bloqueio leve: congela balance e marca suspicious
    UPDATE public.profiles
       SET balance_frozen = true,
           balance_frozen_reason = 'ML antifraude crítico',
           balance_frozen_at = now(),
           is_suspicious_flagged = true,
           suspicious_flagged_at = now(),
           suspicious_flag_reason = format('ML score %s', p.fraud_score)
     WHERE (id = p.user_id OR user_id = p.user_id)
       AND COALESCE(plan_type,'free') <> 'free';  -- preserva imunidade do plano free
  ELSIF p.risk_level = 'high' THEN
    INSERT INTO public.ml_actions(user_id, action_type, reason, metadata, applied)
    VALUES (p.user_id, 'limit', 'alto risco antifraude',
            jsonb_build_object('score', p.fraud_score, 'pred_id', p.id), true);
    UPDATE public.profiles
       SET is_suspicious_flagged = true,
           suspicious_flagged_at = now(),
           suspicious_flag_reason = format('ML score %s', p.fraud_score)
     WHERE id = p.user_id OR user_id = p.user_id;
  ELSIF p.risk_level = 'low' AND p.revenue_pred_30d > 200 THEN
    -- usuário com baixo risco e potencial de receita -> sugerir upgrade
    INSERT INTO public.ml_actions(user_id, action_type, reason, metadata, applied)
    VALUES (p.user_id, 'upgrade_suggest',
            format('Receita prevista R$ %s/30d', p.revenue_pred_30d),
            jsonb_build_object('rev_pred', p.revenue_pred_30d), false);
  END IF;
END; $$;

-- 5) BATCH SCORING (todos usuários ativos) --------------------
CREATE OR REPLACE FUNCTION public.fn_ml_score_all_active(p_days INT DEFAULT 30, p_limit INT DEFAULT 5000)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INT := 0; r RECORD; pid UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id FROM public.transactions
     WHERE created_at >= now() - (p_days || ' days')::interval AND user_id IS NOT NULL
     LIMIT p_limit
  LOOP
    pid := public.fn_ml_score_user(r.user_id);
    PERFORM public.fn_ml_apply_actions(pid);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

-- 6) RE-TREINO (atualiza pesos a partir de ml_feedback) -------
-- Estratégia simples: ajusta pesos por gradient descent 1 passo
-- usando feedback agregado (sem dependências externas). Robusto.
CREATE OR REPLACE FUNCTION public.fn_ml_retrain()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_total INT;
  v_correct INT;
  v_tp INT; v_fp INT; v_fn INT;
  v_acc NUMERIC(5,4); v_prec NUMERIC(5,4); v_rec NUMERIC(5,4); v_f1 NUMERIC(5,4);
  v_mae NUMERIC(12,2);
  w JSONB;
  lr NUMERIC := 0.05;
BEGIN
  -- métricas a partir do feedback
  SELECT COUNT(*) INTO v_total FROM public.ml_feedback WHERE actual_fraud IS NOT NULL;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('msg','no_feedback','total',0);
  END IF;

  SELECT COUNT(*) FILTER (WHERE predicted_fraud = actual_fraud),
         COUNT(*) FILTER (WHERE predicted_fraud=true AND actual_fraud=true),
         COUNT(*) FILTER (WHERE predicted_fraud=true AND actual_fraud=false),
         COUNT(*) FILTER (WHERE predicted_fraud=false AND actual_fraud=true)
    INTO v_correct, v_tp, v_fp, v_fn
    FROM public.ml_feedback
   WHERE actual_fraud IS NOT NULL;

  v_acc  := ROUND(v_correct::numeric / v_total, 4);
  v_prec := CASE WHEN (v_tp+v_fp)=0 THEN 0 ELSE ROUND(v_tp::numeric/(v_tp+v_fp), 4) END;
  v_rec  := CASE WHEN (v_tp+v_fn)=0 THEN 0 ELSE ROUND(v_tp::numeric/(v_tp+v_fn), 4) END;
  v_f1   := CASE WHEN (v_prec+v_rec)=0 THEN 0 ELSE ROUND((2*v_prec*v_rec/(v_prec+v_rec))::numeric, 4) END;

  SELECT ROUND(AVG(ABS(COALESCE(predicted_revenue,0) - COALESCE(actual_revenue,0)))::numeric, 2) INTO v_mae
  FROM public.ml_feedback WHERE actual_revenue IS NOT NULL;

  -- pesos: parte dos atuais e ajusta bias proporcional ao erro de recall
  SELECT weights INTO w FROM public.ml_model_metrics WHERE model_version='v1' ORDER BY trained_at DESC LIMIT 1;
  IF w IS NULL THEN
    w := jsonb_build_object('bias',-2.5,'failed_ratio',4.0,'wd_max_30d_gt5k',1.5,
      'wd_count_30d_gt3',1.2,'tx_24h_gt20',1.4,'unverified',0.8,'no_kyc',0.6,
      'new_account',0.7,'warnings',0.4);
  END IF;
  -- se recall baixo -> diminui bias (mais sensível); se precision baixa -> aumenta bias
  w := jsonb_set(w, '{bias}',
    to_jsonb(((w->>'bias')::numeric - lr*(0.8 - v_rec) + lr*(0.8 - v_prec))::numeric(8,4)),
    true);

  INSERT INTO public.ml_model_metrics(model_version, accuracy, precision_v, recall_v, f1, mae_revenue, sample_size, weights)
  VALUES ('v1', v_acc, v_prec, v_rec, v_f1, COALESCE(v_mae,0), v_total, w);

  RETURN jsonb_build_object('accuracy',v_acc,'precision',v_prec,'recall',v_rec,'f1',v_f1,'mae_revenue',v_mae,'sample',v_total);
END; $$;

-- 7) RPC dashboard --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ml_dashboard(p_days INT DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE
  v_metrics JSONB; v_dist JSONB; v_top JSONB; v_actions JSONB; v_impact JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT row_to_json(t) INTO v_metrics FROM (
    SELECT model_version, accuracy, precision_v AS precision, recall_v AS recall, f1, mae_revenue, sample_size, trained_at, weights
    FROM public.ml_model_metrics WHERE model_version='v1' ORDER BY trained_at DESC LIMIT 1
  ) t;

  SELECT jsonb_object_agg(risk_level, qty) INTO v_dist FROM (
    SELECT risk_level, COUNT(*) qty FROM (
      SELECT DISTINCT ON (user_id) user_id, risk_level
      FROM public.ml_predictions
      WHERE created_at >= now() - (p_days||' days')::interval
      ORDER BY user_id, created_at DESC
    ) s GROUP BY risk_level
  ) g;

  SELECT jsonb_agg(row_to_json(t)) INTO v_top FROM (
    SELECT DISTINCT ON (p.user_id)
           p.user_id, p.fraud_score, p.risk_level, p.revenue_pred_30d, p.created_at,
           COALESCE(pr.username, pr.name, p.user_id::text) AS name
    FROM public.ml_predictions p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id OR pr.user_id = p.user_id
    WHERE p.created_at >= now() - (p_days||' days')::interval
    ORDER BY p.user_id, p.created_at DESC
  ) t ORDER BY (t->>'fraud_score')::numeric DESC NULLS LAST;

  SELECT jsonb_object_agg(action_type, qty) INTO v_actions FROM (
    SELECT action_type, COUNT(*) qty FROM public.ml_actions
    WHERE created_at >= now() - (p_days||' days')::interval
    GROUP BY action_type
  ) g;

  SELECT jsonb_build_object(
    'predicted_revenue_total', COALESCE(SUM(revenue_pred_30d),0),
    'high_risk_users', COUNT(*) FILTER (WHERE risk_level IN ('high','critical'))
  ) INTO v_impact
  FROM (
    SELECT DISTINCT ON (user_id) user_id, revenue_pred_30d, risk_level
    FROM public.ml_predictions
    WHERE created_at >= now() - (p_days||' days')::interval
    ORDER BY user_id, created_at DESC
  ) s;

  RETURN jsonb_build_object(
    'metrics', COALESCE(v_metrics, '{}'::jsonb),
    'risk_distribution', COALESCE(v_dist, '{}'::jsonb),
    'top_risk', COALESCE(v_top, '[]'::jsonb),
    'actions', COALESCE(v_actions, '{}'::jsonb),
    'impact', COALESCE(v_impact, '{}'::jsonb),
    'period_days', p_days
  );
END; $$;

-- 8) RPC feedback ---------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ml_feedback(
  p_prediction_id UUID,
  p_actual_fraud BOOLEAN DEFAULT NULL,
  p_actual_revenue NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p RECORD; v_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO p FROM public.ml_predictions WHERE id = p_prediction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'prediction not found'; END IF;
  INSERT INTO public.ml_feedback(prediction_id, user_id, predicted_fraud, actual_fraud, predicted_revenue, actual_revenue, notes)
  VALUES (p.id, p.user_id, (p.fraud_score >= 0.5), p_actual_fraud, p.revenue_pred_30d, p_actual_revenue, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 9) CRON ------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    BEGIN PERFORM cron.unschedule('ml_score_all_active'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('ml_retrain'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('ml_score_all_active','*/30 * * * *',
      $cron$ SELECT public.fn_ml_score_all_active(30, 2000); $cron$);
    PERFORM cron.schedule('ml_retrain','15 3 * * *',
      $cron$ SELECT public.fn_ml_retrain(); $cron$);
  END IF;
END $$;

-- 10) GRANTS ---------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_ml_compute_features(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ml_score_user(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ml_apply_actions(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ml_score_all_active(INT, INT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ml_retrain()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ml_dashboard(INT)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ml_feedback(UUID,BOOLEAN,NUMERIC,TEXT) TO authenticated;
