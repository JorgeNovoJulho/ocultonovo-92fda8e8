-- Ver chat (2026-05-05): auditoria fiscal + RPC mensal + export CSV backend
-- Idempotente
INSERT INTO public.tax_records (
  split_log_id, transaction_id, payment_external_id, flow_type,
  gross_amount, tax_amount, tax_rate, provider, reference_month
)
SELECT id, transaction_id, payment_external_id, flow_type,
       gross_amount, tax_amount, tax_rate, provider,
       date_trunc('month', created_at)::date
FROM public.transaction_split_logs
WHERE tax_amount > 0
ON CONFLICT (split_log_id) DO NOTHING;

CREATE OR REPLACE VIEW public.v_tax_consistency_audit AS
SELECT t.id AS split_log_id, t.transaction_id, t.flow_type,
       t.gross_amount, t.tax_amount, t.tax_rate, t.base_amount,
       ROUND((t.gross_amount * t.tax_rate)::numeric, 2) AS expected_tax,
       ROUND((t.tax_amount - (t.gross_amount * t.tax_rate))::numeric, 2) AS tax_diff,
       ROUND((t.gross_amount - t.tax_amount - t.base_amount)::numeric, 2) AS base_diff,
       t.created_at
FROM public.transaction_split_logs t
WHERE ABS(t.tax_amount - (t.gross_amount * t.tax_rate)) > 0.02
   OR ABS(t.gross_amount - t.tax_amount - t.base_amount) > 0.02;

CREATE OR REPLACE FUNCTION public.get_tax_audit_issues(
  p_start TIMESTAMPTZ DEFAULT (now() - INTERVAL '90 days'),
  p_end   TIMESTAMPTZ DEFAULT now(),
  p_limit INT DEFAULT 500
) RETURNS TABLE(
  split_log_id UUID, transaction_id TEXT, flow_type TEXT,
  gross_amount NUMERIC, tax_amount NUMERIC, tax_rate NUMERIC,
  base_amount NUMERIC, expected_tax NUMERIC,
  tax_diff NUMERIC, base_diff NUMERIC, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.* FROM public.v_tax_consistency_audit v
  WHERE v.created_at BETWEEN p_start AND p_end
    AND EXISTS (SELECT 1 FROM public.user_roles
                WHERE user_id = auth.uid()
                  AND role = ANY (ARRAY['admin','admin_master']))
  ORDER BY v.created_at DESC LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_tax_audit_issues(TIMESTAMPTZ,TIMESTAMPTZ,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_monthly_tax_report(p_year INT, p_month INT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start DATE := make_date(p_year, p_month, 1);
        v_end   DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::date;
        v JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin','admin_master'])) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'reference_month', v_start, 'tx_count', COUNT(*),
    'gross', COALESCE(SUM(gross_amount),0), 'tax', COALESCE(SUM(tax_amount),0),
    'base', COALESCE(SUM(base_amount),0), 'platform', COALESCE(SUM(platform_amount),0),
    'creator', COALESCE(SUM(creator_amount),0), 'affiliate', COALESCE(SUM(affiliate_amount),0),
    'by_flow', (SELECT jsonb_agg(row_to_json(f) ORDER BY f.flow_type) FROM (
      SELECT flow_type, COUNT(*) AS tx_count, SUM(gross_amount) AS gross,
             SUM(tax_amount) AS tax, SUM(base_amount) AS base
      FROM public.transaction_split_logs WHERE created_at >= v_start AND created_at < v_end
      GROUP BY flow_type) f),
    'daily', (SELECT jsonb_agg(row_to_json(d) ORDER BY d.day) FROM (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS tx_count,
             SUM(gross_amount) AS gross, SUM(tax_amount) AS tax, SUM(base_amount) AS base
      FROM public.transaction_split_logs WHERE created_at >= v_start AND created_at < v_end
      GROUP BY 1) d)
  ) INTO v FROM public.transaction_split_logs
  WHERE created_at >= v_start AND created_at < v_end;
  RETURN COALESCE(v, jsonb_build_object('reference_month', v_start));
END; $$;
GRANT EXECUTE ON FUNCTION public.get_monthly_tax_report(INT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.export_tax_report_csv(p_start DATE, p_end DATE)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_csv TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin','admin_master'])) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT string_agg(line, E'\n') INTO v_csv FROM (
    SELECT 'day,flow_type,tx_count,gross,tax,base' AS line, 0 AS ord
    UNION ALL
    SELECT format('%s,%s,%s,%s,%s,%s', day, flow_type, tx_count,
             to_char(gross,'FM999999990.00'),
             to_char(tax,'FM999999990.00'),
             to_char(base,'FM999999990.00')) AS line, 1 AS ord
    FROM (
      SELECT date_trunc('day', created_at)::date AS day, flow_type,
             COUNT(*) AS tx_count, SUM(gross_amount) AS gross,
             SUM(tax_amount) AS tax, SUM(base_amount) AS base
      FROM public.transaction_split_logs
      WHERE created_at::date BETWEEN p_start AND p_end
      GROUP BY 1, 2 ORDER BY 1 DESC, 2
    ) s
  ) lines;
  RETURN COALESCE(v_csv, 'day,flow_type,tx_count,gross,tax,base');
END; $$;
GRANT EXECUTE ON FUNCTION public.export_tax_report_csv(DATE,DATE) TO authenticated;
