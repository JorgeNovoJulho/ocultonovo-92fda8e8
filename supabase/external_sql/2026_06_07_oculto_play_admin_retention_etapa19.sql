-- ============================================================================
-- OCULTO PLAY — Etapa 19: Retenção por item e por kind (admin Master)
-- 100% idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- Depende de oculto_play_items + oculto_play_views (já existentes).
-- ============================================================================

-- ---------- Retenção por item ----------
CREATE OR REPLACE FUNCTION public.oculto_play_admin_retention(
  p_days  int DEFAULT 7,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  item_id          uuid,
  title            text,
  kind             text,
  section          text,
  author_username  text,
  published_at     timestamptz,
  duration_sec     int,
  total_views      bigint,
  unique_viewers   bigint,
  avg_seconds      numeric,
  median_seconds   numeric,
  completion_rate  numeric,
  retention_score  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_since := now() - make_interval(days => GREATEST(1, LEAST(coalesce(p_days,7), 90)));

  RETURN QUERY
  WITH agg AS (
    SELECT v.item_id,
           count(*)::bigint                                            AS total_views,
           count(DISTINCT v.user_id)::bigint                           AS unique_viewers,
           avg(v.watched_seconds)::numeric                             AS avg_seconds,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY v.watched_seconds)::numeric AS median_seconds,
           (sum(CASE WHEN v.completed THEN 1 ELSE 0 END)::numeric
              / NULLIF(count(*),0)::numeric)                           AS completion_rate
      FROM public.oculto_play_views v
     WHERE v.last_seen_at >= v_since
     GROUP BY v.item_id
  )
  SELECT
    i.id,
    i.title,
    i.kind::text,
    i.section::text,
    p.username,
    i.published_at,
    i.duration_sec,
    coalesce(a.total_views, 0),
    coalesce(a.unique_viewers, 0),
    round(coalesce(a.avg_seconds, 0), 2),
    round(coalesce(a.median_seconds, 0), 2),
    round(coalesce(a.completion_rate, 0), 4),
    round(
      coalesce(a.completion_rate, 0) * 0.6
      + LEAST(coalesce(a.avg_seconds, 0) / NULLIF(GREATEST(i.duration_sec, 1), 0), 1) * 0.4,
      4
    ) AS retention_score
    FROM public.oculto_play_items i
    LEFT JOIN agg a ON a.item_id = i.id
    LEFT JOIN public.profiles p ON p.id = i.author_id
   WHERE i.is_published = true
     AND i.published_at >= v_since
   ORDER BY coalesce(a.total_views, 0) DESC, i.published_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200));
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_admin_retention(int, int) TO authenticated;

-- ---------- Retenção agregada por kind ----------
CREATE OR REPLACE FUNCTION public.oculto_play_admin_retention_by_kind(
  p_days int DEFAULT 7
)
RETURNS TABLE (
  kind             text,
  items_count      bigint,
  total_views      bigint,
  unique_viewers   bigint,
  avg_seconds      numeric,
  completion_rate  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_since := now() - make_interval(days => GREATEST(1, LEAST(coalesce(p_days,7), 90)));

  RETURN QUERY
  SELECT i.kind::text,
         count(DISTINCT i.id)::bigint                               AS items_count,
         count(v.item_id)::bigint                                   AS total_views,
         count(DISTINCT v.user_id)::bigint                          AS unique_viewers,
         round(coalesce(avg(v.watched_seconds), 0), 2)              AS avg_seconds,
         round(
           coalesce(
             sum(CASE WHEN v.completed THEN 1 ELSE 0 END)::numeric
             / NULLIF(count(v.item_id), 0)::numeric, 0
           ), 4
         ) AS completion_rate
    FROM public.oculto_play_items i
    LEFT JOIN public.oculto_play_views v
      ON v.item_id = i.id AND v.last_seen_at >= v_since
   WHERE i.is_published = true
     AND i.published_at >= v_since
   GROUP BY i.kind
   ORDER BY total_views DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_admin_retention_by_kind(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
