-- ============================================================
-- Sistema Fiscal + Relatórios Financeiros (idempotente)
-- ============================================================

-- 1) tax_records: 1 registro por split processado
CREATE TABLE IF NOT EXISTS public.tax_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_log_id UUID NOT NULL UNIQUE REFERENCES public.transaction_split_logs(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  payment_external_id TEXT NOT NULL,
  flow_type TEXT NOT NULL,
  gross_amount NUMERIC(10,2) NOT NULL,
  tax_amount NUMERIC(10,2) NOT NULL,
  tax_rate NUMERIC(5,4) NOT NULL,
  provider TEXT,
  reference_month DATE NOT NULL, -- primeiro dia do mês de competência
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_records_month ON public.tax_records(reference_month DESC);
CREATE INDEX IF NOT EXISTS idx_tax_records_flow ON public.tax_records(flow_type, reference_month DESC);

ALTER TABLE public.tax_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read tax_records" ON public.tax_records;
CREATE POLICY "Admins read tax_records" ON public.tax_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
              AND role = ANY (ARRAY['admin','admin_master']))
  );

DROP POLICY IF EXISTS "Service role manages tax_records" ON public.tax_records;
CREATE POLICY "Service role manages tax_records" ON public.tax_records
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2) Trigger: ao inserir em transaction_split_logs, registra tax_records
CREATE OR REPLACE FUNCTION public.fn_register_tax_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tax_amount IS NOT NULL AND NEW.tax_amount > 0 THEN
    INSERT INTO public.tax_records (
      split_log_id, transaction_id, payment_external_id, flow_type,
      gross_amount, tax_amount, tax_rate, provider, reference_month
    ) VALUES (
      NEW.id, NEW.transaction_id, NEW.payment_external_id, NEW.flow_type,
      NEW.gross_amount, NEW.tax_amount, NEW.tax_rate, NEW.provider,
      date_trunc('month', NEW.created_at)::date
    )
    ON CONFLICT (split_log_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_register_tax_record ON public.transaction_split_logs;
CREATE TRIGGER trg_register_tax_record
AFTER INSERT ON public.transaction_split_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_register_tax_record();

-- Backfill (idempotente)
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

-- 3) RPC: visão geral admin
CREATE OR REPLACE FUNCTION public.get_finance_overview(
  p_start TIMESTAMPTZ DEFAULT (now() - INTERVAL '30 days'),
  p_end   TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = auth.uid()
                   AND role = ANY (ARRAY['admin','admin_master'])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'gross_total',     COALESCE(SUM(gross_amount),0),
    'tax_total',       COALESCE(SUM(tax_amount),0),
    'platform_total',  COALESCE(SUM(platform_amount),0),
    'affiliate_total', COALESCE(SUM(affiliate_amount),0),
    'creator_total',   COALESCE(SUM(creator_amount),0),
    'tx_count',        COUNT(*),
    'by_flow', (
      SELECT jsonb_object_agg(flow_type, totals) FROM (
        SELECT flow_type, jsonb_build_object(
          'gross', SUM(gross_amount),
          'tax',   SUM(tax_amount),
          'platform', SUM(platform_amount),
          'creator',  SUM(creator_amount),
          'affiliate',SUM(affiliate_amount),
          'count',    COUNT(*)
        ) AS totals
        FROM public.transaction_split_logs
        WHERE created_at BETWEEN p_start AND p_end
        GROUP BY flow_type
      ) s
    ),
    'daily', (
      SELECT jsonb_agg(row_to_json(d) ORDER BY d.day) FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               SUM(gross_amount)    AS gross,
               SUM(tax_amount)      AS tax,
               SUM(platform_amount) AS platform,
               SUM(creator_amount)  AS creator,
               SUM(affiliate_amount) AS affiliate
        FROM public.transaction_split_logs
        WHERE created_at BETWEEN p_start AND p_end
        GROUP BY 1 ORDER BY 1
      ) d
    )
  ) INTO v
  FROM public.transaction_split_logs
  WHERE created_at BETWEEN p_start AND p_end;

  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_overview(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

-- 4) RPC: relatório fiscal por período (linha por dia)
CREATE OR REPLACE FUNCTION public.get_tax_report_period(
  p_start DATE, p_end DATE
)
RETURNS TABLE(
  day DATE, flow_type TEXT, tx_count BIGINT,
  gross NUMERIC, tax NUMERIC, base NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('day', t.created_at)::date AS day,
         t.flow_type,
         COUNT(*) AS tx_count,
         SUM(t.gross_amount)::numeric AS gross,
         SUM(t.tax_amount)::numeric  AS tax,
         SUM(t.base_amount)::numeric AS base
  FROM public.transaction_split_logs t
  WHERE t.created_at::date BETWEEN p_start AND p_end
    AND EXISTS (SELECT 1 FROM public.user_roles
                WHERE user_id = auth.uid()
                  AND role = ANY (ARRAY['admin','admin_master']))
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2;
$$;

GRANT EXECUTE ON FUNCTION public.get_tax_report_period(DATE,DATE) TO authenticated;

-- 5) RPC: ganhos do afiliado logado (período)
CREATE OR REPLACE FUNCTION public.get_affiliate_earnings_period(
  p_start TIMESTAMPTZ DEFAULT (now() - INTERVAL '30 days'),
  p_end   TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid UUID; v JSONB;
BEGIN
  SELECT id INTO v_pid FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_pid IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT jsonb_build_object(
    'total_earned',   COALESCE(SUM(affiliate_amount),0),
    'tx_count',       COUNT(*),
    'gross_referred', COALESCE(SUM(gross_amount),0),
    'daily', (
      SELECT jsonb_agg(row_to_json(d) ORDER BY d.day) FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               SUM(affiliate_amount) AS earned,
               COUNT(*) AS count
        FROM public.transaction_split_logs
        WHERE affiliate_id = v_pid
          AND created_at BETWEEN p_start AND p_end
        GROUP BY 1 ORDER BY 1
      ) d
    ),
    'recent', (
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT id, transaction_id, flow_type, gross_amount,
               affiliate_amount, created_at
        FROM public.transaction_split_logs
        WHERE affiliate_id = v_pid
          AND created_at BETWEEN p_start AND p_end
        ORDER BY created_at DESC LIMIT 100
      ) r
    )
  ) INTO v
  FROM public.transaction_split_logs
  WHERE affiliate_id = v_pid AND created_at BETWEEN p_start AND p_end;

  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_affiliate_earnings_period(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;
