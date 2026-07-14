-- =====================================================================
-- Security Hardening V2 — 2026-06-04
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Reaplica o hardening anterior + corrige SECURITY DEFINER views
-- e funções com search_path mutável (linter Supabase).
-- =====================================================================

-- Compat
CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin_master') $$;

-- 1) aura_xp_global_config — UPDATE só admin master
DO $$ BEGIN
  IF to_regclass('public.aura_xp_global_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin master can update global config" ON public.aura_xp_global_config';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can update global config" ON public.aura_xp_global_config';
    EXECUTE $p$
      CREATE POLICY "Admin master can update global config"
        ON public.aura_xp_global_config FOR UPDATE TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- 2) aura_xp_interaction_config — ALL só admin master
DO $$ BEGIN
  IF to_regclass('public.aura_xp_interaction_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin master can manage interaction config" ON public.aura_xp_interaction_config';
    EXECUTE $p$
      CREATE POLICY "Admin master can manage interaction config"
        ON public.aura_xp_interaction_config FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- 3) cookie_consents — sem brecha session_id
DO $$ BEGIN
  IF to_regclass('public.cookie_consents') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own cookie consent" ON public.cookie_consents';
    EXECUTE $p$
      CREATE POLICY "Users can view their own cookie consent"
        ON public.cookie_consents FOR SELECT TO authenticated
        USING (auth.uid() = user_id)
    $p$;
  END IF;
END $$;

-- 4) system_settings — derruba qualquer policy pública e recria com allowlist
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='system_settings' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_settings', p.policyname);
    END LOOP;
    EXECUTE $p$
      CREATE POLICY "Authenticated can read settings"
        ON public.system_settings FOR SELECT TO authenticated USING (true)
    $p$;
    EXECUTE $p$
      CREATE POLICY "Anon read public allowlist"
        ON public.system_settings FOR SELECT TO anon
        USING (key IN (
          'site_name','site_logo_url','site_favicon_url',
          'maintenance_mode','platform_phase','public_announcement',
          'waitlist_enabled','signup_enabled'
        ))
    $p$;
    EXECUTE $p$
      CREATE POLICY "Admin master can manage settings"
        ON public.system_settings FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- 5) support_attachments — bucket privado + leitura restrita
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='support_attachments') THEN
    UPDATE storage.buckets SET public=false WHERE id='support_attachments';
    EXECUTE 'DROP POLICY IF EXISTS "Public read support attachments" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Owner can read own support attachments" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Admin can read all support attachments" ON storage.objects';
    EXECUTE $p$
      CREATE POLICY "Owner can read own support attachments"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id='support_attachments' AND owner=auth.uid())
    $p$;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin') THEN
      EXECUTE $p$
        CREATE POLICY "Admin can read all support attachments"
          ON storage.objects FOR SELECT TO authenticated
          USING (bucket_id='support_attachments' AND public.is_admin(auth.uid()))
      $p$;
    END IF;
  END IF;
END $$;

-- 6) cart_abandonment — só admin master
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.cart_abandonment') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='cart_abandonment' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.cart_abandonment', p.policyname);
    END LOOP;
    EXECUTE $p$
      CREATE POLICY "Admin master can manage cart abandonment"
        ON public.cart_abandonment FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
    EXECUTE $p$
      CREATE POLICY "Anon can insert abandonment"
        ON public.cart_abandonment FOR INSERT TO anon
        WITH CHECK (user_id IS NULL)
    $p$;
    EXECUTE $p$
      CREATE POLICY "Users can insert own abandonment"
        ON public.cart_abandonment FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid())
    $p$;
  END IF;
END $$;

-- 7) realtime.messages — exigir autenticação
DO $$ BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can subscribe to own topics" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can broadcast to own topics" ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY "Authenticated users can subscribe to own topics"
        ON realtime.messages FOR SELECT TO authenticated
        USING (
          (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%')
          OR (realtime.topic() LIKE 'public:%')
          OR (realtime.topic() LIKE 'presence:%')
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY "Authenticated users can broadcast to own topics"
        ON realtime.messages FOR INSERT TO authenticated
        WITH CHECK (
          (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%')
          OR (realtime.topic() LIKE 'public:%')
          OR (realtime.topic() LIKE 'presence:%')
        )
    $p$;
  END IF;
END $$;

-- 8) Converter quaisquer views SECURITY DEFINER do schema public para SECURITY INVOKER
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('v','m')
      AND n.nspname='public'
      AND COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name='security_invoker'),'false') <> 'true'
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', v.nspname, v.relname);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- 9) Setar search_path em todas as funções public que estão sem (linter)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prokind IN ('f','p')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', f.nspname, f.proname, f.args);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
