
-- ============================================================
-- 1. CORRIGIR RLS DA TABELA FOLLOWS
-- Remover políticas duplicadas/conflitantes e criar as corretas
-- O follower_id é um profile.id (não auth.uid())
-- ============================================================

-- Remover todas as políticas existentes na tabela follows
DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
DROP POLICY IF EXISTS "Usuários podem seguir" ON public.follows;
DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
DROP POLICY IF EXISTS "Usuários podem deixar de seguir" ON public.follows;
DROP POLICY IF EXISTS "Anyone can view follows" ON public.follows;
DROP POLICY IF EXISTS "Leitura pública de follows" ON public.follows;
DROP POLICY IF EXISTS "Users can view follows" ON public.follows;

-- Garantir que RLS está habilitado
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer autenticado pode ver follows (necessário para contagens, verificações)
CREATE POLICY "follows_select_authenticated"
ON public.follows FOR SELECT
TO authenticated
USING (true);

-- INSERT: usuário autenticado pode inserir apenas se follower_id for o seu profile
CREATE POLICY "follows_insert_own"
ON public.follows FOR INSERT
TO authenticated
WITH CHECK (
  follower_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- DELETE: usuário pode deletar apenas seus próprios follows
CREATE POLICY "follows_delete_own"
ON public.follows FOR DELETE
TO authenticated
USING (
  follower_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);
