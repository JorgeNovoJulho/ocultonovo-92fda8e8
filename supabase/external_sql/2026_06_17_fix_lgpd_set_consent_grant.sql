-- =====================================================================
-- FIX LGPD: Permission denied for function lgpd_set_consent
-- Data: 2026-06-17
-- Causa: GRANT EXECUTE não aplicado para anon/authenticated em todas as
--        sobrecargas (overloads) das funções lgpd_set_consent /
--        lgpd_get_my_consents / lgpd_current_policy_versions.
-- Solução: percorrer TODAS as assinaturas existentes dessas funções e
--          aplicar GRANT EXECUTE explicitamente.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'lgpd_set_consent',
        'lgpd_get_my_consents',
        'lgpd_current_policy_versions'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC;',
      r.schema_name, r.func_name, r.args
    );

    IF r.func_name = 'lgpd_get_my_consents' THEN
      -- Apenas authenticated (precisa de auth.uid())
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated;',
        r.schema_name, r.func_name, r.args
      );
    ELSE
      -- set_consent e current_policy_versions liberam anon também
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO anon, authenticated;',
        r.schema_name, r.func_name, r.args
      );
    END IF;
  END LOOP;
END $$;

-- Validação rápida (deve listar EXECUTE para anon/authenticated):
-- SELECT p.proname,
--        pg_get_function_identity_arguments(p.oid) AS args,
--        r.rolname AS grantee,
--        has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('lgpd_set_consent','lgpd_get_my_consents','lgpd_current_policy_versions');
