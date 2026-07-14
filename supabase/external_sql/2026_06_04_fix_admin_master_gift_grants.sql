-- =====================================================================
-- 2026-06-04 — Fix: permission denied for function admin_master_gift_single_xp
-- Reaplica GRANT EXECUTE para authenticated em todas as overloads das
-- RPCs de presente do admin master. Idempotente.
-- Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_master_gift_single_xp'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'admin_master_gift_online_xp',
         'aura_xp_gifts_mark_all_seen',
         'aura_xp_gifts_unseen_count'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
