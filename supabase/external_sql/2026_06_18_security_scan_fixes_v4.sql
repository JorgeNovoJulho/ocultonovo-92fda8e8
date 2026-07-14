-- =====================================================================
-- 2026-06-18 — Security Scan Hardening v4 (consolidado)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
--
-- ATENÇÃO: se der erro "function public.has_role does not exist",
-- execute PRIMEIRO o script 2026_06_18_prerequisite_app_role_and_has_role.sql
--
-- Cobre os achados restantes do scan:
--   A) profiles_sensitive_fields_exposed
--   B) SUPA_security_definer_view
--   C) SUPA_anon/authenticated_security_definer_function_executable
--   D) SUPA_extension_in_public
--   E) SUPA_function_search_path_mutable
--   F) SUPA_public_bucket_allows_listing
--   G) SUPA_rls_policy_always_true
--   H) Reaplica fixes anteriores
--
-- Após rodar: NOTIFY pgrst, 'reload schema'.
-- =====================================================================

-- =====================================================================
-- 0) Pré-requisito defensivo: app_role + has_role (idempotente)
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin_master', 'admin_regional', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_own_read" ON public.user_roles;
CREATE POLICY "user_roles_own_read"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin_master','admin_regional','moderator'))
$$;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin_master')
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);



-- =====================================================================
-- A) profiles — bloquear colunas sensíveis para não-donos
-- =====================================================================
DO $$
DECLARE
  v_sensitive text[] := ARRAY[
    'phone_number','cpf_cnpj','pix_key','pix_key_type',
    'balance','pending_balance',
    'stripe_customer_id','asaas_wallet_id',
    'kyc_selfie_url','kyc_document_url',
    'address_street','address_cep',
    'risk_flags','ban_reason','two_factor_enabled'
  ];
  c text;
BEGIN
  FOREACH c IN ARRAY v_sensitive LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='profiles' AND column_name=c
    ) THEN
      BEGIN
        EXECUTE format('REVOKE SELECT (%I) ON public.profiles FROM anon', c);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        EXECUTE format('REVOKE SELECT (%I) ON public.profiles FROM authenticated', c);
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;
END $$;

-- RPC SECURITY DEFINER para o próprio dono ler perfil completo
CREATE OR REPLACE FUNCTION public.get_my_full_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid() OR user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_full_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated, service_role;

-- =====================================================================
-- B) Recria views public.* com security_invoker=true
-- =====================================================================
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.relname AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v'
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.view_name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip view %: %', v.view_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================================
-- C) Revoga EXECUTE de DEFINER de anon/authenticated (whitelist mínima)
-- =====================================================================
DO $$
DECLARE
  f record;
  whitelist_public text[] := ARRAY[
    'has_role','is_admin','is_admin_master',
    'lookup_referral_code','social_core_identity_get'
  ];
  whitelist_auth text[] := ARRAY[
    'has_role','is_admin','is_admin_master',
    'lookup_referral_code','social_core_identity_get',
    'record_profile_visit','process_oculto_payment_split',
    'purchase_marketplace_item','real_experience_join','real_experience_leave',
    'get_my_full_profile'
  ];
BEGIN
  FOR f IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true AND p.prokind IN ('f','p')
  LOOP
    BEGIN
      IF NOT (f.proname = ANY(whitelist_public)) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
                       f.nspname, f.proname, f.args);
      END IF;
      IF NOT (f.proname = ANY(whitelist_auth)) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                       f.nspname, f.proname, f.args);
      END IF;
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
                     f.nspname, f.proname, f.args);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- =====================================================================
-- D) Move extensions seguras de public → extensions schema
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
DO $$
DECLARE e record;
BEGIN
  FOR e IN
    SELECT extname FROM pg_extension ex
    JOIN pg_namespace n ON n.oid=ex.extnamespace
    WHERE n.nspname='public'
      AND ex.extname IN ('pg_trgm','citext','uuid-ossp','unaccent','pgcrypto','btree_gin','btree_gist')
  LOOP
    BEGIN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', e.extname);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip extension %: %', e.extname, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================================
-- E) Garante search_path em todas as funções public
-- =====================================================================
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind IN ('f','p')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public',
                     f.nspname, f.proname, f.args);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- =====================================================================
-- F) Storage: bloqueia listing amplo de buckets públicos
-- =====================================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND cmd='SELECT'
      AND (qual='true' OR policyname IN (
        'Public read all buckets','Anyone can list objects','Public list objects'
      ))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "anon_read_public_buckets_only" ON storage.objects;
CREATE POLICY "anon_read_public_buckets_only"
ON storage.objects FOR SELECT TO anon
USING (
  bucket_id IN (SELECT id FROM storage.buckets WHERE public = true)
);

-- =====================================================================
-- G) Drop policies de mutação com USING(true) ou WITH CHECK(true)
-- =====================================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname='public'
      AND cmd IN ('UPDATE','INSERT','DELETE','ALL')
      AND (qual='true' OR with_check='true')
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                     pol.policyname, pol.schemaname, pol.tablename);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- =====================================================================
-- H) Reforça fixes anteriores (post_dislikes, story_*, user_trust_scores,
--    system_settings, aura_xp_*, oculto_master_alert_settings,
--    seed-backups, support_attachments)
-- =====================================================================

