-- ============================================================
-- Oculto — Contador de logins por usuário
-- Adiciona profiles.login_count + profiles.last_login_at
-- e RPC public.increment_login_count() chamada após SIGNED_IN.
-- 100% idempotente.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_login_count_desc
  ON public.profiles (login_count DESC);

-- RPC: incrementa de forma segura, sem RLS issues.
CREATE OR REPLACE FUNCTION public.increment_login_count()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
     SET login_count  = COALESCE(login_count, 0) + 1,
         last_login_at = now()
   WHERE user_id = v_uid
      OR id      = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_login_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_login_count() TO authenticated;

NOTIFY pgrst, 'reload schema';
