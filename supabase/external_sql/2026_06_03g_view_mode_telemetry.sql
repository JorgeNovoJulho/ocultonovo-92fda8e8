-- =====================================================================
-- 2026_06_03g_view_mode_telemetry.sql
-- Telemetria granular dos Modos de Visualização (Simples/Custom/Complete).
-- Idempotente — pode rodar várias vezes.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_view_mode_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN ('view_mode_changed','section_toggled')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ovme_user_created  ON public.oculto_view_mode_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ovme_type_created  ON public.oculto_view_mode_events (event_type, created_at DESC);

GRANT SELECT, INSERT ON public.oculto_view_mode_events TO authenticated;
GRANT ALL ON public.oculto_view_mode_events TO service_role;

ALTER TABLE public.oculto_view_mode_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view_mode_events_owner_select" ON public.oculto_view_mode_events;
CREATE POLICY "view_mode_events_owner_select"
  ON public.oculto_view_mode_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public._is_master_admin());

DROP POLICY IF EXISTS "view_mode_events_owner_insert" ON public.oculto_view_mode_events;
CREATE POLICY "view_mode_events_owner_insert"
  ON public.oculto_view_mode_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- RPC fire-and-forget: log_view_mode_event
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_view_mode_event(
  p_event_type text,
  p_payload    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF p_event_type NOT IN ('view_mode_changed','section_toggled') THEN RETURN; END IF;

  INSERT INTO public.oculto_view_mode_events (user_id, event_type, payload)
  VALUES (v_uid, p_event_type, COALESCE(p_payload, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- fire-and-forget; nunca falha
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_view_mode_event(text, jsonb) TO authenticated;

-- =====================================================================
-- RPC métricas (master admin) — view_mode_metrics
-- =====================================================================
CREATE OR REPLACE FUNCTION public.view_mode_metrics(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public._is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
  dist AS (
    SELECT COALESCE(view_mode, 'simple') AS mode, COUNT(*)::int AS users
    FROM public.oculto_user_experience_preferences
    GROUP BY 1
  ),
  switchers AS (
    SELECT COUNT(DISTINCT user_id)::int AS active
    FROM public.oculto_view_mode_events
    WHERE event_type = 'view_mode_changed'
      AND created_at >= now() - (p_days || ' days')::interval
  ),
  daily AS (
    SELECT date_trunc('day', created_at)::date AS day,
           COUNT(*)::int AS events
    FROM public.oculto_view_mode_events
    WHERE created_at >= now() - (p_days || ' days')::interval
    GROUP BY 1
    ORDER BY 1
  ),
  top_sections AS (
    SELECT payload->>'section' AS section,
           COUNT(*) FILTER (WHERE (payload->>'enabled')::boolean IS TRUE)::int  AS enabled_count,
           COUNT(*) FILTER (WHERE (payload->>'enabled')::boolean IS FALSE)::int AS disabled_count
    FROM public.oculto_view_mode_events
    WHERE event_type = 'section_toggled'
      AND created_at >= now() - (p_days || ' days')::interval
    GROUP BY 1
    ORDER BY (COUNT(*)) DESC
    LIMIT 20
  )
  SELECT jsonb_build_object(
    'days',           p_days,
    'distribution',   COALESCE((SELECT jsonb_agg(jsonb_build_object('mode', mode, 'users', users)) FROM dist), '[]'::jsonb),
    'active_switchers', COALESCE((SELECT active FROM switchers), 0),
    'daily',          COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'events', events)) FROM daily), '[]'::jsonb),
    'top_sections',   COALESCE((SELECT jsonb_agg(jsonb_build_object('section', section, 'on', enabled_count, 'off', disabled_count)) FROM top_sections), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.view_mode_metrics(int) TO authenticated;
