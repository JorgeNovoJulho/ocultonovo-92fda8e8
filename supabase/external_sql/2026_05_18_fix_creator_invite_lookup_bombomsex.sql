-- Corrige a resolução pública de /creator-invite/:code
-- Aceita creator_referral_code oficial e fallback legado por username.

CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input text := trim(coalesce(p_code, ''));
  v_upper text := upper(v_input);
  v_lower text := lower(v_input);
  v_username_guess text := lower(regexp_replace(v_input, '\d+$', ''));
  v_profile record;
BEGIN
  IF v_input = '' THEN
    RETURN NULL;
  END IF;

  SELECT
    p.id,
    p.user_id,
    p.username,
    COALESCE(p.name, p.full_name) AS name,
    p.avatar_url,
    COALESCE(p.is_verified, false) AS is_verified,
    COALESCE(p.bio, NULL) AS bio,
    COALESCE(p.is_creator, true) AS is_creator,
    p.creator_referral_code
  INTO v_profile
  FROM public.profiles p
  WHERE (
      p.creator_referral_code = v_upper
      OR lower(coalesce(p.username, '')) = v_lower
      OR lower(coalesce(p.username, '')) = v_username_guess
    )
    AND coalesce(p.account_status, 'active') = 'active'
  ORDER BY
    CASE
      WHEN p.creator_referral_code = v_upper THEN 0
      WHEN lower(coalesce(p.username, '')) = v_lower THEN 1
      WHEN lower(coalesce(p.username, '')) = v_username_guess THEN 2
      ELSE 3
    END,
    p.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'user_id', v_profile.user_id,
    'username', v_profile.username,
    'name', v_profile.name,
    'avatar_url', v_profile.avatar_url,
    'is_verified', v_profile.is_verified,
    'bio', v_profile.bio,
    'is_creator', v_profile.is_creator,
    'creator_referral_code', v_profile.creator_referral_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';