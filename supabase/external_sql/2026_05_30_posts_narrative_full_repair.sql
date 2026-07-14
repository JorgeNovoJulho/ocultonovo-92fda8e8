-- ============================================================================
-- 2026-05-30 — REPARO COMPLETO: colunas narrativas em public.posts + view de feed
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- ----------------------------------------------------------------------------
-- Por quê: posts do Canal VIP (Diário, Histórias, Capítulos, Séries, Textos,
-- Bastidores) e posts pagos com estilização/blur de prévia estavam falhando
-- silentemente porque as colunas referenciadas pelo frontend nunca existiram
-- na tabela `public.posts`. Esta migração:
--  1) adiciona TODAS as colunas faltantes (author_id, creator_id, title, ...)
--  2) preenche author_id/creator_id a partir do user_id para posts antigos
--  3) cria/atualiza a CHECK constraint de section_type
--  4) recria a view v_feed_posts com as colunas narrativas
--  5) atualiza a policy SELECT para permitir teasers narrativos públicos
-- ============================================================================

-- 1) Colunas narrativas / VIP / estilização --------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_id         UUID,
  ADD COLUMN IF NOT EXISTS creator_id        UUID,
  ADD COLUMN IF NOT EXISTS title             TEXT,
  ADD COLUMN IF NOT EXISTS subtitle          TEXT,
  ADD COLUMN IF NOT EXISTS teaser            TEXT,
  ADD COLUMN IF NOT EXISTS section_type      TEXT,
  ADD COLUMN IF NOT EXISTS content_format    TEXT DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS narrative_status  TEXT DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS series_id         UUID,
  ADD COLUMN IF NOT EXISTS series_title      TEXT,
  ADD COLUMN IF NOT EXISTS chapter_number    INTEGER,
  ADD COLUMN IF NOT EXISTS read_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS style_meta        JSONB,
  ADD COLUMN IF NOT EXISTS preview_blur      INTEGER,
  ADD COLUMN IF NOT EXISTS preview_url       TEXT,
  ADD COLUMN IF NOT EXISTS media_bucket      TEXT,
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS legacy_public     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_promo          BOOLEAN DEFAULT false;

-- 2) Backfill: creator_id <- author_id quando ausente ----------------------
-- A tabela public.posts NÃO tem coluna user_id (FK ao auth.users vive em
-- author_id, que aponta para profiles.id). Por isso só copiamos author_id
-- para creator_id quando este estiver nulo. Em bases legadas que tenham a
-- coluna user_id, o bloco DO abaixo cobre o backfill via profiles.
UPDATE public.posts p
   SET creator_id = p.author_id
 WHERE p.creator_id IS NULL
   AND p.author_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'posts'
       AND column_name = 'user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.posts p
         SET author_id  = COALESCE(p.author_id, pr.id, p.user_id),
             creator_id = COALESCE(p.creator_id, pr.id, p.user_id)
        FROM public.profiles pr
       WHERE pr.user_id = p.user_id
         AND (p.author_id IS NULL OR p.creator_id IS NULL)
    $sql$;
  END IF;
END $$;

-- 3) CHECK constraint expandida para section_type (mídia + narrativas) -----
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_section_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_section_type_check
  CHECK (section_type IS NULL OR section_type IN (
    'short_video','long_video','photo','photo_pack','video_pack','events','promo',
    'story','chapter','series','diary','article','text_post'
  ));

-- 4) Índices úteis ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_author_id    ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_creator_id   ON public.posts(creator_id);
CREATE INDEX IF NOT EXISTS idx_posts_section_type ON public.posts(section_type);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON public.posts(created_at DESC);

