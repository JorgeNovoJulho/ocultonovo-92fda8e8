
DROP FUNCTION IF EXISTS public.get_perfect_pairs(uuid, integer, double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_perfect_pairs(
  p_user_id uuid,
  p_limit integer DEFAULT 10,
  p_viewer_lat double precision DEFAULT NULL,
  p_viewer_lng double precision DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name text,
  username text,
  avatar_url text,
  bio text,
  pair_bio text,
  plan_type text,
  tags_social text[],
  tags_adult text[],
  pair_photos text[],
  is_boosted boolean,
  shared_tags text[],
  age integer,
  distance_km double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    prof.id,
    prof.name,
    prof.username,
    prof.avatar_url,
    prof.bio,
    prof.pair_bio,
    prof.plan_type,
    prof.tags_social,
    prof.tags_adult,
    prof.pair_photos,
    false AS is_boosted,
    ARRAY(
      SELECT unnest(prof.tags_social)
      INTERSECT
      SELECT unnest((SELECT p2.tags_social FROM profiles p2 WHERE p2.id = p_user_id))
    ) AS shared_tags,
    CASE
      WHEN prof.birth_date IS NOT NULL THEN
        EXTRACT(YEAR FROM age(current_date, prof.birth_date))::integer
      ELSE NULL
    END AS age,
    CASE
      WHEN p_viewer_lat IS NOT NULL AND p_viewer_lng IS NOT NULL
           AND prof.location_lat IS NOT NULL AND prof.location_lng IS NOT NULL THEN
        ROUND((6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_viewer_lat)) * cos(radians(prof.location_lat)) *
            cos(radians(prof.location_lng) - radians(p_viewer_lng)) +
            sin(radians(p_viewer_lat)) * sin(radians(prof.location_lat))
          ))
        ))::double precision, 1)
      ELSE NULL
    END AS distance_km
  FROM profiles prof
  WHERE prof.id != p_user_id
    AND prof.is_anonymized = false
    AND (prof.is_seed = false OR prof.is_seed IS NULL)
    AND (prof.is_invisible = false OR prof.is_invisible IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM perfect_pairs pp
      WHERE pp.user_id = p_user_id AND pp.target_id = prof.id
    )
  ORDER BY
    prof.plan_type = 'vip' DESC,
    random()
  LIMIT p_limit;
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
