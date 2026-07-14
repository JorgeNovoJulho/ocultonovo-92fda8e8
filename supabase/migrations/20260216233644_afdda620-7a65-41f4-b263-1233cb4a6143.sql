
-- Fix the ROUND() error by casting to numeric
CREATE OR REPLACE FUNCTION public.get_perfect_pairs(
  p_user_id uuid,
  p_limit integer DEFAULT 10,
  p_viewer_lat double precision DEFAULT NULL,
  p_viewer_lng double precision DEFAULT NULL
)
RETURNS TABLE (
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
        ROUND(
          (6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(p_viewer_lat)) * cos(radians(prof.location_lat)) *
              cos(radians(prof.location_lng) - radians(p_viewer_lng)) +
              sin(radians(p_viewer_lat)) * sin(radians(prof.location_lat))
            ))
          ))::numeric, 1
        )::double precision
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

-- Fix trigger to also handle super_like as a valid match action
CREATE OR REPLACE FUNCTION public.check_perfect_pair_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reverse_exists boolean;
  v_user_name text;
  v_target_name text;
  v_user_auth_id uuid;
  v_target_auth_id uuid;
BEGIN
  -- Match on like OR super_like
  IF NEW.action IN ('like', 'super_like') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.perfect_pairs
      WHERE user_id = NEW.target_id AND target_id = NEW.user_id AND action IN ('like', 'super_like')
    ) INTO v_reverse_exists;

    IF v_reverse_exists THEN
      SELECT name, user_id INTO v_user_name, v_user_auth_id FROM public.profiles WHERE id = NEW.user_id;
      SELECT name, user_id INTO v_target_name, v_target_auth_id FROM public.profiles WHERE id = NEW.target_id;

      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES 
        (v_user_auth_id, 'looking_now_match', 'Perfect Pair! 💕', v_target_name || ' também curtiu você!', jsonb_build_object('pair_user_id', NEW.target_id)),
        (v_target_auth_id, 'looking_now_match', 'Perfect Pair! 💕', v_user_name || ' também curtiu você!', jsonb_build_object('pair_user_id', NEW.user_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Clean up test swipes so users can re-test matching
DELETE FROM perfect_pairs 
WHERE (user_id = 'af0f8724-fdeb-4f57-abe4-1e615576465d' AND target_id = '63e136b3-01dd-492b-8311-e6406547488c')
   OR (user_id = '63e136b3-01dd-492b-8311-e6406547488c' AND target_id = 'af0f8724-fdeb-4f57-abe4-1e615576465d');
