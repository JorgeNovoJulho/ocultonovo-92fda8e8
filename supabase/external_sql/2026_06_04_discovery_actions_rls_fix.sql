-- =============================================================================
-- HOTFIX — Permissões para "Aproximar" / "Ignorar" / "Match recíproco"
-- Projeto: Supabase EXTERNO (rvybbrkzmboqbhcemqar)
--
-- Sintomas:
--   • "A aproximação foi bloqueada pelas permissões do banco."
--   • "Não foi possível ignorar agora."
--
-- Causa raiz:
--   As RPCs discovery_approach_user / discovery_ignore_user são SECURITY DEFINER,
--   mas os INSERTs internos batem em RLS quando o owner da função NÃO tem
--   BYPASSRLS (caso de funções criadas por roles não-superuser no Supabase).
--   As tabelas `oculto_discovery_likes`, `oculto_discovery_ignores` e
--   `looking_now_matches` só possuíam policies de SELECT (e INSERT só p/
--   service_role), por isso o INSERT é rejeitado mesmo via RPC.
--
-- Correção:
--   1) Garante GRANTs Data-API nas três tabelas.
--   2) Cria policies de INSERT/UPDATE escopadas a auth.uid() → profile.id.
--   3) Reassina ownership das RPCs para `postgres` (que tem BYPASSRLS),
--      como segunda camada de defesa.
--   4) Reforça GRANT EXECUTE para `authenticated`.
--
-- Idempotente — pode rodar quantas vezes precisar.
-- =============================================================================

-- 0) GRANTs Data API ---------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_discovery_likes   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_discovery_ignores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.looking_now_matches      TO authenticated;
GRANT ALL ON public.oculto_discovery_likes   TO service_role;
GRANT ALL ON public.oculto_discovery_ignores TO service_role;
GRANT ALL ON public.looking_now_matches      TO service_role;

-- 1) Policies de escrita em oculto_discovery_likes ---------------------------
DROP POLICY IF EXISTS "owner inserts own likes" ON public.oculto_discovery_likes;
CREATE POLICY "owner inserts own likes"
  ON public.oculto_discovery_likes
  FOR INSERT TO authenticated
  WITH CHECK (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "owner updates own likes" ON public.oculto_discovery_likes;
CREATE POLICY "owner updates own likes"
  ON public.oculto_discovery_likes
  FOR UPDATE TO authenticated
  USING (
    user_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR target_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR target_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "owner deletes own likes" ON public.oculto_discovery_likes;
CREATE POLICY "owner deletes own likes"
  ON public.oculto_discovery_likes
  FOR DELETE TO authenticated
  USING (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- 2) Policies de escrita em oculto_discovery_ignores -------------------------
DROP POLICY IF EXISTS "owner inserts own ignores" ON public.oculto_discovery_ignores;
CREATE POLICY "owner inserts own ignores"
  ON public.oculto_discovery_ignores
  FOR INSERT TO authenticated
  WITH CHECK (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "owner updates own ignores" ON public.oculto_discovery_ignores;
CREATE POLICY "owner updates own ignores"
  ON public.oculto_discovery_ignores
  FOR UPDATE TO authenticated
  USING (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ))
  WITH CHECK (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "owner deletes own ignores" ON public.oculto_discovery_ignores;
CREATE POLICY "owner deletes own ignores"
  ON public.oculto_discovery_ignores
  FOR DELETE TO authenticated
  USING (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- 3) Policy de INSERT em looking_now_matches para participantes --------------
--    (necessário porque o match é criado dentro da RPC, e o owner pode não
--     ter BYPASSRLS; com esta policy o INSERT recíproco passa).
DROP POLICY IF EXISTS "participants insert matches" ON public.looking_now_matches;
CREATE POLICY "participants insert matches"
  ON public.looking_now_matches
  FOR INSERT TO authenticated
  WITH CHECK (
    user1_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR user2_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 4) Reassina ownership das RPCs para postgres (BYPASSRLS) -------------------
--    Segunda camada de defesa: mesmo que alguém crie policies restritivas
--    no futuro, a função SECURITY DEFINER continuará funcionando.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER FUNCTION public.discovery_approach_user(uuid) OWNER TO postgres';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    EXECUTE 'ALTER FUNCTION public.discovery_ignore_user(uuid, integer) OWNER TO postgres';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    EXECUTE 'ALTER FUNCTION public._discovery_my_profile_id() OWNER TO postgres';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    EXECUTE 'ALTER FUNCTION public.discovery_send_gift_autoreply(uuid, integer, text) OWNER TO postgres';
  EXCEPTION WHEN OTHERS THEN NULL; END;
END$$;

-- 5) Reforça GRANT EXECUTE ---------------------------------------------------
GRANT EXECUTE ON FUNCTION public.discovery_approach_user(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.discovery_ignore_user(uuid, integer)     TO authenticated;
GRANT EXECUTE ON FUNCTION public._discovery_my_profile_id()               TO authenticated;

DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.discovery_send_gift_autoreply(uuid, integer, text) TO authenticated';
  EXCEPTION WHEN OTHERS THEN NULL; END;
END$$;

NOTIFY pgrst, 'reload schema';
