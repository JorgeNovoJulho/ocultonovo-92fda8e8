-- ============================================================
-- ETAPA 5 — Telemetria dos Modos de Feed
-- Externo: rvybbrkzmboqbhcemqar.supabase.co
-- Idempotente
-- ============================================================

-- 1) Tabela de eventos -----------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_feed_mode_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  mode_from   text,
  mode_to     text NOT NULL,
  source      text NOT NULL DEFAULT 'selector'
              CHECK (source IN ('selector','onboarding','admin','system')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_mode_events_created  ON public.oculto_feed_mode_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_mode_events_user     ON public.oculto_feed_mode_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_mode_events_mode_to  ON public.oculto_feed_mode_events (mode_to);

GRANT SELECT, INSERT ON public.oculto_feed_mode_events TO authenticated;
GRANT ALL ON public.oculto_feed_mode_events TO service_role;

ALTER TABLE public.oculto_feed_mode_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_mode_events_self_insert" ON public.oculto_feed_mode_events;
DROP POLICY IF EXISTS "feed_mode_events_self_read"   ON public.oculto_feed_mode_events;
DROP POLICY IF EXISTS "feed_mode_events_master_all"  ON public.oculto_feed_mode_events;

CREATE POLICY "feed_mode_events_self_insert"
  ON public.oculto_feed_mode_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "feed_mode_events_self_read"
  ON public.oculto_feed_mode_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feed_mode_events_master_all"
  ON public.oculto_feed_mode_events FOR ALL
  USING (public._is_master_admin(auth.uid()))
  WITH CHECK (public._is_master_admin(auth.uid()));

-- 2) RPC: log_feed_mode_event ----------------------------------
CREATE OR REPLACE FUNCTION public.log_feed_mode_event(
  p_mode_from text,
  p_mode_to   text,
  p_source    text DEFAULT 'selector'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF p_source NOT IN ('selector','onboarding','admin','system') THEN p_source := 'selector'; END IF;

  INSERT INTO public.oculto_feed_mode_events (user_id, mode_from, mode_to, source)
  VALUES (v_uid, p_mode_from, p_mode_to, p_source)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_feed_mode_event(text, text, text) TO authenticated;

-- 3) Métricas agregadas (apenas master) ------------------------
CREATE OR REPLACE FUNCTION public.feed_mode_metrics(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_distribution jsonb;
  v_switches     jsonb;
  v_by_source    jsonb;
  v_daily        jsonb;
  v_total_users  int;
  v_active_users int;
BEGIN
  IF NOT public._is_master_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Distribuição atual (profiles.feed_mode)
  SELECT COALESCE(jsonb_object_agg(feed_mode, c), '{}'::jsonb) INTO v_distribution
    FROM (
      SELECT COALESCE(feed_mode,'completo') AS feed_mode, COUNT(*) AS c
        FROM public.profiles
       GROUP BY 1
    ) t;

  SELECT COUNT(*) INTO v_total_users FROM public.profiles;

  -- Trocas no período
  SELECT COUNT(DISTINCT user_id) INTO v_active_users
    FROM public.oculto_feed_mode_events
   WHERE created_at >= now() - make_interval(days => p_days);

  SELECT COALESCE(jsonb_object_agg(mode_to, c), '{}'::jsonb) INTO v_switches
    FROM (
      SELECT mode_to, COUNT(*) AS c
        FROM public.oculto_feed_mode_events
       WHERE created_at >= now() - make_interval(days => p_days)
       GROUP BY 1
    ) t;

  SELECT COALESCE(jsonb_object_agg(source, c), '{}'::jsonb) INTO v_by_source
    FROM (
      SELECT source, COUNT(*) AS c
        FROM public.oculto_feed_mode_events
       WHERE created_at >= now() - make_interval(days => p_days)
       GROUP BY 1
    ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', c) ORDER BY day), '[]'::jsonb) INTO v_daily
    FROM (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS c
        FROM public.oculto_feed_mode_events
       WHERE created_at >= now() - make_interval(days => p_days)
       GROUP BY 1
    ) t;

  RETURN jsonb_build_object(
    'days', p_days,
    'total_users', v_total_users,
    'active_users', v_active_users,
    'distribution', v_distribution,
    'switches', v_switches,
    'by_source', v_by_source,
    'daily', v_daily
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.feed_mode_metrics(int) TO authenticated;
