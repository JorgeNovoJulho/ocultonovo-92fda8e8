
-- Atomic signup gate: prevents race conditions when multiple users try to register simultaneously
-- Returns true if signup is allowed, false if limit reached
CREATE OR REPLACE FUNCTION public.try_claim_signup_slot()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current BIGINT;
  v_max INTEGER;
  v_raw TEXT;
BEGIN
  -- Lock the setting row to serialize concurrent checks
  SELECT value::text INTO v_raw
  FROM system_settings
  WHERE key = 'max_users_limit'
  FOR UPDATE;

  v_max := COALESCE(
    regexp_replace(COALESCE(v_raw, '1000'), '[^0-9]', '', 'g')::INTEGER,
    1000
  );

  SELECT COUNT(*) INTO v_current
  FROM profiles
  WHERE is_seed = false OR is_seed IS NULL;

  RETURN v_current < v_max;
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_claim_signup_slot() TO authenticated, anon;
