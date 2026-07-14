-- ===========================================================================
-- Engagement Ranking — função idempotente
-- Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_engagement_ranking(p_limit int DEFAULT 100)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  gender text,
  city text,
  state text,
  is_verified boolean,
  plan_type text,
  rating_avg numeric,
  rating_count int,
  total_likes bigint,
  total_followers bigint,
  total_testimonials bigint,
  total_recommendations bigint,
  engagement_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH likes AS (
    SELECT user_id, COALESCE(SUM(likes_count),0)::bigint AS total
    FROM posts
    WHERE COALESCE(is_hidden, false) = false
      AND COALESCE(is_seed, false) = false
    GROUP BY user_id
  ),
  flw AS (
    SELECT following_id AS pid, COUNT(*)::bigint AS total
    FROM followers
    GROUP BY following_id
  ),
  tst AS (
    SELECT target_profile_id AS pid, COUNT(*)::bigint AS total
    FROM oculto_profile_testimonials
    GROUP BY target_profile_id
  ),
  rec AS (
    SELECT target_profile_id AS pid, COUNT(*)::bigint AS total
    FROM oculto_real_recommendations
    GROUP BY target_profile_id
  )
  SELECT
    p.id                                              AS profile_id,
    p.user_id                                         AS user_id,
    p.username                                        AS username,
    p.name                                            AS name,
    p.avatar_url                                      AS avatar_url,
    p.gender                                          AS gender,
    p.city                                            AS city,
    p.state                                           AS state,
    COALESCE(p.is_verified, false)                    AS is_verified,
    COALESCE(p.plan_type, 'free')                     AS plan_type,
    COALESCE(p.rating_avg, 0)::numeric                AS rating_avg,
    COALESCE(p.rating_count, 0)::int                  AS rating_count,
    COALESCE(l.total, 0)                              AS total_likes,
    COALESCE(f.total, 0)                              AS total_followers,
    COALESCE(t.total, 0)                              AS total_testimonials,
    COALESCE(r.total, 0)                              AS total_recommendations,
    (
      COALESCE(l.total, 0)
      + COALESCE(f.total, 0) * 3
      + COALESCE(t.total, 0) * 5
      + COALESCE(r.total, 0) * 8
      + COALESCE(p.rating_avg, 0) * COALESCE(p.rating_count, 0) * 2
    )::numeric                                        AS engagement_score
  FROM profiles p
  LEFT JOIN likes l ON l.user_id = p.user_id
  LEFT JOIN flw   f ON f.pid     = p.id
  LEFT JOIN tst   t ON t.pid     = p.id
  LEFT JOIN rec   r ON r.pid     = p.id
  WHERE COALESCE(p.is_seed,   false) = false
    AND COALESCE(p.is_banned, false) = false
  ORDER BY engagement_score DESC NULLS LAST, p.rating_avg DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_engagement_ranking(int) TO anon, authenticated, service_role;
