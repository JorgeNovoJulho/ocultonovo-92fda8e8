-- ============================================================
-- Oculto — Backfill login_count + sincronização com auth.users
-- Corrige usuários com login_count = 0 que já possuem
-- last_sign_in_at em auth.users ou last_seen em profiles.
-- 100% idempotente.
-- ============================================================

-- 1) Backfill a partir de auth.users.last_sign_in_at
UPDATE public.profiles p
   SET login_count   = GREATEST(COALESCE(p.login_count, 0), 1),
       last_login_at = COALESCE(p.last_login_at, u.last_sign_in_at)
  FROM auth.users u
 WHERE (p.user_id = u.id OR p.id = u.id)
   AND u.last_sign_in_at IS NOT NULL
   AND COALESCE(p.login_count, 0) = 0;

-- 2) Fallback: se ainda houver 0 mas existe last_seen, usa last_seen
UPDATE public.profiles
   SET login_count   = 1,
       last_login_at = COALESCE(last_login_at, last_seen)
 WHERE COALESCE(login_count, 0) = 0
   AND last_seen IS NOT NULL;

-- 3) RPC reforçada: garante mínimo 1 e atualiza last_login_at
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
     SET login_count   = COALESCE(login_count, 0) + 1,
         last_login_at = now()
   WHERE user_id = v_uid
      OR id      = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_login_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_login_count() TO authenticated;

NOTIFY pgrst, 'reload schema';
