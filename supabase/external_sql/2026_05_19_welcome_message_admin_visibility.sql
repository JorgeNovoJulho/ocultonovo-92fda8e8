-- =========================================================================
-- Mensagem de boas-vindas — acesso visível para admins (externo)
-- - Libera leitura/escrita da configuração e leitura da telemetria para
--   admin_master, admin_regional e moderator
-- - Restringe envio manual por username aos mesmos papéis
-- - Idempotente
-- =========================================================================

DROP POLICY IF EXISTS welcome_settings_write ON public.oculto_welcome_message_settings;
CREATE POLICY welcome_settings_write
  ON public.oculto_welcome_message_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
  );

DROP POLICY IF EXISTS welcome_metrics_read ON public.oculto_welcome_message_metrics;
CREATE POLICY welcome_metrics_read
  ON public.oculto_welcome_message_metrics
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
  );

CREATE OR REPLACE FUNCTION public.admin_send_welcome_to_username(p_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO v_uid
    FROM public.profiles
   WHERE lower(username) = lower(trim(p_username))
   LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_username;
  END IF;

  RETURN public.send_welcome_message_to_user(v_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_welcome_to_username(text)
  TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.oculto_landing_public_metrics (
  id bigserial PRIMARY KEY,
  session_key text,
  action text NOT NULL CHECK (action IN ('view','login_click','signup_click')),
  path text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_landing_public_metrics_action_created
  ON public.oculto_landing_public_metrics (action, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oculto_landing_public_metrics_unique_view
  ON public.oculto_landing_public_metrics (session_key, path, action)
  WHERE action = 'view';

ALTER TABLE public.oculto_landing_public_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_public_metrics_insert ON public.oculto_landing_public_metrics;
CREATE POLICY landing_public_metrics_insert
  ON public.oculto_landing_public_metrics
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS landing_public_metrics_read ON public.oculto_landing_public_metrics;
CREATE POLICY landing_public_metrics_read
  ON public.oculto_landing_public_metrics
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
  );

CREATE OR REPLACE FUNCTION public.landing_public_metric_increment(
  p_action text,
  p_path text DEFAULT '/',
  p_session_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_action NOT IN ('view','login_click','signup_click') THEN
    RETURN;
  END IF;

  IF p_action = 'view' THEN
    INSERT INTO public.oculto_landing_public_metrics (session_key, action, path)
    VALUES (coalesce(nullif(trim(p_session_key), ''), 'anon'), p_action, coalesce(nullif(trim(p_path), ''), '/'))
    ON CONFLICT (session_key, path, action) WHERE action = 'view' DO NOTHING;
  ELSE
    INSERT INTO public.oculto_landing_public_metrics (session_key, action, path)
    VALUES (coalesce(nullif(trim(p_session_key), ''), 'anon'), p_action, coalesce(nullif(trim(p_path), ''), '/'));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.landing_public_metric_increment(text, text, text)
  TO authenticated, anon, service_role;