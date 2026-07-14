
-- Function to get suggested users based on common tags
CREATE OR REPLACE FUNCTION public.get_suggested_users(
  p_user_id UUID,
  p_limit INT DEFAULT 15
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  username TEXT,
  avatar_url TEXT,
  gender TEXT,
  common_interests INT,
  tags_social TEXT[],
  tags_adult TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_my_social TEXT[];
  v_my_adult TEXT[];
BEGIN
  -- Get caller's profile
  SELECT p.id, p.tags_social, p.tags_adult
  INTO v_profile_id, v_my_social, v_my_adult
  FROM profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Coalesce empty arrays
  v_my_social := COALESCE(v_my_social, '{}');
  v_my_adult := COALESCE(v_my_adult, '{}');

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.name,
    p.username,
    p.avatar_url,
    p.gender,
    (
      COALESCE(array_length(
        ARRAY(SELECT unnest(COALESCE(p.tags_social, '{}')) INTERSECT SELECT unnest(v_my_social)),
        1
      ), 0)
      +
      COALESCE(array_length(
        ARRAY(SELECT unnest(COALESCE(p.tags_adult, '{}')) INTERSECT SELECT unnest(v_my_adult)),
        1
      ), 0)
    )::INT AS common_interests,
    COALESCE(p.tags_social, '{}') AS tags_social,
    COALESCE(p.tags_adult, '{}') AS tags_adult
  FROM profiles p
  WHERE p.id != v_profile_id
    AND p.user_id != p_user_id
    -- Exclude already followed
    AND NOT EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = v_profile_id AND f.following_id = p.id
    )
  ORDER BY
    common_interests DESC,
    random()
  LIMIT p_limit;
END;
$$;
