-- =============================================================
-- Corrige visibilidade pública dos stories no banco EXTERNO
-- Motivo: policy atual de posts bloqueia COALESCE(is_flash,false)=true,
-- então a barra de stories não consegue listar stories de outros usuários.
-- Idempotente e seguro para copiar/colar no SQL Editor.
-- =============================================================

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'posts'
      AND policyname = 'posts_select_canonical_feed'
  ) THEN
    DROP POLICY "posts_select_canonical_feed" ON public.posts;
  END IF;
END $$;

CREATE POLICY "posts_select_canonical_feed"
  ON public.posts
  FOR SELECT
  TO anon, authenticated
  USING (
    (
      COALESCE(is_hidden, false) = false
      AND COALESCE(privacy_level, 'public') = 'public'
      AND (
        COALESCE(is_flash, false) = false
        OR post_type = 'story'
        OR COALESCE(is_flash, false) = true
      )
    )
    OR (
      COALESCE(is_hidden, false) = false
      AND (
        content_format = 'narrative'
        OR section_type IN ('story','chapter','diary','article','series','text_post')
      )
    )
    OR (
      COALESCE(is_hidden, false) = false
      AND COALESCE(privacy_level, 'public') = 'friends'
      AND auth.uid() IS NOT NULL
      AND (
        auth.uid() = creator_id
        OR EXISTS (
          SELECT 1 FROM public.profiles me
          WHERE me.user_id = auth.uid() AND me.id = public.posts.author_id
        )
        OR EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.subscriber_id IN (
            SELECT me.id FROM public.profiles me WHERE me.user_id = auth.uid()
          )
          AND s.creator_id = public.posts.author_id
          AND s.status = 'active'
        )
      )
    )
    OR (
      COALESCE(is_hidden, false) = false
      AND COALESCE(privacy_level, 'public') = 'vip'
      AND auth.uid() IS NOT NULL
      AND (
        auth.uid() = creator_id
        OR EXISTS (
          SELECT 1 FROM public.profiles me
          WHERE me.user_id = auth.uid() AND me.id = public.posts.author_id
        )
        OR EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.subscriber_id IN (
            SELECT me.id FROM public.profiles me WHERE me.user_id = auth.uid()
          )
          AND s.creator_id = public.posts.author_id
          AND s.status = 'active'
        )
      )
    )
    OR (
      auth.uid() IS NOT NULL
      AND (
        auth.uid() = creator_id
        OR EXISTS (
          SELECT 1 FROM public.profiles me
          WHERE me.user_id = auth.uid() AND me.id = public.posts.author_id
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','master_admin')
    )
  );

NOTIFY pgrst, 'reload schema';