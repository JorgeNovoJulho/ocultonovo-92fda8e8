-- ============================================================
-- FINANCIAL ALERTS + PROFIT TRACKING + ENGINE + CRON  (v3)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Correções:
--   * 42P17: índice deduplicação usa coluna física + trigger (date_trunc não é IMMUTABLE)
--   * 42703: transaction_split_logs NÃO tem payer_id/buyer_id/user_id.
--            Usar creator_id (fallback affiliate_id) como user_id de tracking.
-- Novidades:
--   * Engine detecta saques suspeitos (withdrawal_requests) e fraude de afiliado
--   * RPC export CSV (profit_tracking + financial_alerts) por competência
--   * RPC resumo em tempo real (alerts por severidade + ranking de lucro)
-- ============================================================

-- ========== 1) TABELA: financial_alerts ==========
CREATE TABLE IF NOT EXISTS public.financial_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type      TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'medium',
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  metric_value    NUMERIC(14,2),
  threshold_value NUMERIC(14,2),
  ref_entity      TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID
);

ALTER TABLE public.financial_alerts
  ADD COLUMN IF NOT EXISTS dedupe_hour TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.fn_sync_financial_alert_dedupe_hour()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.dedupe_hour := date_trunc('hour', NEW.created_at);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_financial_alert_dedupe_hour ON public.financial_alerts;
CREATE TRIGGER trg_sync_financial_alert_dedupe_hour
BEFORE INSERT OR UPDATE OF created_at ON public.financial_alerts
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_financial_alert_dedupe_hour();

UPDATE public.financial_alerts
   SET dedupe_hour = date_trunc('hour', created_at)
 WHERE dedupe_hour IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_alerts_status_created
  ON public.financial_alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_alerts_type
  ON public.financial_alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_fin_alerts_severity
  ON public.financial_alerts (severity);

DROP INDEX IF EXISTS public.idx_fin_alerts_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_alerts_dedupe
  ON public.financial_alerts (alert_type, COALESCE(ref_entity,''), dedupe_hour)
  WHERE status = 'open';

ALTER TABLE public.financial_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fin_alerts_admin_all" ON public.financial_alerts;
CREATE POLICY "fin_alerts_admin_all" ON public.financial_alerts
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ========== 2) TABELA: profit_tracking ==========
CREATE TABLE IF NOT EXISTS public.profit_tracking (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_log_id      UUID UNIQUE,
  user_id           UUID,
  feature           TEXT NOT NULL,
  gross             NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax               NUMERIC(10,2) NOT NULL DEFAULT 0,
  creator_payout    NUMERIC(10,2) NOT NULL DEFAULT 0,
  affiliate_payout  NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_revenue  NUMERIC(10,2) NOT NULL DEFAULT 0,
  reference_month   DATE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profit_user    ON public.profit_tracking (user_id);
CREATE INDEX IF NOT EXISTS idx_profit_feature ON public.profit_tracking (feature);
CREATE INDEX IF NOT EXISTS idx_profit_month   ON public.profit_tracking (reference_month DESC);
CREATE INDEX IF NOT EXISTS idx_profit_created ON public.profit_tracking (created_at DESC);

ALTER TABLE public.profit_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profit_admin_all" ON public.profit_tracking;
CREATE POLICY "profit_admin_all" ON public.profit_tracking
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ========== 3) TRIGGER: registrar profit ==========
CREATE OR REPLACE FUNCTION public.fn_register_profit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profit_tracking (
    split_log_id, user_id, feature, gross, tax,
    creator_payout, affiliate_payout, platform_revenue, reference_month
  ) VALUES (
    NEW.id,
    COALESCE(NEW.creator_id, NEW.affiliate_id),
    COALESCE(NEW.flow_type, 'unknown'),
    COALESCE(NEW.gross_amount, 0),
    COALESCE(NEW.tax_amount, 0),
    COALESCE(NEW.creator_amount, 0),
    COALESCE(NEW.affiliate_amount, 0),
    COALESCE(NEW.platform_amount, 0),
    date_trunc('month', NEW.created_at)::date
  )
  ON CONFLICT (split_log_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_register_profit ON public.transaction_split_logs;
CREATE TRIGGER trg_register_profit
AFTER INSERT ON public.transaction_split_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_register_profit();

-- ========== 4) BACKFILL ==========
INSERT INTO public.profit_tracking (
  split_log_id, user_id, feature, gross, tax,
  creator_payout, affiliate_payout, platform_revenue, reference_month
)
SELECT
  l.id,
  COALESCE(l.creator_id, l.affiliate_id),
  COALESCE(l.flow_type, 'unknown'),
  COALESCE(l.gross_amount, 0),
  COALESCE(l.tax_amount, 0),
  COALESCE(l.creator_amount, 0),
  COALESCE(l.affiliate_amount, 0),
  COALESCE(l.platform_amount, 0),
  date_trunc('month', l.created_at)::date
