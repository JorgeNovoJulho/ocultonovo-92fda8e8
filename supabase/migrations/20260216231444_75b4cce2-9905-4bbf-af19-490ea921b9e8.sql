DROP FUNCTION IF EXISTS public.get_perfect_pairs(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_perfect_pairs(p_user_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE(
  id uuid,
  name text,
  avatar_url text,
  bio text,
  pair_bio text,
  plan_type text,
  tags_social text[],
  tags_adult text[],
  pair_photos text[],
  is_boosted boolean,
  shared_tags text[],
  age integer
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
    prof.avatar_url,
    prof.bio,
    prof.pair_bio,
    prof.plan_type,
    prof.tags_social,
    prof.tags_adult,
    prof.pair_photos,
    prof.is_boosted,
    ARRAY(
      SELECT unnest(prof.tags_social)
      INTERSECT
      SELECT unnest((SELECT p2.tags_social FROM profiles p2 WHERE p2.id = p_user_id))
    ) AS shared_tags,
    CASE
      WHEN prof.birth_date IS NOT NULL THEN
        EXTRACT(YEAR FROM age(current_date, prof.birth_date))::integer
      ELSE NULL
    END AS age
  FROM profiles prof
  WHERE prof.id != p_user_id
    AND prof.is_anonymized = false
    AND (prof.is_invisible = false OR prof.is_invisible IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM perfect_pairs pp
      WHERE pp.user_id = p_user_id AND pp.target_id = prof.id
    )
  ORDER BY
    prof.is_boosted DESC NULLS LAST,
    prof.plan_type = 'vip' DESC,
    random()
  LIMIT p_limit;
END;
$$;