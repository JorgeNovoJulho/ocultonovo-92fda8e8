-- =====================================================================
-- Fix has_role(::app_role) cast — 2025-06-17
-- Idempotente, com guards IF EXISTS / to_regclass.
-- Roda no SQL Editor do Supabase EXTERNO. Pode rodar várias vezes.
-- =====================================================================

-- 1) aura_xp_global_config
DO $$
BEGIN
  IF to_regclass('public.aura_xp_global_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_global_config_admin_write" ON public.aura_xp_global_config';
    EXECUTE $p$
      CREATE POLICY "aura_xp_global_config_admin_write"
        ON public.aura_xp_global_config
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- 2) aura_xp_interaction_config
DO $$
BEGIN
  IF to_regclass('public.aura_xp_interaction_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_interaction_config_admin_write" ON public.aura_xp_interaction_config';
    EXECUTE $p$
      CREATE POLICY "aura_xp_interaction_config_admin_write"
        ON public.aura_xp_interaction_config
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- 3) cart_abandonment
DO $$
BEGIN
  IF to_regclass('public.cart_abandonment') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "cart_abandonment_admin_all" ON public.cart_abandonment';
    EXECUTE $p$
      CREATE POLICY "cart_abandonment_admin_all"
        ON public.cart_abandonment
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- 4) Loop genérico: recria toda policy que ainda contenha '::app_role'
DO $$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_check TEXT;
  sql_cmd TEXT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%::app_role%' OR with_check ILIKE '%::app_role%')
  LOOP
    -- garante que a tabela ainda existe
    IF to_regclass(format('%I.%I', r.schemaname, r.tablename)) IS NULL THEN
      CONTINUE;
    END IF;

    new_qual  := regexp_replace(COALESCE(r.qual, ''),       '::app_role', '', 'g');
    new_check := regexp_replace(COALESCE(r.with_check, ''), '::app_role', '', 'g');

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);

    sql_cmd := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      r.policyname, r.schemaname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      array_to_string(r.roles, ', ')
    );

    IF new_qual <> '' THEN
      sql_cmd := sql_cmd || format(' USING (%s)', new_qual);
    END IF;
    IF new_check <> '' THEN
      sql_cmd := sql_cmd || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE sql_cmd;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
