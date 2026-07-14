
-- Add pair_photos column to profiles for carousel photos (up to 10 storage URLs)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pair_photos TEXT[] DEFAULT '{}';

-- Create pair_settings table for user preferences/filters
CREATE TABLE IF NOT EXISTS public.pair_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  min_age INTEGER DEFAULT 18,
  max_age INTEGER DEFAULT 99,
  max_distance_km INTEGER DEFAULT 100,
  gender_interest TEXT[] DEFAULT ARRAY['female','male','couple','trans']::TEXT[],
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pair_settings ENABLE ROW LEVEL SECURITY;

-- Policies: users manage their own settings
CREATE POLICY "Users can view own pair settings"
  ON public.pair_settings FOR SELECT
  USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own pair settings"
  ON public.pair_settings FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own pair settings"
  ON public.pair_settings FOR UPDATE
  USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Function to get affinity-ranked pairs
CREATE OR REPLACE FUNCTION public.get_perfect_pairs(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
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
  shared_tags TEXT[]
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
  -- Get current user's tags
  SELECT p.tags_social, p.tags_adult
  INTO v_user_tags_social, v_user_tags_adult
  FROM profiles p WHERE p.id = p_user_id;

  -- Get pair settings (defaults if not set)
  SELECT
    COALESCE(ps.gender_interest, ARRAY['female','male','couple','trans']::TEXT[]),
    COALESCE(ps.min_age, 18),
    COALESCE(ps.max_age, 99)
  INTO v_gender_interest, v_min_age, v_max_age
  FROM pair_settings ps WHERE ps.user_id = p_user_id;

  -- If no settings exist, use defaults
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
    -- Count shared tags (social + adult)
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
    -- Array of shared tags
    (
      ARRAY(SELECT unnest(COALESCE(prof.tags_social, '{}')) INTERSECT SELECT unnest(COALESCE(v_user_tags_social, '{}')))
      ||
      ARRAY(SELECT unnest(COALESCE(prof.tags_adult, '{}')) INTERSECT SELECT unnest(COALESCE(v_user_tags_adult, '{}')))
    ) AS shared_tags
  FROM profiles prof
  WHERE prof.id != p_user_id
    AND prof.is_anonymized = false
    AND (prof.is_invisible IS NULL OR prof.is_invisible = false)
    -- Exclude already swiped
    AND prof.id NOT IN (
      SELECT pp.target_id FROM perfect_pairs pp WHERE pp.user_id = p_user_id
    )
    -- Gender filter
    AND (prof.gender IS NULL OR prof.gender = ANY(v_gender_interest))
  ORDER BY
    -- Boosted profiles first
    (prof.plan_type = 'vip') DESC,
    -- Then by shared tags count (affinity)
    shared_tags_count DESC,
    -- Then random for variety
    random()
  LIMIT p_limit;
END;
$$;
