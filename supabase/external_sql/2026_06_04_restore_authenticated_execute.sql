-- =====================================================================
-- 2026-06-04 — RESTORE EXECUTE TO authenticated
-- =====================================================================
-- O SQL `2026_06_04_security_hardening_v3.sql` revogou EXECUTE de TODAS
-- as funções SECURITY DEFINER do schema public para o role `authenticated`
-- (mantendo apenas uma whitelist curta). Isso quebrou:
--   • admin_master_gift_single_xp  → "permission denied"
--   • dezenas de RPCs usadas pelo feed/RealFeed (useFeatureAccess,
--     useEnsureWelcomeMessage, aura_*, social_beta_*, etc.) — cada uma
--     entra em retry e contribui para LCP de 29s+ e /feed de 76s.
--
-- Esta migration:
--   1) Restaura GRANT EXECUTE ... TO authenticated para TODAS as funções
--      do schema public (independente de SECURITY DEFINER ou INVOKER).
--   2) NÃO restaura grants para `anon` — o endurecimento contra usuários
--      anônimos permanece (o ganho de segurança real do v3).
--   3) Mantém ALTER DEFAULT PRIVILEGES para novas funções futuras.
--
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname  AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'  -- só functions (exclui agregados/window)
  LOOP
    BEGIN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
        r.schema_name, r.func_name, r.args
      );
    EXCEPTION WHEN OTHERS THEN
      -- Não interrompe o loop por causa de 1 função problemática
      RAISE NOTICE 'Falhou GRANT em %.%(%) — %', r.schema_name, r.func_name, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- Defaults para funções criadas no futuro (continuam com EXECUTE p/ authenticated)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- Garantia explícita das RPCs críticas (defesa em profundidade)
DO $$
DECLARE
  fn_signature text;
  critical_fns text[] := ARRAY[
    'admin_master_gift_single_xp(uuid, integer)',
    'check_and_increment_usage(text)',
    'ensure_welcome_message_for_me()',
    'is_following_v(uuid)',
    'toggle_follow_v(uuid)',
    'aura_send_attention(uuid, text)',
    'send_gift(uuid, integer, text)',
    'social_score_get(uuid)',
    'social_prestige_get(uuid)',
    'social_identity_get(uuid)'
  ];
BEGIN
  FOREACH fn_signature IN ARRAY critical_fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn_signature);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'GRANT crítico falhou em %: %', fn_signature, SQLERRM;
    END;
  END LOOP;
END $$;

-- Recarrega o schema do PostgREST para o cliente reconhecer as permissões
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- VERIFICAÇÃO (opcional — rodar separadamente)
-- =====================================================================
-- SELECT n.nspname, p.proname,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('admin_master_gift_single_xp','check_and_increment_usage');
