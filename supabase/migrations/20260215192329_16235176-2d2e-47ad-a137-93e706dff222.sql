
-- Add tags columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tags_social text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tags_adult text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS connection_mode boolean DEFAULT false;

-- Create index for tag-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_tags_social ON public.profiles USING GIN(tags_social);
CREATE INDEX IF NOT EXISTS idx_profiles_tags_adult ON public.profiles USING GIN(tags_adult);

-- Function to calculate compatibility between two users
CREATE OR REPLACE FUNCTION public.get_advanced_compatibility(user_a_id uuid, user_b_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_social text[];
  a_adult text[];
  b_social text[];
  b_adult text[];
  social_common text[];
  adult_common text[];
  social_pct numeric;
  adult_pct numeric;
  total_pct numeric;
  has_adult_match boolean;
BEGIN
  SELECT COALESCE(tags_social, '{}'), COALESCE(tags_adult, '{}')
  INTO a_social, a_adult
  FROM profiles WHERE id = user_a_id;

  SELECT COALESCE(tags_social, '{}'), COALESCE(tags_adult, '{}')
  INTO b_social, b_adult
  FROM profiles WHERE id = user_b_id;

  -- Find common tags
  SELECT ARRAY(SELECT unnest(a_social) INTERSECT SELECT unnest(b_social)) INTO social_common;
  SELECT ARRAY(SELECT unnest(a_adult) INTERSECT SELECT unnest(b_adult)) INTO adult_common;

  -- Calculate percentages
  IF array_length(a_social, 1) IS NULL AND array_length(b_social, 1) IS NULL THEN
    social_pct := 0;
  ELSE
    social_pct := (COALESCE(array_length(social_common, 1), 0)::numeric / 
                   GREATEST(GREATEST(COALESCE(array_length(a_social, 1), 0), COALESCE(array_length(b_social, 1), 0)), 1)) * 100;
  END IF;

  IF array_length(a_adult, 1) IS NULL AND array_length(b_adult, 1) IS NULL THEN
    adult_pct := 0;
  ELSE
    adult_pct := (COALESCE(array_length(adult_common, 1), 0)::numeric / 
                  GREATEST(GREATEST(COALESCE(array_length(a_adult, 1), 0), COALESCE(array_length(b_adult, 1), 0)), 1)) * 100;
  END IF;

  has_adult_match := COALESCE(array_length(adult_common, 1), 0) > 0;
  
  -- Weighted average: 40% social, 60% adult
  total_pct := (social_pct * 0.4) + (adult_pct * 0.6);

  RETURN jsonb_build_object(
    'total_pct', ROUND(total_pct),
    'social_pct', ROUND(social_pct),
    'adult_pct', ROUND(adult_pct),
    'social_common', to_jsonb(social_common),
    'adult_common', to_jsonb(adult_common),
    'has_adult_match', has_adult_match
  );
END;
$$;
