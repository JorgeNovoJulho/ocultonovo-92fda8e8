DROP FUNCTION IF EXISTS public.get_perfect_pairs(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_perfect_pairs(p_user_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
  id UUID,
  name TEXT,
  username TEXT,
  avatar_url TEXT,
  bio TEXT,
  plan_type TEXT,
  tags_social TEXT[],
  tags_adult TEXT[],
  pair_photos TEXT[],
  is_boosted BOOLEAN,
  shared_tags_count INTEGER,
  shared_tags TEXT[],
  pair_bio TEXT,
  age INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_tags_social TEXT[];
  v_user_tags_adult TEXT[];
  v_gender_interest TEXT[];
  v_min_age INTEGER;
  v_max_age INTEGER;
BEGIN
  SELECT p.tags_social, p.tags_adult
  INTO v_user_tags_social, v_user_tags_adult
  FROM profiles p WHERE p.id = p_user_id;

  SELECT
    COALESCE(ps.gender_interest, ARRAY['female','male','couple','trans']::TEXT[]),
    COALESCE(ps.min_age, 18),
    COALESCE(ps.max_age, 99)
  INTO v_gender_interest, v_min_age, v_max_age
  FROM pair_settings ps WHERE ps.user_id = p_user_id;

  IF v_gender_interest IS NULL THEN
    v_gender_interest := ARRAY['female','male','couple','trans']::TEXT[];
    v_min_age := 18;
    v_max_age := 99;
  END IF;

  RETURN QUERY
  SELECT
    prof.id,
    prof.name,
    prof.username,
    prof.avatar_url,
    prof.bio,
    prof.plan_type,
    prof.tags_social,
    prof.tags_adult,
    prof.pair_photos,
    (prof.plan_type = 'vip') AS is_boosted,
    (
      COALESCE(array_length(
        ARRAY(SELECT unnest(COALESCE(prof.tags_social, '{}')) INTERSECT SELECT unnest(COALESCE(v_user_tags_social, '{}'))),
        1
      ), 0) +
      COALESCE(array_length(
        ARRAY(SELECT unnest(COALESCE(prof.tags_adult, '{}')) INTERSECT SELECT unnest(COALESCE(v_user_tags_adult, '{}'))),
        1
      ), 0)
    )::INTEGER AS shared_tags_count,
    (
      ARRAY(SELECT unnest(COALESCE(prof.tags_social, '{}')) INTERSECT SELECT unnest(COALESCE(v_user_tags_social, '{}')))
      ||
      ARRAY(SELECT unnest(COALESCE(prof.tags_adult, '{}')) INTERSECT SELECT unnest(COALESCE(v_user_tags_adult, '{}')))
    ) AS shared_tags,
    prof.pair_bio,
    CASE 
      WHEN prof.birth_date IS NOT NULL 
      THEN EXTRACT(YEAR FROM age(CURRENT_DATE, prof.birth_date))::INTEGER
      ELSE NULL
    END AS age
  FROM profiles prof
  WHERE prof.id != p_user_id
    AND prof.is_anonymized = false
    AND (prof.is_invisible IS NULL OR prof.is_invisible = false)
    AND prof.id NOT IN (
      SELECT pp.target_id FROM perfect_pairs pp WHERE pp.user_id = p_user_id
    )
    AND (prof.gender IS NULL OR prof.gender = ANY(v_gender_interest))
    AND (
      prof.birth_date IS NULL 
      OR EXTRACT(YEAR FROM age(CURRENT_DATE, prof.birth_date))::INTEGER BETWEEN v_min_age AND v_max_age
    )
  ORDER BY
    (prof.plan_type = 'vip') DESC,
    shared_tags_count DESC,
    random()
  LIMIT p_limit;
END;
$$;