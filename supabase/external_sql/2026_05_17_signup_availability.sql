-- ============================================================================
-- SIGNUP — Checagem de disponibilidade de e-mail e username (anon-safe)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- Índice case-insensitive em profiles.username (caso ainda não exista)
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION public.signup_check_availability(
  p_email    text DEFAULT '',
  p_username text DEFAULT ''
)
RETURNS TABLE (email_taken boolean, username_taken boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_taken    boolean := false;
  v_username_taken boolean := false;
BEGIN
  IF coalesce(p_email,'') <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users
       WHERE lower(email) = lower(p_email)
    ) INTO v_email_taken;
  END IF;

  IF coalesce(p_username,'') <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
       WHERE lower(username) = lower(p_username)
    ) INTO v_username_taken;
  END IF;

  RETURN QUERY SELECT v_email_taken, v_username_taken;
END $$;

REVOKE ALL ON FUNCTION public.signup_check_availability(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.signup_check_availability(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
