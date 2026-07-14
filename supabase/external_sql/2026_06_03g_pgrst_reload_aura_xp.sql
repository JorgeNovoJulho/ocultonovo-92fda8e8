-- ============================================================
-- Hotfix: PostgREST schema cache stale para aura_xp_admin_features_list
-- Externo: rvybbrkzmboqbhcemqar.supabase.co — rodar no SQL Editor
-- ============================================================

-- 1) Garante EXECUTE (idempotente)
GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_upsert(text, integer, boolean, text, text) TO authenticated, service_role;

-- 2) Força reload do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
