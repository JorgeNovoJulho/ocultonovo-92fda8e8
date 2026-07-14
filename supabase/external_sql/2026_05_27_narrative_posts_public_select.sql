-- ==========================================================================
-- 2026_05_27_narrative_posts_public_select.sql
-- Torna posts narrativos (Diário VIP, capítulos, séries, histórias, artigos,
-- bastidores) visíveis no feed para TODOS os usuários autenticados — o teaser
-- e capa são públicos; o conteúdo completo continua gated no leitor (DiaryPaywall).
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- ==========================================================================

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Substitui a policy de SELECT para permitir também posts narrativos VIP/pagos
-- (apenas metadados — colunas sensíveis seguem protegidas pela view v_feed_posts).
DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public"
  ON public.posts
  FOR SELECT
  USING (
    -- Posts públicos não-ocultos
    (
      COALESCE(is_hidden, false) = false
      AND COALESCE(privacy_level, 'public') = 'public'
    )
    -- Posts narrativos (Diário VIP / capítulos / séries / etc.) — teaser público
    OR (
      COALESCE(is_hidden, false) = false
      AND (
        content_format = 'narrative'
        OR section_type IN ('story','chapter','diary','article','series','text_post')
      )
    )
    -- Dono direto (creator/author)
    OR auth.uid() = creator_id
    OR auth.uid() = author_id
    -- Dono via profile.id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (
          p.id = public.posts.author_id
          OR p.id = public.posts.creator_id
        )
    )
    -- Master admin enxerga tudo
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','master_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
