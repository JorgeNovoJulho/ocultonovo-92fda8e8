-- =====================================================================
-- OCULTO PLAY — Etapa 22: Sugestão de melhor horário para publicar
-- RPC público (authenticated) — top janelas por views/item.
-- Idempotente. TZ: America/Sao_Paulo.
-- =====================================================================

DROP FUNCTION IF EXISTS public.oculto_play_best_publish_slots(int, text, int);

CREATE OR REPLACE FUNCTION public.oculto_play_best_publish_slots(
  p_days  int     DEFAULT 30,
  p_kind  text    DEFAULT NULL,
  p_limit int     DEFAULT 5
)
RETURNS TABLE (
  dow             int,
  hour            int,
  items_published bigint,
  views_per_item  numeric,
  score           numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
  v_lim   int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_since := now() - make_interval(days => GREATEST(1, LEAST(coalesce(p_days,30), 180)));
  v_lim   := GREATEST(1, LEAST(coalesce(p_limit,5), 24));

  RETURN QUERY
  WITH it AS (
    SELECT
      i.id,
      EXTRACT(DOW  FROM i.published_at AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
      EXTRACT(HOUR FROM i.published_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour
    FROM public.oculto_play_items i
    WHERE i.published_at IS NOT NULL
      AND i.published_at >= v_since
      AND i.is_published = true
      AND (p_kind IS NULL OR i.kind = p_kind)
  ),
  v AS (
    SELECT item_id, COUNT(*)::bigint AS vws
    FROM public.oculto_play_views
    GROUP BY item_id
  ),
  agg AS (
    SELECT
      it.dow,
      it.hour,
      COUNT(*)::bigint                                       AS items_published,
      COALESCE(ROUND(AVG(COALESCE(v.vws,0))::numeric, 2), 0) AS views_per_item
    FROM it
    LEFT JOIN v ON v.item_id = it.id
    GROUP BY 1, 2
  )
  SELECT
    a.dow, a.hour, a.items_published, a.views_per_item,
    ROUND(
      a.views_per_item * LEAST(1.0, a.items_published::numeric / 3.0),
      2
    ) AS score
  FROM agg a
  WHERE a.items_published >= 1
  ORDER BY score DESC, a.views_per_item DESC, a.items_published DESC
  LIMIT v_lim;
END $$;

REVOKE ALL ON FUNCTION public.oculto_play_best_publish_slots(int, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_play_best_publish_slots(int, text, int)
  TO authenticated, service_role;
