-- ============================================================
-- LOOKUP REFERRAL CODE — resolves /share/:code to a referrer profile
-- Idempotent. Callable by anon (SharePage) and authenticated users.
-- Run on EXTERNAL Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := lower(trim(coalesce(p_code, '')));
  v_username text;
  v_profile record;
BEGIN
  IF v_code = '' THEN
    RETURN NULL;
  END IF;

  -- Accept both raw @username and legacy "username + digits" codes
  v_username := regexp_replace(v_code, '\d+$', '');

  SELECT id, user_id, username, name, full_name, avatar_url, is_verified
  INTO v_profile
  FROM public.profiles
  WHERE lower(username) = v_username
  LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback: try the original code as-is (no digit stripping)
    SELECT id, user_id, username, name, full_name, avatar_url, is_verified
    INTO v_profile
    FROM public.profiles
    WHERE lower(username) = v_code
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'user_id', v_profile.user_id,
    'username', v_profile.username,
    'name', COALESCE(v_profile.name, v_profile.full_name),
    'avatar_url', v_profile.avatar_url,
    'is_verified', v_profile.is_verified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
