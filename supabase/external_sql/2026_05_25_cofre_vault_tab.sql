-- =====================================================================
-- COFRE — Acesso master à mídia com privacy_level = 'hidden'
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
--
-- Regras:
--   - O dono (auth.uid() = author_id) já vê suas mídias hidden (políticas
--     existentes). Esta migração apenas garante que o master admin
--     (ocultomaster@ocultoswing.com.br) também enxerga posts hidden de
--     QUALQUER usuário, sem alterar a visibilidade para os demais.
--   - Mantém todas as outras políticas intactas (drop+create somente da
--     política do master).
-- =====================================================================

-- 1) Garante helper de master admin (caso ambiente ainda não tenha) -----
CREATE OR REPLACE FUNCTION public.is_master_admin_email()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'ocultomaster@ocultoswing.com.br'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin_email() TO authenticated;

-- 2) Política exclusiva: master enxerga posts hidden de qualquer autor --
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posts_master_can_select_hidden ON public.posts;

CREATE POLICY posts_master_can_select_hidden
  ON public.posts
  FOR SELECT
  USING (
    privacy_level = 'hidden'
    AND public.is_master_admin_email()
  );

-- 3) RPC opcional: lista posts hidden de um perfil (somente master ou dono)
CREATE OR REPLACE FUNCTION public.list_vault_posts(p_profile_id uuid)
RETURNS SETOF public.posts
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND user_id = v_uid
  ) INTO v_is_owner;

  IF NOT v_is_owner AND NOT public.is_master_admin_email() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.posts p
  WHERE p.author_id = p_profile_id
    AND p.privacy_level = 'hidden'
  ORDER BY p.created_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_vault_posts(uuid) TO authenticated;
