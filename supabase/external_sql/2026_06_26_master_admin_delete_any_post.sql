-- ============================================================================
-- Master Admin: permitir DELETE de QUALQUER post (inclusive de comunidades)
-- Executar no SQL Editor do Supabase EXTERNO. Idempotente.
-- ============================================================================

-- 1) Função SECURITY DEFINER que reconhece o master por:
--    a) role 'admin_master' em public.user_roles  (caminho oficial)
--    b) username/email canônicos do master (fallback à prova de balas)
CREATE OR REPLACE FUNCTION public.is_master_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _uid AND role = 'admin_master'
      ),
      false
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = _uid
        AND (
          regexp_replace(lower(coalesce(p.username, '')), '[^a-z0-9]', '', 'g') = 'ocultomaster'
        )
    )
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = _uid
        AND regexp_replace(lower(coalesce(u.email, '')), '[^a-z0-9@.]', '', 'g')
            IN ('ocultomaster@ocultoswing.com.br')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated, anon, service_role;

-- 2) Limpar policies de DELETE duplicadas em public.posts e recriar UMA só
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can only delete own posts" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_owner_or_master" ON public.posts;

CREATE POLICY "posts_delete_owner_or_master"
  ON public.posts
  FOR DELETE
  TO authenticated
  USING (
    -- Autor direto (alguns registros antigos podem usar auth.uid() em author_id)
    auth.uid() = author_id
    -- Autor via profiles.id (mapeamento correto: posts.author_id -> profiles.id)
    OR author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    -- Master admin: remove qualquer post sem restrição
    OR public.is_master_admin(auth.uid())
  );

-- 3) Garantir GRANT de DELETE para authenticated
GRANT DELETE ON public.posts TO authenticated;
