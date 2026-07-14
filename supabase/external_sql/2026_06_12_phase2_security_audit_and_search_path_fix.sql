-- =====================================================================
-- FASE 2 — SEGURANÇA (auditoria + remediação search_path)
-- Projeto EXTERNO: rvybbrkzmboqbhcemqar
-- IDEMPOTENTE — pode rodar várias vezes, não altera lógica.
--
-- O QUE FAZ:
--   A) AUDITORIA (3 SELECTs para você inspecionar):
--      A1) Funções SECURITY DEFINER em `public` SEM `SET search_path`
--      A2) Tabelas em `public` com RLS habilitado e <= 1 policy
--      A3) Tabelas em `public` SEM RLS habilitado
--
--   B) REMEDIAÇÃO AUTOMÁTICA:
--      DO block que executa `ALTER FUNCTION ... SET search_path = public`
--      em TODAS as funções SECURITY DEFINER do schema `public` que ainda
--      não tenham search_path configurado. Não altera o corpo, não altera
--      permissões, não recompila lógica — apenas anexa o GUC.
--
--   C) RELATÓRIO PÓS-FIX:
--      Re-executa A1 para confirmar que a lista ficou vazia.
--
-- COMO USAR:
--   1) Abra o SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
--   2) Cole TODO este arquivo e clique em RUN.
--   3) Revise os 3 relatórios de auditoria (A1/A2/A3) e o relatório C.
--   4) Tabelas listadas em A2/A3 NÃO são alteradas automaticamente —
--      me envie a lista para tratarmos caso a caso na próxima rodada.
-- =====================================================================

-- =====================================================================
-- A1) Funções SECURITY DEFINER sem search_path (ANTES da remediação)
-- =====================================================================
SELECT
  n.nspname || '.' || p.proname  AS funcao,
  pg_get_function_identity_arguments(p.oid) AS args,
  COALESCE(array_to_string(p.proconfig, ', '), '(sem config)') AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
    )
  )
ORDER BY p.proname;

-- =====================================================================
-- A2) Tabelas em public com RLS habilitado e <= 1 policy
-- =====================================================================
SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls_on,
  COALESCE(p.qtd_policies, 0) AS qtd_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT schemaname, tablename, COUNT(*) AS qtd_policies
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY schemaname, tablename
) p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND COALESCE(p.qtd_policies, 0) <= 1
ORDER BY qtd_policies, c.relname;

-- =====================================================================
-- A3) Tabelas em public SEM RLS habilitado (potencial exposição)
-- =====================================================================
SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls_on
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- =====================================================================
-- B) REMEDIAÇÃO AUTOMÁTICA — anexa SET search_path = public
--    em todas as SECURITY DEFINER que ainda não têm search_path.
-- =====================================================================
DO $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      r.schema_name, r.func_name, r.args
    );
    v_count := v_count + 1;
    RAISE NOTICE 'Fixed: %.%(%)', r.schema_name, r.func_name, r.args;
  END LOOP;

  RAISE NOTICE '=== Fase 2: % funções corrigidas ===', v_count;
END
$$;

-- =====================================================================
-- C) RELATÓRIO PÓS-FIX — deve vir vazio
-- =====================================================================
SELECT
  n.nspname || '.' || p.proname AS funcao_ainda_pendente
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
    )
  )
ORDER BY p.proname;
