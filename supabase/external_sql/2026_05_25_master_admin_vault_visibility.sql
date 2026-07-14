-- =====================================================================
-- Master Admin (@ocultomaster) — visibilidade total do Cofre (privacy_level='hidden')
-- Idempotente: pode ser executado várias vezes sem efeito colateral.
-- =====================================================================

-- Remove versão anterior (se existir) para garantir definição mais recente
DROP POLICY IF EXISTS "Master admin can view all posts" ON public.posts;

-- Master admin enxerga TODOS os posts (incluindo privacy_level='hidden' — Cofre).
-- Demais usuários permanecem regidos pelas policies existentes.
CREATE POLICY "Master admin can view all posts"
  ON public.posts
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin_master'));
