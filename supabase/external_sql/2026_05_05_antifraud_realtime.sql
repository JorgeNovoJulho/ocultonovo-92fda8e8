-- =====================================================================
-- ANTIFRAUDE REALTIME — RPC dedicada ao painel de monitoramento
-- Idempotente. Apoia-se em ml_predictions, ml_actions, financial_alerts.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_antifraud_realtime(p_window_minutes INT DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(mins => GREATEST(p_window_minutes, 5));
  v_24h timestamptz := now() - interval '24 hours';
  v_kpis jsonb;
  v_dist jsonb;
  v_actions jsonb;
  v_top jsonb;
  v_alerts jsonb;
  v_timeline jsonb;
BEGIN
  -- KPIs principais
  SELECT jsonb_build_object(
    'predictions_window', COUNT(*) FILTER (WHERE created_at >= v_since),
    'predictions_24h', COUNT(*) FILTER (WHERE created_at >= v_24h),
    'critical_window', COUNT(*) FILTER (WHERE created_at >= v_since AND risk_level = 'critical'),
    'high_window', COUNT(*) FILTER (WHERE created_at >= v_since AND risk_level = 'high'),
    'avg_score_window', COALESCE(ROUND(AVG(fraud_score) FILTER (WHERE created_at >= v_since)::numeric, 4), 0),
    'max_score_window', COALESCE(MAX(fraud_score) FILTER (WHERE created_at >= v_since), 0)
  ) INTO v_kpis
  FROM public.ml_predictions
  WHERE created_at >= v_24h;

  -- Distribuição por bucket de score (janela)
  SELECT jsonb_object_agg(bucket, qty) INTO v_dist
  FROM (
    SELECT
      CASE
        WHEN fraud_score >= 0.85 THEN '0.85-1.00'
        WHEN fraud_score >= 0.70 THEN '0.70-0.85'
        WHEN fraud_score >= 0.50 THEN '0.50-0.70'
        WHEN fraud_score >= 0.30 THEN '0.30-0.50'
        ELSE '0.00-0.30'
      END AS bucket,
      COUNT(*) AS qty
    FROM public.ml_predictions
    WHERE created_at >= v_since
    GROUP BY 1
  ) s;

  -- Ações automáticas executadas
  SELECT jsonb_object_agg(action_type, qty) INTO v_actions
  FROM (
    SELECT action_type, COUNT(*) AS qty
    FROM public.ml_actions
    WHERE created_at >= v_24h
    GROUP BY action_type
  ) s;

  -- Top usuários de risco (janela)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top
  FROM (
    SELECT
      p.user_id,
      COALESCE(pr.display_name, pr.username, 'Usuário') AS name,
      pr.avatar_url,
      p.fraud_score,
      p.risk_level,
      p.revenue_pred_30d,
      p.created_at,
      (SELECT COUNT(*) FROM public.ml_actions a WHERE a.user_id = p.user_id AND a.created_at >= v_24h) AS actions_24h
    FROM public.ml_predictions p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id OR pr.user_id = p.user_id
    WHERE p.created_at >= v_since
    ORDER BY p.fraud_score DESC, p.created_at DESC
    LIMIT 25
  ) t;

  -- Alertas financeiros relacionados a fraude (abertos)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_alerts
  FROM (
    SELECT id, alert_type, severity, title, message, payload, created_at
    FROM public.financial_alerts
    WHERE status = 'open'
      AND alert_type IN ('affiliate_fraud', 'suspicious_withdrawal', 'payment_failure_spike')
    ORDER BY created_at DESC
    LIMIT 20
  ) t;

  -- Timeline horária (últimas 24h)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t.hour)), '[]'::jsonb) INTO v_timeline
  FROM (
    SELECT
      date_trunc('hour', created_at) AS hour,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE risk_level IN ('critical','high')) AS high_risk,
      ROUND(AVG(fraud_score)::numeric, 3) AS avg_score
    FROM public.ml_predictions
    WHERE created_at >= v_24h
    GROUP BY 1
    ORDER BY 1
  ) t;

  RETURN jsonb_build_object(
    'window_minutes', p_window_minutes,
    'generated_at', now(),
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'distribution', COALESCE(v_dist, '{}'::jsonb),
    'actions_24h', COALESCE(v_actions, '{}'::jsonb),
    'top_risk', v_top,
    'open_alerts', v_alerts,
    'timeline_24h', v_timeline
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_antifraud_realtime(INT) TO authenticated;
