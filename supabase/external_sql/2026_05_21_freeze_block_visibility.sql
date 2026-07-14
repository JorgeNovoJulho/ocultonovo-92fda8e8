-- ============================================================================
-- CONGELAR / BLOQUEAR — Invisibilidade Real (RLS RESTRICTIVE) — v6
-- v6: funções em PLPGSQL (não-inlinable) para evitar recursão infinita.
-- 100% idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

DROP FUNCTION IF EXISTS public.current_profile_id() CASCADE;
DROP FUNCTION IF EXISTS public.profiles_that_blocked_me() CASCADE;
DROP FUNCTION IF EXISTS public.auth_users_that_blocked_me() CASCADE;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT pr.id INTO v_id FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.profiles_that_blocked_me()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT bc.user_id
  FROM public.blocked_contacts bc
  WHERE bc.blocked_user_id = public.current_profile_id()
    AND bc.block_type IN ('blocked', 'muted');
END;
$$;
GRANT EXECUTE ON FUNCTION public.profiles_that_blocked_me() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.auth_users_that_blocked_me()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT pr.user_id
  FROM public.blocked_contacts bc
  JOIN public.profiles pr ON pr.id = bc.user_id
  WHERE bc.blocked_user_id = public.current_profile_id()
    AND bc.block_type IN ('blocked', 'muted');
END;
$$;
GRANT EXECUTE ON FUNCTION public.auth_users_that_blocked_me() TO authenticated, anon;

-- Policy em posts
DROP POLICY IF EXISTS "posts_hidden_when_author_blocked_viewer" ON public.posts;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='author_id') THEN
    EXECUTE $sql$
      CREATE POLICY "posts_hidden_when_author_blocked_viewer"
        ON public.posts AS RESTRICTIVE FOR SELECT TO authenticated
        USING (author_id IS NULL OR author_id NOT IN (SELECT public.profiles_that_blocked_me()))
    $sql$;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='user_id') THEN
    EXECUTE $sql$
      CREATE POLICY "posts_hidden_when_author_blocked_viewer"
        ON public.posts AS RESTRICTIVE FOR SELECT TO authenticated
        USING (user_id IS NULL OR user_id NOT IN (SELECT public.auth_users_that_blocked_me()))
    $sql$;
  END IF;
END $$;

-- Policy em profiles
DROP POLICY IF EXISTS "profiles_hidden_when_owner_blocked_viewer" ON public.profiles;
CREATE POLICY "profiles_hidden_when_owner_blocked_viewer"
  ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR id NOT IN (SELECT public.profiles_that_blocked_me())
  );

NOTIFY pgrst, 'reload schema';
