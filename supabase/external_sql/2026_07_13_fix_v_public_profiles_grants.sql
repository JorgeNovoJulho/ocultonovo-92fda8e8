-- =====================================================================
-- FIX: v_public_profiles sem GRANT -> perfis, follows, stories vazios
-- Aplicar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente e seguro para rodar quantas vezes precisar.
-- =====================================================================

-- 1) Garante que a view roda com privilégios de quem chama (respeita RLS
--    das tabelas base) — evita vazamentos e alinha ao padrão do projeto.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'v_public_profiles' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_public_profiles SET (security_invoker = true)';
  END IF;
END $$;

-- 2) Concede leitura para anon e authenticated (a causa do 42501).
GRANT SELECT ON public.v_public_profiles TO anon, authenticated;
GRANT ALL    ON public.v_public_profiles TO service_role;

-- 3) Varre views públicas que também alimentam UI (perfis/posts/follows/
--    stories) e garante SELECT para os mesmos papéis. Idempotente.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('v','m')
       AND c.relname IN (
         'v_public_profiles',
         'v_secure_posts',
         'v_public_posts',
         'v_public_stories',
         'v_public_followers',
         'v_public_following',
         'vw_extrato_criador',
         'fan_rankings'
       )
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
    EXCEPTION WHEN others THEN NULL;
    END;
    EXECUTE format('GRANT SELECT ON %I.%I TO anon, authenticated', r.nspname, r.relname);
    EXECUTE format('GRANT ALL    ON %I.%I TO service_role',       r.nspname, r.relname);
  END LOOP;
END $$;

-- 4) Verificação rápida (opcional): deve listar SELECT para anon e authenticated
-- SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND table_name='v_public_profiles';
