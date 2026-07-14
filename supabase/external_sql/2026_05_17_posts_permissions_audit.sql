-- ============================================================================
-- AUDIT: garantir que TODOS os usuários consigam postar no feed público
-- Idempotente — rode no SQL Editor do Supabase EXTERNO.
--
-- O que faz:
--   1) Garante a policy de INSERT em public.posts para qualquer authenticated
--      cujo author_id/creator_id seja o próprio perfil (ou auth.uid()).
--   2) Garante leitura pública dos posts não-ocultos.
--   3) Expõe a RPC `audit_post_permissions()` para o frontend listar quem
--      ainda está bloqueado (freeze ativo, banido) e o motivo.
-- ============================================================================

-- 1) RLS posts — INSERT permissivo p/ qualquer authenticated dono
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = creator_id
    OR auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = public.posts.author_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = creator_id
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.posts.author_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE
  TO authenticated
  USING (
    auth.uid() = creator_id
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.posts.author_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public"
  ON public.posts FOR SELECT
  USING (
    coalesce(is_hidden, false) = false
    AND coalesce(privacy_level, 'public') = 'public'
    OR auth.uid() = creator_id
    OR auth.uid() = author_id
  );

-- 2) RPC de auditoria — lista quem NÃO pode postar e por quê
-- Defensiva: funciona mesmo se o banco externo ainda não tiver banned_at/frozen_until.
CREATE OR REPLACE FUNCTION public.audit_post_permissions()
RETURNS TABLE (
  user_id uuid,
  profile_id uuid,
  username text,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_banned_at boolean;
  has_frozen_until boolean;
  has_account_status boolean;
  has_is_seed boolean;
  sql text;
  reason_case text := 'NULL';
  restriction_filter text := 'FALSE';
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'banned_at'
  ) INTO has_banned_at;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'frozen_until'
  ) INTO has_frozen_until;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'account_status'
  ) INTO has_account_status;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_seed'
  ) INTO has_is_seed;

  IF has_banned_at THEN
    reason_case := reason_case || E'\n      WHEN p.banned_at IS NOT NULL THEN ''banido''';
    restriction_filter := restriction_filter || ' OR p.banned_at IS NOT NULL';
  END IF;

  IF has_account_status THEN
    reason_case := reason_case || E'\n      WHEN coalesce(p.account_status, ''active'') = ''banned'' THEN ''banido''';
    restriction_filter := restriction_filter || E' OR coalesce(p.account_status, ''active'') = ''banned''';
  END IF;

  IF has_frozen_until THEN
    reason_case := reason_case || E'\n      WHEN p.frozen_until IS NOT NULL AND p.frozen_until > now() THEN ''congelado até '' || p.frozen_until::text';
    restriction_filter := restriction_filter || ' OR (p.frozen_until IS NOT NULL AND p.frozen_until > now())';
  END IF;

  IF has_account_status THEN
    reason_case := reason_case || E'\n      WHEN coalesce(p.account_status, ''active'') = ''frozen'' THEN ''congelado''';
    reason_case := reason_case || E'\n      WHEN coalesce(p.account_status, ''active'') NOT IN (''active'',''verified'') THEN ''status: '' || coalesce(p.account_status, ''null'')';
    restriction_filter := restriction_filter || E' OR coalesce(p.account_status, ''active'') NOT IN (''active'',''verified'')';
  END IF;

  sql := format($fmt$
    SELECT
      p.user_id,
      p.id AS profile_id,
      p.username,
      CASE
        %s
        ELSE NULL
      END AS reason
    FROM public.profiles p
    WHERE %s
      AND (%s)
  $fmt$,
    reason_case,
    CASE WHEN has_is_seed THEN 'coalesce(p.is_seed, false) = false' ELSE 'TRUE' END,
    restriction_filter
  );

  RETURN QUERY EXECUTE sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_post_permissions() TO authenticated;

-- 3) Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
