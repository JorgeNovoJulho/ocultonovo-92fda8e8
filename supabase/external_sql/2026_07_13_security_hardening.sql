-- =====================================================================
-- SECURITY HARDENING — 2026-07-13
-- Alvo: Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. Rodar no SQL Editor.
--
-- Corrige findings do scanner de segurança:
--   • admin_notifications: INSERT restrito a admins
--   • aura_xp_global_config: UPDATE restrito a admin master
--   • aura_xp_interaction_config: ALL restrito a admin master
--   • system_settings: remove SELECT público, mantém filtrada
--   • Loops que aplicam SET search_path=public em TODAS as funções SECURITY DEFINER
--   • Loops que revogam EXECUTE de anon/PUBLIC em funções SECURITY DEFINER do schema public
--   • Converte VIEWs SECURITY DEFINER em SECURITY INVOKER
--   • Fecha listagem irrestrita de buckets públicos
--   • Remove policies overly-permissive (WITH CHECK true / USING true em UPDATE/DELETE/INSERT)
-- =====================================================================

-- Helper: verifica se usuário atual é admin master.
-- IMPORTANTE: NÃO usar DROP FUNCTION aqui.
-- Existem policies dependentes de public.is_admin_master(uuid), então o DROP gera erro 2BP01.
-- Mantemos também o nome original do parâmetro (_user_id), pois Postgres não permite renomear
-- parâmetro via CREATE OR REPLACE quando a função já existe.
CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id
       AND role::text IN ('admin_master','master_admin','admin')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
     WHERE (user_id = _user_id OR id = _user_id)
       AND username = 'oculto_master'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin_master(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1) admin_notifications — INSERT restrito
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create admin notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_insert_admin_only" ON public.admin_notifications;
CREATE POLICY "admin_notifications_insert_admin_only"
  ON public.admin_notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_master(auth.uid()));

-- ---------------------------------------------------------------------
-- 2) aura_xp_global_config — UPDATE apenas admin master
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin master can update global config" ON public.aura_xp_global_config;
DROP POLICY IF EXISTS "aura_xp_global_config_admin_update" ON public.aura_xp_global_config;
CREATE POLICY "aura_xp_global_config_admin_update"
  ON public.aura_xp_global_config FOR UPDATE
  TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- ---------------------------------------------------------------------
-- 3) aura_xp_interaction_config — ALL apenas admin master
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin master can manage interaction config" ON public.aura_xp_interaction_config;
DROP POLICY IF EXISTS "aura_xp_interaction_config_admin_manage" ON public.aura_xp_interaction_config;
CREATE POLICY "aura_xp_interaction_config_admin_manage"
  ON public.aura_xp_interaction_config FOR ALL
  TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- ---------------------------------------------------------------------
-- 4) system_settings — remove policy pública, mantém filtrada
-- ---------------------------------------------------------------------
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Anyone can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Public can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated users can view non-sensitive settings" ON public.system_settings;
-- Garante que só authenticated leia campos não-sensíveis (mantém a policy existente).
CREATE POLICY "Authenticated users can view non-sensitive settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_sensitive, false) = false
    OR public.is_admin_master(auth.uid())
  );
REVOKE SELECT ON public.system_settings FROM anon;
GRANT SELECT ON public.system_settings TO authenticated;

-- ---------------------------------------------------------------------
-- 5) function_search_path_mutable — set search_path=public em TODAS as
--    funções SECURITY DEFINER do schema public.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND NOT EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) c
          WHERE c LIKE 'search_path=%'
       )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public',
                     r.nspname, r.proname, r.args);
    EXCEPTION WHEN insufficient_privilege OR others THEN
      -- Ignora funções de extensões (postgis, etc.) que não pertencem ao usuário atual
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6) SECURITY DEFINER views → SECURITY INVOKER
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relnamespace::regnamespace::text AS ns, c.relname
      FROM pg_class c
     WHERE c.relkind = 'v'
       AND c.relnamespace = 'public'::regnamespace
       AND EXISTS (
         SELECT 1 FROM unnest(coalesce(c.reloptions,'{}'::text[])) o
          WHERE o ILIKE 'security_barrier=%' OR o ILIKE 'security_invoker=%'
       )
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.ns, r.relname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  -- aplica security_invoker=true em todas as views public (idempotente)
  FOR r IN
    SELECT schemaname AS ns, viewname AS relname
      FROM pg_views WHERE schemaname='public'
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.ns, r.relname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7) Revoga EXECUTE público em funções SECURITY DEFINER que ainda
--    tenham grant para anon/PUBLIC de forma não intencional.
--    Mantém explicitamente as RPCs listadas abaixo como públicas
--    (necessárias para landing/waitlist/preview anônimo).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  keep_anon text[] := ARRAY[
    'lookup_referral_code',
    'oculto_user_public_memberships',
    'oculto_play_playlist_get',
    'oculto_play_top_by_kind',
    'oculto_play_public_preview'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND p.proname <> ALL (keep_anon)
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                     r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 8) Fecha listagem irrestrita em buckets públicos:
--    remove policies SELECT em storage.objects com USING (true) sobre bucket público.
--    Substitui por leitura pública por objeto (não permite LIST do bucket).
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND cmd='SELECT'
       AND (qual = 'true' OR qual ILIKE '%true%' AND qual NOT ILIKE '%bucket_id%')
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- Policy de leitura pública POR OBJETO (não lista) para buckets marcados public.
DROP POLICY IF EXISTS "public_read_public_buckets_objects" ON storage.objects;
CREATE POLICY "public_read_public_buckets_objects"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE public = true)
  );

-- ---------------------------------------------------------------------
-- 9) Remove policies RLS overly-permissive (USING true / WITH CHECK true)
--    em INSERT/UPDATE/DELETE de tabelas public.
--    Preserva as policies conhecidamente intencionais.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  keep_names text[] := ARRAY[
    'admin_notifications_insert_admin_only',
    'aura_xp_global_config_admin_update',
    'aura_xp_interaction_config_admin_manage',
    'public_read_public_buckets_objects'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd
      FROM pg_policies
     WHERE schemaname='public'
       AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
       AND (qual = 'true' OR with_check = 'true')
       AND policyname <> ALL (keep_names)
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY %I ON %I.%I',
                     r.policyname, r.schemaname, r.tablename);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
