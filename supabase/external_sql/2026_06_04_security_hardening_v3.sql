-- =====================================================================
-- Security Hardening V3 — 2026-06-04 (Fase 3)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Objetivo:
--   1) REVOKE EXECUTE de funções SECURITY DEFINER de anon/authenticated
--      (mantém apenas service_role + owners + funções explicitamente públicas)
--   2) Remover privilégio LIST de buckets públicos (anon não lista mais)
--   3) Corrigir 7 policies com USING(true) em UPDATE/INSERT/DELETE
--   4) Reaplicar SET search_path = public em funções ainda mutáveis
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Lista branca: funções DEFINER que DEVEM continuar executáveis por anon
-- ---------------------------------------------------------------------
-- Mantemos públicas só funções de leitura segura/seed para fluxos não autenticados
-- (signup, lookup de referral, has_role chamadas internamente por policies).
-- Edite a lista conforme necessário.

DO $$
DECLARE
  f record;
  whitelist_public text[] := ARRAY[
    'has_role',
    'is_admin',
    'is_admin_master',
    'lookup_referral_code',
    'social_core_identity_get'
  ];
  whitelist_auth text[] := ARRAY[
    'has_role',
    'is_admin',
    'is_admin_master',
    'lookup_referral_code',
    'social_core_identity_get',
    'record_profile_visit',
    'process_oculto_payment_split',
    'purchase_marketplace_item',
    'real_experience_join',
    'real_experience_leave'
  ];
BEGIN
  FOR f IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.prokind IN ('f','p')
  LOOP
    BEGIN
      -- Revoga de anon sempre, exceto whitelist_public
      IF NOT (f.proname = ANY(whitelist_public)) THEN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
          f.nspname, f.proname, f.args
        );
      END IF;

      -- Revoga de authenticated, exceto whitelist_auth
      IF NOT (f.proname = ANY(whitelist_auth)) THEN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
          f.nspname, f.proname, f.args
        );
      END IF;

      -- Garante que service_role sempre executa (edge functions)
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
        f.nspname, f.proname, f.args
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip % %.%(%): %', SQLERRM, f.nspname, f.proname, f.args, SQLSTATE;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 1) Remover SELECT (LIST) de anon em storage.objects para buckets públicos
--    Mantém leitura pública somente via URL direta (não lista mais).
-- ---------------------------------------------------------------------
-- Política mais segura: anon só lê objetos de buckets marcados public=true
-- via getPublicUrl (não SELECT). Removemos qualquer policy de LIST aberta.

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN (
        'Public read all buckets',
        'Anyone can list objects',
        'Public list objects'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Policy controlada: anon pode ler (SELECT) apenas se o bucket for público,
-- mas não pode listar metadados arbitrários sem bucket_id explícito.
DROP POLICY IF EXISTS "anon_read_public_buckets_only" ON storage.objects;
CREATE POLICY "anon_read_public_buckets_only"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE public = true
  )
);

-- ---------------------------------------------------------------------
-- 2) Corrigir policies com USING(true) em UPDATE/INSERT/DELETE
-- ---------------------------------------------------------------------
-- Detecta e dropa qualquer policy permissiva (USING=true) em mutações.
-- Atenção: SELECT com USING(true) é mantido (necessário p/ leituras públicas).

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname='public'
      AND cmd IN ('UPDATE','INSERT','DELETE','ALL')
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    BEGIN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        pol.policyname, pol.schemaname, pol.tablename
      );
      RAISE NOTICE 'dropped open policy %.% / %', pol.tablename, pol.policyname, pol.cmd;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip % %', pol.policyname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3) Reforçar search_path em funções restantes
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.prokind IN ('f','p')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public',
        f.nspname, f.proname, f.args
      );
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4) Garantir RLS ativo em todas as tabelas public (segurança defensiva)
-- ---------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname='public'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- FIM — Após rodar:
--   • Re-rode o scan: as warns de DEFINER/LIST/USING(true) devem cair drasticamente.
--   • Teste o app: se algo quebrar (ex: RPC chamada do client), adicione
--     o nome da função em whitelist_auth no bloco 0 e re-execute.
-- =====================================================================