FROM public.transaction_split_logs l
ON CONFLICT (split_log_id) DO NOTHING;

-- ========== 5) ENGINE DE ALERTAS (expandida) ==========
CREATE OR REPLACE FUNCTION public.run_financial_alerts_engine()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today_revenue NUMERIC(14,2);
  v_avg_revenue   NUMERIC(14,2);
  v_drop_pct      NUMERIC(6,2);
  v_failed_count  INTEGER;
  v_inserted      INTEGER := 0;
  r RECORD;
BEGIN
  -- 5.1 Revenue drop
  SELECT COALESCE(SUM(platform_revenue),0) INTO v_today_revenue
  FROM public.profit_tracking WHERE created_at::date = CURRENT_DATE;

  SELECT COALESCE(AVG(daily_total),0) INTO v_avg_revenue
  FROM (
    SELECT created_at::date d, SUM(platform_revenue) daily_total
    FROM public.profit_tracking
    WHERE created_at::date BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE - INTERVAL '1 day'
    GROUP BY 1
  ) s;

  IF v_avg_revenue > 0 THEN
    v_drop_pct := ROUND((1 - (v_today_revenue / v_avg_revenue)) * 100, 2);
    IF v_drop_pct >= 50 THEN
      INSERT INTO public.financial_alerts (alert_type, severity, title, message, metric_value, threshold_value, metadata)
      VALUES ('revenue_drop','high','Queda de receita detectada',
        format('Receita hoje %s vs média 7d %s (queda %s%%)', v_today_revenue, v_avg_revenue, v_drop_pct),
        v_today_revenue, v_avg_revenue, jsonb_build_object('drop_pct', v_drop_pct))
      ON CONFLICT DO NOTHING;
      v_inserted := v_inserted + 1;
    END IF;
  END IF;

  -- 5.2 Falhas de pagamento
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='asaas_payments') THEN
    EXECUTE $sql$
      SELECT COUNT(*) FROM public.asaas_payments
      WHERE status IN ('FAILED','REFUSED','OVERDUE') AND updated_at >= now() - INTERVAL '1 hour'
    $sql$ INTO v_failed_count;
    IF COALESCE(v_failed_count,0) >= 10 THEN
      INSERT INTO public.financial_alerts (alert_type, severity, title, message, metric_value, threshold_value)
      VALUES ('payment_failures','critical','Pico de falhas de pagamento',
        format('%s falhas na última hora', v_failed_count), v_failed_count, 10)
      ON CONFLICT DO NOTHING;
      v_inserted := v_inserted + 1;
    END IF;
  END IF;

  -- 5.3 Saques suspeitos: valor > 5000 OU >= 3 saques pendentes nas últimas 24h pelo mesmo usuário
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='withdrawal_requests') THEN
    FOR r IN
      SELECT user_id::text AS uid, SUM(amount)::numeric(14,2) AS total, COUNT(*) AS qty, MAX(amount)::numeric(14,2) AS max_amt
      FROM public.withdrawal_requests
      WHERE created_at >= now() - INTERVAL '24 hours'
      GROUP BY user_id
      HAVING MAX(amount) > 5000 OR COUNT(*) >= 3
    LOOP
      INSERT INTO public.financial_alerts (alert_type, severity, title, message, metric_value, threshold_value, ref_entity, metadata)
      VALUES ('suspicious_withdrawal',
              CASE WHEN r.max_amt > 10000 OR r.qty >= 5 THEN 'critical' ELSE 'high' END,
              'Saque suspeito',
              format('Usuário %s: %s saques somando R$ %s em 24h (maior R$ %s)', r.uid, r.qty, r.total, r.max_amt),
              r.total, 5000, r.uid,
              jsonb_build_object('count', r.qty, 'max_amount', r.max_amt))
      ON CONFLICT DO NOTHING;
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  -- 5.4 Fraude de afiliado: comissão > 50% do valor de origem OU spike (>20 comissões/24h por afiliado)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='referral_commissions') THEN
    FOR r IN
      SELECT affiliate_id::text AS uid,
             COUNT(*) AS qty,
             SUM(commission_amount)::numeric(14,2) AS total,
             AVG(CASE WHEN source_amount > 0 THEN commission_amount/source_amount ELSE 0 END)::numeric(6,4) AS avg_rate
      FROM public.referral_commissions
      WHERE created_at >= now() - INTERVAL '24 hours'
      GROUP BY affiliate_id
      HAVING COUNT(*) >= 20 OR AVG(CASE WHEN source_amount > 0 THEN commission_amount/source_amount ELSE 0 END) > 0.5
    LOOP
      INSERT INTO public.financial_alerts (alert_type, severity, title, message, metric_value, threshold_value, ref_entity, metadata)
      VALUES ('affiliate_fraud',
              CASE WHEN r.qty >= 50 OR r.avg_rate > 0.8 THEN 'critical' ELSE 'high' END,
              'Padrão suspeito de afiliado',
              format('Afiliado %s: %s comissões (R$ %s) em 24h, taxa média %s%%',
                     r.uid, r.qty, r.total, ROUND(r.avg_rate*100, 2)),
              r.total, 0, r.uid,
              jsonb_build_object('count', r.qty, 'avg_rate', r.avg_rate))
      ON CONFLICT DO NOTHING;
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('inserted', v_inserted, 'ran_at', now());
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('inserted', v_inserted, 'error', SQLERRM);
END; $$;

