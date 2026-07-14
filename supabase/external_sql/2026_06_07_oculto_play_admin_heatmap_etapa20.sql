-- =====================================================================
-- OCULTO PLAY — Etapa 20 (FIX): Heatmap de melhor horário/dia
-- Corrige colunas: usa user_id / watched_seconds / completed / last_seen_at
-- e busca duration_sec via JOIN em oculto_play_items.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

DROP FUNCTION IF EXISTS public.oculto_play_admin_heatmap(int);
DROP FUNCTION IF EXISTS public.oculto_play_admin_publish_heatmap(int);

-- ---------- Heatmap de AUDIÊNCIA ATIVA ----------
CREATE OR REPLACE FUNCTION public.oculto_play_admin_heatmap(p_days int DEFAULT 30)
RETURNS TABLE (
  dow int,
  hour int,
  views_total bigint,
  unique_viewers bigint,
  avg_watch_seconds numeric,
  avg_completion numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_since := now() - make_interval(days => GREATEST(1, LEAST(coalesce(p_days,30), 180)));

  RETURN QUERY
  SELECT
    EXTRACT(DOW  FROM v.last_seen_at AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
    EXTRACT(HOUR FROM v.last_seen_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
    COUNT(*)::bigint                                                         AS views_total,
    COUNT(DISTINCT v.user_id)::bigint                                        AS unique_viewers,
    COALESCE(ROUND(AVG(NULLIF(v.watched_seconds,0))::numeric, 2), 0)         AS avg_watch_seconds,
    COALESCE(ROUND(
      AVG(
        CASE
          WHEN i.duration_sec IS NOT NULL AND i.duration_sec > 0
            THEN LEAST(v.watched_seconds::numeric / i.duration_sec, 1)
          WHEN v.completed THEN 1
          ELSE NULL
        END
      )::numeric, 4
    ), 0)                                                                    AS avg_completion
  FROM public.oculto_play_views v
  LEFT JOIN public.oculto_play_items i ON i.id = v.item_id
  WHERE v.last_seen_at >= v_since
  GROUP BY 1, 2
  ORDER BY 1, 2;
END $$;

REVOKE ALL ON FUNCTION public.oculto_play_admin_heatmap(int) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_play_admin_heatmap(int) TO authenticated, service_role;

-- ---------- Heatmap de MELHOR HORÁRIO PARA PUBLICAR ----------
CREATE OR REPLACE FUNCTION public.oculto_play_admin_publish_heatmap(p_days int DEFAULT 30)
RETURNS TABLE (
  dow int,
  hour int,
  items_published bigint,
  views_per_item numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_since := now() - make_interval(days => GREATEST(1, LEAST(coalesce(p_days,30), 180)));

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
  ),
  v AS (
    SELECT item_id, COUNT(*)::bigint AS vws
    FROM public.oculto_play_views
    GROUP BY item_id
  )
  SELECT
    it.dow,
    it.hour,
    COUNT(*)::bigint                                          AS items_published,
    COALESCE(ROUND(AVG(COALESCE(v.vws, 0))::numeric, 2), 0)   AS views_per_item
  FROM it
  LEFT JOIN v ON v.item_id = it.id
  GROUP BY 1, 2
  ORDER BY 1, 2;
END $$;

REVOKE ALL ON FUNCTION public.oculto_play_admin_publish_heatmap(int) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_play_admin_publish_heatmap(int) TO authenticated, service_role;
