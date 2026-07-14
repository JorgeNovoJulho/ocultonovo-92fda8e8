-- ============================================================================
-- 2026_05_12_split_fallback_alerts.sql
-- Cria alertas em admin_alerts toda vez que split_telemetry_logs registra
-- resolved_from='fallback_constants', evitando duplicação excessiva (cooldown
-- de 60 minutos por source). Idempotente.
-- Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- ─── 1. Função de trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_split_fallback_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
BEGIN
  IF NEW.resolved_from <> 'fallback_constants' THEN
    RETURN NEW;
  END IF;

  -- Cooldown: 1 alerta por source a cada 60 min
  SELECT id INTO v_existing
  FROM public.admin_alerts
  WHERE alert_type = 'split_fallback'
    AND ref_table = 'split_telemetry_logs'
    AND COALESCE(body, '') LIKE '%' || NEW.source || '%'
    AND created_at >= now() - interval '60 minutes'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_alerts (
    alert_type, severity, title, body, ref_table, ref_id, read, created_at
  ) VALUES (
    'split_fallback',
    'high',
    'Split usando configuração fallback',
    'A função "' || NEW.source || '" usou constantes fallback (' ||
      NEW.platform_pct || '/' || NEW.tax_pct || '/' || NEW.creator_pct || '/' || NEW.affiliate_pct ||
      ') em vez de split_config. Verifique a tabela split_config (is_active=true) e a conexão da edge function.',
    'split_telemetry_logs',
    NEW.id,
    false,
    now()
  );

  RETURN NEW;
END;
$$;

-- ─── 2. Trigger ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_split_fallback_alert ON public.split_telemetry_logs;
CREATE TRIGGER trg_split_fallback_alert
  AFTER INSERT ON public.split_telemetry_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_split_fallback_alert();

-- ─── 3. View resumo (para card no admin) ────────────────────────────────────
-- Garante coluna error_msg (algumas instâncias antigas não a possuem)
ALTER TABLE public.split_telemetry_logs
  ADD COLUMN IF NOT EXISTS error_msg TEXT;

DROP VIEW IF EXISTS public.v_split_fallback_summary;
CREATE VIEW public.v_split_fallback_summary AS
SELECT
  source,
  COUNT(*)        AS calls_24h,
  MAX(created_at) AS last_seen,
  MAX(error_msg)  AS last_error
FROM public.split_telemetry_logs
WHERE resolved_from = 'fallback_constants'
  AND created_at >= now() - interval '24 hours'
GROUP BY source
ORDER BY MAX(created_at) DESC;

GRANT SELECT ON public.v_split_fallback_summary TO authenticated;

-- ─── 4. RPC para Admin marcar todos os alertas split_fallback como resolvidos ─
CREATE OR REPLACE FUNCTION public.resolve_split_fallback_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.admin_alerts
  SET read = true
  WHERE alert_type = 'split_fallback'
    AND read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_split_fallback_alerts() TO authenticated;
