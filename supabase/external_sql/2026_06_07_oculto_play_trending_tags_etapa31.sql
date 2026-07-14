-- Etapa 31 — Trending Tags do Oculto Play
-- Apura tags mais usadas/visualizadas nas últimas N horas em itens publicados.
-- Stateless, sem novas tabelas, idempotente.

CREATE OR REPLACE FUNCTION public.oculto_play_trending_tags(
  p_window_hours int DEFAULT 48,
  p_limit int DEFAULT 12
)
RETURNS TABLE (
  tag text,
  item_count bigint,
  total_views bigint,
  total_likes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT i.id, i.tags, i.view_count, i.like_count
    FROM public.oculto_play_items i
    WHERE i.is_published = true
      
      AND i.created_at >= now() - make_interval(hours => GREATEST(p_window_hours, 1))
      AND i.tags IS NOT NULL
      AND array_length(i.tags, 1) > 0
  ),
  expanded AS (
    SELECT lower(btrim(t)) AS tag, r.id, r.view_count, r.like_count
    FROM recent r, unnest(r.tags) AS t
    WHERE btrim(t) <> ''
  )
  SELECT
    tag,
    count(DISTINCT id)::bigint                    AS item_count,
    COALESCE(sum(view_count), 0)::bigint          AS total_views,
    COALESCE(sum(like_count), 0)::bigint          AS total_likes
  FROM expanded
  GROUP BY tag
  HAVING count(DISTINCT id) >= 1
  ORDER BY total_views DESC, item_count DESC, tag ASC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.oculto_play_trending_tags(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_play_trending_tags(int, int) TO authenticated, service_role;
