-- ============================================================================
-- Corrige o feed principal no Supabase EXTERNO (v2 — sem referências a posts.user_id)
-- Motivo: public.posts NÃO possui coluna user_id no banco externo. As colunas
-- canônicas são author_id (profiles.id) e creator_id (auth.users.id).
-- A v1 quebrava com: ERROR 42703 column p.user_id does not exist.
--
-- Este script (idempotente):
-- 1) garante author_id / creator_id / is_pinned / pinned_at em posts
-- 2) sincroniza linhas legadas: author_id <-> creator_id via profiles
-- 3) recria a view v_feed_posts com security_invoker = true
-- 4) recria políticas SELECT/INSERT/UPDATE/DELETE usando author_id + creator_id
--
-- Cole inteiro no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Colunas canônicas
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_id  uuid,
  ADD COLUMN IF NOT EXISTS creator_id uuid,
  ADD COLUMN IF NOT EXISTS is_pinned  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at  timestamptz NULL;

-- 2) Sincronização defensiva (somente colunas que comprovadamente existem em posts)
-- 2a) author_id ausente mas creator_id presente -> deriva author_id via profiles.user_id = creator_id
UPDATE public.posts p
SET author_id = prof.id
FROM public.profiles prof
WHERE p.author_id IS NULL
  AND p.creator_id IS NOT NULL
  AND prof.user_id = p.creator_id;

-- 2b) creator_id ausente mas author_id presente -> deriva creator_id via profiles.id = author_id
UPDATE public.posts p
SET creator_id = prof.user_id
FROM public.profiles prof
WHERE p.creator_id IS NULL
  AND p.author_id IS NOT NULL
  AND prof.id = p.author_id;

-- 3) Índices de performance do feed
CREATE INDEX IF NOT EXISTS idx_posts_author_created_at_desc
  ON public.posts (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_creator_created_at_desc
  ON public.posts (creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_is_pinned_true
  ON public.posts (is_pinned DESC, pinned_at DESC NULLS LAST, created_at DESC)
  WHERE is_pinned = true;

-- 4) View do feed — projeta tudo, sem depender de posts.user_id
DROP VIEW IF EXISTS public.v_feed_posts CASCADE;

CREATE VIEW public.v_feed_posts
WITH (security_invoker = true) AS
SELECT p.*
FROM public.posts p;

GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

-- 5) RLS canônica em posts
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas / conflitantes
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='posts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts', pol.policyname);
  END LOOP;
END $$;

-- SELECT: público + amigos/VIP via subscriptions + dono canônico + master admin
CREATE POLICY "posts_select_canonical_feed"
  ON public.posts
  FOR SELECT
  TO anon, authenticated
  USING (
    -- público
    (
      COALESCE(is_hidden, false) = false
      AND COALESCE(privacy_level, 'public') = 'public'
      AND COALESCE(is_flash, false) = false
    )
    -- narrativos públicos (teaser/capa)
    OR (
      COALESCE(is_hidden, false) = false
      AND (
        content_format = 'narrative'
        OR section_type IN ('story','chapter','diary','article','series','text_post')
      )
    )
    -- amigos
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
          WHERE s.subscriber_id IN (SELECT me.id FROM public.profiles me WHERE me.user_id = auth.uid())
            AND s.creator_id = public.posts.author_id
            AND s.status = 'active'
        )
      )
    )
    -- vip
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
          WHERE s.subscriber_id IN (SELECT me.id FROM public.profiles me WHERE me.user_id = auth.uid())
            AND s.creator_id = public.posts.author_id
            AND s.status = 'active'
        )
      )
    )
    -- dono canônico vê tudo
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
    -- master admin
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','master_admin')
    )
  );

CREATE POLICY "posts_insert_canonical_owner"
  ON public.posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND creator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.user_id = auth.uid() AND me.id = public.posts.author_id
    )
  );

CREATE POLICY "posts_update_canonical_owner"
  ON public.posts
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles me
        WHERE me.user_id = auth.uid() AND me.id = public.posts.author_id
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles me
        WHERE me.user_id = auth.uid() AND me.id = public.posts.author_id
      )
    )
  );

CREATE POLICY "posts_delete_canonical_owner"
  ON public.posts
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles me
        WHERE me.user_id = auth.uid() AND me.id = public.posts.author_id
      )
    )
  );

NOTIFY pgrst, 'reload schema';

-- Verificações rápidas (opcional):
-- SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname='v_feed_posts';
-- SELECT id, author_id, creator_id, privacy_level, is_hidden, is_flash, created_at
-- FROM public.v_feed_posts ORDER BY created_at DESC LIMIT 20;