-- post_dislikes
DO $$ DECLARE r record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='post_dislikes') THEN
    FOR r IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='post_dislikes' AND cmd='SELECT'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_dislikes', r.policyname); END LOOP;
    EXECUTE 'CREATE POLICY "post_dislikes_select_auth" ON public.post_dislikes
             FOR SELECT TO authenticated USING (true)';
    REVOKE SELECT ON public.post_dislikes FROM anon;
  END IF;
END $$;

-- story_likes / story_dislikes
DO $$ DECLARE r record; t text; BEGIN
  FOREACH t IN ARRAY ARRAY['story_likes','story_dislikes'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      FOR r IN SELECT policyname FROM pg_policies
        WHERE schemaname='public' AND tablename=t AND cmd='SELECT'
      LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t); END LOOP;
      EXECUTE format('CREATE POLICY "%s_select_auth" ON public.%I
                       FOR SELECT TO authenticated USING (true)', t, t);
      EXECUTE format('REVOKE SELECT ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- user_trust_scores
DO $$ DECLARE r record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='user_trust_scores') THEN
    FOR r IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='user_trust_scores' AND cmd='SELECT'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_trust_scores', r.policyname); END LOOP;
    EXECUTE 'CREATE POLICY "user_trust_scores_select_auth" ON public.user_trust_scores
             FOR SELECT TO authenticated USING (true)';
    REVOKE SELECT ON public.user_trust_scores FROM anon;
  END IF;
END $$;

-- system_settings
DO $$ DECLARE r record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='system_settings') THEN
    FOR r IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='system_settings' AND cmd='SELECT'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_settings', r.policyname); END LOOP;
    EXECUTE $p$
      CREATE POLICY "system_settings_select_auth_filtered"
        ON public.system_settings FOR SELECT TO authenticated
        USING (
          key IS NULL OR (
            key NOT ILIKE '%secret%'
            AND key NOT ILIKE '%api_key%'
            AND key NOT ILIKE '%token%'
            AND key NOT ILIKE '%password%'
          )
        )
    $p$;
    EXECUTE 'CREATE POLICY "system_settings_admin_all"
               ON public.system_settings FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::public.app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::public.app_role))';
    REVOKE SELECT ON public.system_settings FROM anon;
  END IF;
END $$;

-- aura_xp_global_config
DO $$ DECLARE r record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='aura_xp_global_config') THEN
    FOR r IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='aura_xp_global_config'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.aura_xp_global_config', r.policyname); END LOOP;
    EXECUTE 'ALTER TABLE public.aura_xp_global_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "aura_xp_global_config_select_auth"
               ON public.aura_xp_global_config FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "aura_xp_global_config_admin_write"
               ON public.aura_xp_global_config FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::public.app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::public.app_role))';
  END IF;
END $$;

-- aura_xp_interaction_config
DO $$ DECLARE r record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='aura_xp_interaction_config') THEN
    FOR r IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='aura_xp_interaction_config'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.aura_xp_interaction_config', r.policyname); END LOOP;
    EXECUTE 'ALTER TABLE public.aura_xp_interaction_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "aura_xp_interaction_config_select_auth"
               ON public.aura_xp_interaction_config FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "aura_xp_interaction_config_admin_write"
               ON public.aura_xp_interaction_config FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::public.app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::public.app_role))';
  END IF;
END $$;

-- oculto_master_alert_settings (sem username)
DO $$ DECLARE r record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='oculto_master_alert_settings') THEN
    FOR r IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='oculto_master_alert_settings'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.oculto_master_alert_settings', r.policyname); END LOOP;
    EXECUTE 'ALTER TABLE public.oculto_master_alert_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "oculto_master_alert_settings_admin_all"
               ON public.oculto_master_alert_settings FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::public.app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::public.app_role))';
  END IF;
END $$;

-- Storage: seed-backups (INSERT só admin_master)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual ILIKE '%seed-backups%' OR with_check ILIKE '%seed-backups%')
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname); END LOOP;

  EXECUTE 'CREATE POLICY "seed_backups_admin_write"
             ON storage.objects FOR ALL TO authenticated
             USING (bucket_id = ''seed-backups'' AND public.has_role(auth.uid(), ''admin_master''::public.app_role))
             WITH CHECK (bucket_id = ''seed-backups'' AND public.has_role(auth.uid(), ''admin_master''::public.app_role))';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'seed-backups: %', SQLERRM; END $$;

-- Storage: support_attachments (SELECT só dono/admin)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual ILIKE '%support_attachments%' OR with_check ILIKE '%support_attachments%')
      AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname); END LOOP;

  EXECUTE 'CREATE POLICY "support_attachments_select_owner_or_admin"
             ON storage.objects FOR SELECT TO authenticated
             USING (
               bucket_id = ''support_attachments''
               AND (
                 (storage.foldername(name))[1] = auth.uid()::text
                 OR public.has_role(auth.uid(), ''admin_master''::public.app_role)
               )
             )';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'support_attachments: %', SQLERRM; END $$;

-- Marca o bucket support_attachments como privado se existir
UPDATE storage.buckets SET public=false WHERE id='support_attachments';

-- =====================================================================
-- RLS ativo em todas as tabelas public (defensivo)
-- =====================================================================
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname='public' LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- FIM
-- Após rodar:
--   • Re-rodar o security scan: warns devem cair drasticamente.
--   • Caso alguma RPC quebre no app, adicione o nome em whitelist_auth (bloco C)
--     e re-execute apenas esse bloco.
-- =====================================================================