-- 5) View v_feed_posts -----------------------------------------------------
DROP VIEW IF EXISTS public.v_feed_posts CASCADE;
CREATE VIEW public.v_feed_posts AS
SELECT
  p.id,
  p.author_id,
  p.creator_id,
  p.content_text,
  CASE
    WHEN NOT COALESCE(p.is_paid, false) THEN p.media_url
    WHEN p.creator_id = auth.uid() THEN p.media_url
    WHEN EXISTS (SELECT 1 FROM public.media_access ma
                 WHERE ma.post_id = p.id AND ma.user_id = auth.uid())
      THEN p.media_url
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid() AND ur.role = 'admin_master')
      THEN p.media_url
    ELSE NULL
  END AS media_url,
  p.media_type,
  p.thumbnail_url,
  p.preview_url,
  p.media_bucket,
  p.media_storage_path,
  p.legacy_public,
  p.video_duration_seconds,
  p.privacy_level,
  CASE
    WHEN COALESCE(p.is_paid, false)
      AND p.creator_id <> auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.media_access ma
                      WHERE ma.post_id = p.id AND ma.user_id = auth.uid())
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = auth.uid() AND ur.role = 'admin_master')
    THEN true
    ELSE p.is_locked
  END AS is_locked,
  p.is_paid,
  p.paid_price,
  p.is_flash,
  p.post_type,
  p.likes_count,
  p.dislikes_count,
  p.comments_count,
  COALESCE(p.saves_count, 0) AS saves_count,
  p.shares_count,
  p.created_at,
  p.updated_at,
  p.is_seed,
  COALESCE(p.is_hidden, false) AS is_hidden,
  p.hidden_reason,
  p.allow_sharing,
  p.share_link,
  p.media_urls,
  p.file_size_bytes,
  p.file_type,
  p.original_filename,
  p.video_master_url,
  p.video_preview_url,
  p.video_hls_url,
  p.video_processing_status,
  p.title,
  p.subtitle,
  p.teaser,
  p.section_type,
  p.content_format,
  p.series_id,
  p.series_title,
  p.chapter_number,
  p.read_time_minutes,
  p.narrative_status,
  p.scheduled_at,
  p.style_meta,
  p.preview_blur
FROM public.posts p;

ALTER VIEW public.v_feed_posts OWNER TO postgres;
GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

-- 6) RLS — teaser narrativo público ----------------------------------------
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public"
  ON public.posts FOR SELECT
  USING (
    (COALESCE(is_hidden,false)=false AND COALESCE(privacy_level,'public')='public')
    OR (COALESCE(is_hidden,false)=false AND (
         content_format = 'narrative'
         OR section_type IN ('story','chapter','diary','article','series','text_post')
       ))
    OR auth.uid() = creator_id
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.user_id = auth.uid()
                 AND (p.id = public.posts.author_id OR p.id = public.posts.creator_id))
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid()
                 AND ur.role IN ('admin_master','master_admin'))
  );

-- 7) Tabela auxiliar de séries (para Capítulos / Séries) -------------------
CREATE TABLE IF NOT EXISTS public.creator_content_series (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL,
  title       TEXT NOT NULL,
  cover_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.creator_content_series TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_content_series TO authenticated;
GRANT ALL ON public.creator_content_series TO service_role;
ALTER TABLE public.creator_content_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "series_select_all"   ON public.creator_content_series;
DROP POLICY IF EXISTS "series_insert_owner" ON public.creator_content_series;
DROP POLICY IF EXISTS "series_update_owner" ON public.creator_content_series;
DROP POLICY IF EXISTS "series_delete_owner" ON public.creator_content_series;
CREATE POLICY "series_select_all"   ON public.creator_content_series FOR SELECT USING (true);
CREATE POLICY "series_insert_owner" ON public.creator_content_series FOR INSERT WITH CHECK (
  auth.uid() = creator_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.id = creator_id)
);
CREATE POLICY "series_update_owner" ON public.creator_content_series FOR UPDATE USING (
  auth.uid() = creator_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.id = creator_id)
);
CREATE POLICY "series_delete_owner" ON public.creator_content_series FOR DELETE USING (
  auth.uid() = creator_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.id = creator_id)
);

-- 8) Realtime + recarga do schema cache ------------------------------------
ALTER TABLE public.posts REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
