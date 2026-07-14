
CREATE OR REPLACE FUNCTION public.get_perfect_pairs(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_viewer_lat DOUBLE PRECISION DEFAULT NULL,
  p_viewer_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  username TEXT,
  avatar_url TEXT,
  bio TEXT,
  pair_bio TEXT,
  plan_type TEXT,
  tags_social TEXT[],
  tags_adult TEXT[],
  pair_photos TEXT[],
  is_boosted BOOLEAN,
  shared_tags TEXT[],
  shared_tags_count INTEGER,
  age INTEGER,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_tags_social TEXT[];
  v_viewer_tags_adult  TEXT[];
  v_viewer_plan        TEXT;
  v_viewer_oculto      BOOLEAN;
BEGIN
  SELECT
    COALESCE(p.tags_social, ARRAY[]::TEXT[]),
    COALESCE(p.tags_adult,  ARRAY[]::TEXT[]),
    p.plan_type,
    COALESCE(p.is_oculto_verified, FALSE)
  INTO v_viewer_tags_social, v_viewer_tags_adult, v_viewer_plan, v_viewer_oculto
  FROM profiles p
  WHERE p.id = p_user_id;

  RETURN QUERY
  WITH viewer_all_tags AS (
    SELECT ARRAY(
      SELECT UNNEST(v_viewer_tags_social)
      UNION
      SELECT UNNEST(v_viewer_tags_adult)
    ) AS all_tags
  ),
  eligible AS (
    SELECT
      p.id,
      p.name,
      p.username,
      p.avatar_url,
      p.bio,
      p.pair_bio,
      p.plan_type,
      COALESCE(p.tags_social,  ARRAY[]::TEXT[]) AS tags_social,
      COALESCE(p.tags_adult,   ARRAY[]::TEXT[]) AS tags_adult,
      COALESCE(p.pair_photos,  ARRAY[]::TEXT[]) AS pair_photos,
      FALSE AS is_boosted,
      p.location_lat,
      p.location_lng,
      p.birth_date,
      COALESCE(p.is_oculto_verified, FALSE) AS is_oculto_verified
    FROM profiles p
    WHERE
      p.id <> p_user_id
      AND COALESCE(p.is_test_account, FALSE) = FALSE
      AND COALESCE(p.is_seed,         FALSE) = FALSE
      AND COALESCE(p.is_invisible,    FALSE) = FALSE
      AND COALESCE(p.is_anonymized,   FALSE) = FALSE
      AND p.name IS NOT NULL
      AND (
        v_viewer_oculto = FALSE
        OR COALESCE(p.is_oculto_verified, FALSE) = TRUE
      )
      AND NOT EXISTS (
        SELECT 1
        FROM perfect_pair_actions ppa
        WHERE ppa.user_id   = p_user_id
          AND ppa.target_id = p.id
          AND (
            ppa.action_type IN ('like', 'super_like')
            OR (
              ppa.action_type = 'dislike'
              AND ppa.updated_at > (NOW() - INTERVAL '10 days')
            )
          )
      )
  ),
  with_distance AS (
    SELECT
      e.*,
      CASE
        WHEN p_viewer_lat IS NOT NULL AND p_viewer_lng IS NOT NULL
             AND e.location_lat IS NOT NULL AND e.location_lng IS NOT NULL
        THEN ROUND(
          (6371 * 2 * ASIN(SQRT(
            POWER(SIN((e.location_lat - p_viewer_lat) * PI() / 180 / 2), 2) +
            COS(p_viewer_lat  * PI() / 180) *
            COS(e.location_lat * PI() / 180) *
            POWER(SIN((e.location_lng - p_viewer_lng) * PI() / 180 / 2), 2)
          )))::NUMERIC, 1
        )::DOUBLE PRECISION
        ELSE NULL
      END AS distance_km
    FROM eligible e
  ),
  with_affinity AS (
    SELECT
      d.*,
      ARRAY(
        SELECT t FROM UNNEST(d.tags_social || d.tags_adult) t
        WHERE t = ANY((SELECT all_tags FROM viewer_all_tags))
      ) AS shared_tags,
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, d.birth_date))::INT AS age_calc
    FROM with_distance d
    WHERE (
      d.distance_km IS NULL
      OR d.distance_km <= 50
      OR p_viewer_lat IS NULL
    )
  )
  SELECT
    a.id,
    a.name::TEXT,
    a.username::TEXT,
    a.avatar_url::TEXT,
    a.bio::TEXT,
    a.pair_bio::TEXT,
    a.plan_type::TEXT,
    a.tags_social,
    a.tags_adult,
    a.pair_photos,
    a.is_boosted,
    a.shared_tags,
    COALESCE(array_length(a.shared_tags, 1), 0)::INTEGER AS shared_tags_count,
    a.age_calc AS age,
    a.distance_km
  FROM with_affinity a
  ORDER BY
    a.is_boosted DESC,
    (a.plan_type = 'vip') DESC,
    COALESCE(array_length(a.shared_tags, 1), 0) DESC,
    COALESCE(a.distance_km, 9999) ASC,
    RANDOM()
  LIMIT p_limit;
END;
$$;
