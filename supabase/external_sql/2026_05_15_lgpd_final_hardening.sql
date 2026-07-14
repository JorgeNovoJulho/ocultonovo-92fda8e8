-- ============================================================================
-- LGPD Wave 7 — Final Hardening (CORRIGIDO v3 — schema-agnostic)
-- ============================================================================
-- Idempotente. Não assume colunas opcionais (hidden_at, etc).
-- Usa p.* + override apenas das colunas sensíveis (media_url / video_*).
-- ============================================================================

DROP VIEW IF EXISTS public.v_secure_posts CASCADE;

CREATE VIEW public.v_secure_posts
WITH (security_invoker = true)
AS
SELECT
  p.*,
  CASE
    WHEN COALESCE(p.is_paid, false) = false THEN p.media_url
    WHEN auth.uid() = p.author_id THEN p.media_url
    WHEN EXISTS (
      SELECT 1 FROM public.media_access ma
      WHERE ma.post_id = p.id AND ma.user_id = auth.uid()
    ) THEN p.media_url
    ELSE NULL
  END AS media_url_secure,
  CASE
    WHEN COALESCE(p.is_paid, false) = false THEN p.video_master_url
    WHEN auth.uid() = p.author_id THEN p.video_master_url
    WHEN EXISTS (
      SELECT 1 FROM public.media_access ma
      WHERE ma.post_id = p.id AND ma.user_id = auth.uid()
    ) THEN p.video_master_url
    ELSE NULL
  END AS video_master_url_secure,
  CASE
    WHEN COALESCE(p.is_paid, false) = false THEN p.video_hls_url
    WHEN auth.uid() = p.author_id THEN p.video_hls_url
    WHEN EXISTS (
      SELECT 1 FROM public.media_access ma
      WHERE ma.post_id = p.id AND ma.user_id = auth.uid()
    ) THEN p.video_hls_url
    ELSE NULL
  END AS video_hls_url_secure
FROM public.posts p
WHERE NOT EXISTS (
  SELECT 1 FROM public.blocked_contacts bc
  WHERE bc.user_id = p.author_id AND bc.block_type = 'blocked'
);

GRANT SELECT ON public.v_secure_posts TO authenticated, anon;

-- 2) scrub_pii(text) -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scrub_pii(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p_text IS NULL THEN NULL
      ELSE regexp_replace(
             regexp_replace(
               regexp_replace(
                 p_text,
                 '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'
               ),
               '\d{3}\.?\d{3}\.?\d{3}-?\d{2}', '[cpf]', 'g'
             ),
             '(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}', '[phone]', 'g'
           )
    END;
$$;

REVOKE ALL ON FUNCTION public.scrub_pii(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scrub_pii(text) TO authenticated, service_role;

-- 3) Trigger payments_log auto-scrub ------------------------------------------
DO $$
DECLARE
  v_has_table boolean;
  v_has_err boolean;
  v_has_raw boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='payments_log'
  ) INTO v_has_table;

  IF NOT v_has_table THEN
    RAISE NOTICE 'payments_log not found — skipping trigger';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments_log' AND column_name='error_message')
    INTO v_has_err;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments_log' AND column_name='raw_response')
    INTO v_has_raw;

  IF NOT (v_has_err OR v_has_raw) THEN
    RAISE NOTICE 'payments_log has no scrubbable columns — skipping trigger';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.tg_scrub_payments_log()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $f$
  DECLARE
    v_row jsonb := to_jsonb(NEW);
  BEGIN
    IF v_row ? 'error_message' AND (NEW.error_message IS NOT NULL) THEN
      NEW.error_message := public.scrub_pii(NEW.error_message);
    END IF;
    IF v_row ? 'raw_response' AND (NEW.raw_response IS NOT NULL) THEN
      BEGIN
        NEW.raw_response := public.scrub_pii(NEW.raw_response::text)::jsonb;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    RETURN NEW;
  END;
  $f$;

  DROP TRIGGER IF EXISTS trg_scrub_payments_log ON public.payments_log;
  CREATE TRIGGER trg_scrub_payments_log
    BEFORE INSERT OR UPDATE ON public.payments_log
    FOR EACH ROW EXECUTE FUNCTION public.tg_scrub_payments_log();
END $$;

-- ============================================================================
-- DONE
-- ============================================================================
