DROP FUNCTION IF EXISTS public.lookup_referral_code(text);

CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := btrim(coalesce(p_code, ''));
  v_lower text := lower(v_code);
  v_uuid uuid;
  v_profile record;
BEGIN
  IF v_code = '' THEN
    RETURN NULL;
  END IF;

  SELECT p.id, p.user_id, p.username, p.name, p.avatar_url, p.is_verified, p.bio, p.is_creator
    INTO v_profile
  FROM public.profiles p
  WHERE lower(p.username) = v_lower
  LIMIT 1;

  IF v_profile IS NULL THEN
    BEGIN
      v_uuid := v_code::uuid;
    EXCEPTION WHEN others THEN
      v_uuid := NULL;
    END;

    IF v_uuid IS NOT NULL THEN
      SELECT p.id, p.user_id, p.username, p.name, p.avatar_url, p.is_verified, p.bio, p.is_creator
        INTO v_profile
      FROM public.profiles p
      WHERE p.id = v_uuid OR p.user_id = v_uuid
      LIMIT 1;
    END IF;
  END IF;

  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', v_profile.id,
    'user_id', v_profile.user_id,
    'username', v_profile.username,
    'name', v_profile.name,
    'avatar_url', v_profile.avatar_url,
    'is_verified', coalesce(v_profile.is_verified, false),
    'bio', v_profile.bio,
    'is_creator', coalesce(v_profile.is_creator, true)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO anon, authenticated;