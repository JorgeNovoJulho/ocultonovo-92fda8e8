
-- Function to look up a referral code and return the profile info (safe for anon access)
CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', p.id,
    'name', p.name,
    'username', p.username,
    'avatar_url', p.avatar_url,
    'is_verified', p.is_verified,
    'bio', p.bio
  )
  FROM profiles p
  WHERE p.creator_referral_code = p_code
    AND p.account_status = 'active'
  LIMIT 1;
$$;