-- ========== 6) RPCs de leitura ==========
CREATE OR REPLACE FUNCTION public.get_financial_alerts(
  p_status   TEXT DEFAULT 'open',
  p_type     TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_from     TIMESTAMPTZ DEFAULT NULL,
  p_to       TIMESTAMPTZ DEFAULT NULL,
  p_limit    INT  DEFAULT 200
)
RETURNS SETOF public.financial_alerts
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM public.financial_alerts
  WHERE (p_status   IS NULL OR status = p_status)
    AND (p_type     IS NULL OR alert_type = p_type)
    AND (p_severity IS NULL OR severity = p_severity)
    AND (p_from     IS NULL OR created_at >= p_from)
    AND (p_to       IS NULL OR created_at <= p_to)
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.set_alert_status(p_id UUID, p_status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.financial_alerts
     SET status = p_status,
         resolved_at = CASE WHEN p_status IN ('resolved','ignored') THEN now() ELSE resolved_at END,
         resolved_by = CASE WHEN p_status IN ('resolved','ignored') THEN auth.uid() ELSE resolved_by END
   WHERE id = p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_profit_overview(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_from DATE := COALESCE(p_from, (CURRENT_DATE - INTERVAL '30 days')::date);
  v_to   DATE := COALESCE(p_to, CURRENT_DATE);
  v_kpi JSONB; v_by_feature JSONB; v_top_users JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'gross', COALESCE(SUM(gross),0),
    'tax', COALESCE(SUM(tax),0),
    'creator_payout', COALESCE(SUM(creator_payout),0),
    'affiliate_payout', COALESCE(SUM(affiliate_payout),0),
    'platform_revenue', COALESCE(SUM(platform_revenue),0),
    'tx_count', COUNT(*),
    'margin_pct', CASE WHEN COALESCE(SUM(gross),0)=0 THEN 0
                       ELSE ROUND((SUM(platform_revenue)/SUM(gross))*100, 2) END
  ) INTO v_kpi
  FROM public.profit_tracking WHERE created_at::date BETWEEN v_from AND v_to;

  SELECT jsonb_agg(row_to_json(t)) INTO v_by_feature FROM (
    SELECT feature, SUM(gross) gross, SUM(platform_revenue) profit, COUNT(*) tx
    FROM public.profit_tracking WHERE created_at::date BETWEEN v_from AND v_to
    GROUP BY feature ORDER BY profit DESC
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_top_users FROM (
    SELECT p.user_id,
           COALESCE(pr.username, pr.display_name, p.user_id::text) AS name,
           SUM(p.gross) gross, SUM(p.platform_revenue) profit, COUNT(*) tx
    FROM public.profit_tracking p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id OR pr.user_id = p.user_id
    WHERE p.created_at::date BETWEEN v_from AND v_to AND p.user_id IS NOT NULL
    GROUP BY p.user_id, pr.username, pr.display_name
    ORDER BY profit DESC LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'gross', (v_kpi->>'gross')::numeric,
    'tax', (v_kpi->>'tax')::numeric,
    'creator_payout', (v_kpi->>'creator_payout')::numeric,
    'affiliate_payout', (v_kpi->>'affiliate_payout')::numeric,
    'platform_revenue', (v_kpi->>'platform_revenue')::numeric,
    'tx_count', (v_kpi->>'tx_count')::int,
    'margin_pct', (v_kpi->>'margin_pct')::numeric,
    'by_feature', COALESCE(v_by_feature, '[]'::jsonb),
    'top_users', COALESCE(v_top_users, '[]'::jsonb),
    'period', jsonb_build_object('from', v_from, 'to', v_to)
  );
END; $$;

-- ========== 7) RPC: resumo em tempo real ==========
CREATE OR REPLACE FUNCTION public.get_financial_realtime_summary(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_from TIMESTAMPTZ := COALESCE(p_from, now() - INTERVAL '7 days');
  v_to   TIMESTAMPTZ := COALESCE(p_to, now());
  v_by_sev JSONB; v_by_type JSONB; v_top JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_object_agg(severity, qty) INTO v_by_sev FROM (
    SELECT severity, COUNT(*) qty FROM public.financial_alerts
    WHERE status='open' AND created_at BETWEEN v_from AND v_to
    GROUP BY severity
  ) s;

  SELECT jsonb_object_agg(alert_type, qty) INTO v_by_type FROM (
    SELECT alert_type, COUNT(*) qty FROM public.financial_alerts
    WHERE status='open' AND created_at BETWEEN v_from AND v_to
    GROUP BY alert_type
  ) s;

  SELECT jsonb_agg(row_to_json(t)) INTO v_top FROM (
    SELECT p.user_id,
           COALESCE(pr.username, pr.display_name, p.user_id::text) AS name,
           SUM(p.platform_revenue)::numeric(14,2) profit,
           COUNT(*) tx
    FROM public.profit_tracking p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id OR pr.user_id = p.user_id
    WHERE p.created_at BETWEEN v_from AND v_to AND p.user_id IS NOT NULL
    GROUP BY p.user_id, pr.username, pr.display_name
    ORDER BY profit DESC LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'open_total', (SELECT COUNT(*) FROM public.financial_alerts WHERE status='open' AND created_at BETWEEN v_from AND v_to),
    'by_severity', COALESCE(v_by_sev, '{}'::jsonb),
    'by_type', COALESCE(v_by_type, '{}'::jsonb),
    'top_users_profit', COALESCE(v_top, '[]'::jsonb),
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'generated_at', now()
  );
END; $$;

-- ========== 8) RPC: export CSV mensal ==========
CREATE OR REPLACE FUNCTION public.export_financial_monthly_csv(p_competencia DATE)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_month DATE := date_trunc('month', p_competencia)::date;
  v_next  DATE := (v_month + INTERVAL '1 month')::date;
  v_csv   TEXT := '';
  rec RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_csv := v_csv || E'==PROFIT_TRACKING==\n';
  v_csv := v_csv || 'feature,tx_count,gross,tax,creator_payout,affiliate_payout,platform_revenue' || E'\n';
  FOR rec IN
    SELECT feature,
           COUNT(*) tx,
           SUM(gross) gross, SUM(tax) tax,
           SUM(creator_payout) cp, SUM(affiliate_payout) ap,
           SUM(platform_revenue) pr
    FROM public.profit_tracking
    WHERE reference_month = v_month
    GROUP BY feature ORDER BY pr DESC
  LOOP
    v_csv := v_csv || format('%s,%s,%s,%s,%s,%s,%s', rec.feature, rec.tx, rec.gross, rec.tax, rec.cp, rec.ap, rec.pr) || E'\n';
  END LOOP;

  v_csv := v_csv || E'\n==FINANCIAL_ALERTS==\n';
  v_csv := v_csv || 'created_at,alert_type,severity,status,title,metric_value,threshold_value,ref_entity' || E'\n';
  FOR rec IN
    SELECT created_at, alert_type, severity, status, title, metric_value, threshold_value, COALESCE(ref_entity,'') ref_entity
    FROM public.financial_alerts
    WHERE created_at >= v_month AND created_at < v_next
    ORDER BY created_at
  LOOP
    v_csv := v_csv || format('%s,%s,%s,%s,"%s",%s,%s,%s',
      to_char(rec.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      rec.alert_type, rec.severity, rec.status,
      replace(rec.title, '"', ''''),
      COALESCE(rec.metric_value::text,''),
      COALESCE(rec.threshold_value::text,''),
      rec.ref_entity) || E'\n';
  END LOOP;

  RETURN v_csv;
END; $$;

-- ========== 9) CRON ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    BEGIN PERFORM cron.unschedule('run_financial_alerts_engine'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('run_financial_alerts_engine','*/15 * * * *',
      $cron$ SELECT public.run_financial_alerts_engine(); $cron$);
  END IF;
END $$;

-- ========== 10) GRANTS ==========
GRANT EXECUTE ON FUNCTION public.get_financial_alerts(TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_alert_status(UUID, TEXT)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profit_overview(DATE, DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_realtime_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_financial_monthly_csv(DATE)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_financial_alerts_engine()              TO authenticated;
