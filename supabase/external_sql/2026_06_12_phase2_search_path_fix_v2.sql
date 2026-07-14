-- =====================================================================
-- FASE 2 v2 — search_path fix (pula extensões e funções sem ownership)
-- Projeto EXTERNO: rvybbrkzmboqbhcemqar
-- IDEMPOTENTE. Substitui 2026_06_12_phase2_security_audit_and_search_path_fix.sql
-- =====================================================================

DO $$
DECLARE
  r record;
  v_count int := 0;
  v_skipped int := 0;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.oid AS func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public',
        r.schema_name, r.func_name, r.args
      );
      v_count := v_count + 1;
    EXCEPTION WHEN insufficient_privilege THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'SKIP (no owner): %.%(%)', r.schema_name, r.func_name, r.args;
    END;
  END LOOP;
  RAISE NOTICE '=== Fixed: %  |  Skipped: % ===', v_count, v_skipped;
END $$;

SELECT
  n.nspname || '.' || p.proname AS funcao_pendente,
  pg_get_userbyid(p.proowner) AS owner,
  EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') AS pertence_extensao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.prosecdef=true
  AND (p.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
ORDER BY pertence_extensao DESC, p.proname;

NOTIFY pgrst, 'reload schema';
