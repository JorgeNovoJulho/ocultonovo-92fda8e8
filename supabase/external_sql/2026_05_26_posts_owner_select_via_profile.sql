-- ============================================================================
-- 2026_05_26 — Corrige visibilidade do dono em public.posts (v2)
--
-- Problema: policy "posts_select_public" só liberava o autor quando
-- auth.uid() = creator_id OR auth.uid() = author_id. Mas posts.author_id
-- guarda profiles.id (NÃO auth.uid). Resultado: dono enxergava apenas
-- privacy_level='public'. Cards VIP/Amigos/Invisível em /my-media vazios.
--
-- v2: removida a coluna user_id (não existe em posts).
--
-- Idempotente.
-- ============================================================================

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_public" ON public.posts;

CREATE POLICY "posts_select_public"
  ON public.posts
  FOR SELECT
  USING (
    (
      coalesce(is_hidden, false) = false
      AND coalesce(privacy_level, 'public') = 'public'
    )
    OR auth.uid() = creator_id
    OR auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND (
              p.id = public.posts.author_id
           OR p.id = public.posts.creator_id
         )
    )
  );

NOTIFY pgrst, 'reload schema';
