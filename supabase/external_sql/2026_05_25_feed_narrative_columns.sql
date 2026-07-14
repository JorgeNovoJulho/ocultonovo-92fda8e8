-- =====================================================================
-- Feed VIP — Narrative columns na view v_feed_posts (idempotente)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- =====================================================================
-- Objetivo: permitir que o feed principal (RealFeed) detecte posts
-- narrativos publicados em Canais VIP e renderize card especial.
-- Reexpõe v_feed_posts adicionando: section_type, content_format,
-- teaser, subtitle, series_id, series_title, chapter_number, title.

-- Garante que as colunas narrativas existem em posts (idempotente).
-- Necessário caso 2026_05_24_canal_vip_narrative.sql não tenha sido aplicado
-- ou caso `title` ainda não exista na tabela posts.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS title              TEXT,
  ADD COLUMN IF NOT EXISTS subtitle           TEXT,
  ADD COLUMN IF NOT EXISTS teaser             TEXT,
  ADD COLUMN IF NOT EXISTS section_type       TEXT,
  ADD COLUMN IF NOT EXISTS content_format     TEXT DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS series_id          UUID,
  ADD COLUMN IF NOT EXISTS series_title       TEXT,
  ADD COLUMN IF NOT EXISTS chapter_number     INTEGER,
  ADD COLUMN IF NOT EXISTS read_time_minutes  INTEGER,
  ADD COLUMN IF NOT EXISTS narrative_status   TEXT DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS scheduled_at       TIMESTAMPTZ;

CREATE OR REPLACE VIEW public.v_feed_posts AS
SELECT
  id,
  author_id,
  creator_id,
  content_text,
  CASE
    WHEN NOT COALESCE(is_paid, false) THEN media_url
    WHEN creator_id = auth.uid() THEN media_url
    WHEN EXISTS (
      SELECT 1 FROM public.media_access ma
      WHERE ma.post_id = posts.id AND ma.user_id = auth.uid()
    ) THEN media_url
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin_master'
    ) THEN media_url
    ELSE NULL
  END AS media_url,
  media_type,
  thumbnail_url,
  preview_url,
  media_bucket,
  media_storage_path,
  legacy_public,
  video_duration_seconds,
  privacy_level,
  CASE
    WHEN COALESCE(is_paid, false) AND creator_id <> auth.uid()
         AND NOT EXISTS (
           SELECT 1 FROM public.media_access ma
           WHERE ma.post_id = posts.id AND ma.user_id = auth.uid()
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid() AND ur.role = 'admin_master'
         )
    THEN true
    ELSE is_locked
  END AS is_locked,
  is_paid,
  paid_price,
  is_flash,
  post_type,
  likes_count,
  dislikes_count,
  comments_count,
  saves_count,
  shares_count,
  created_at,
  updated_at,
  is_seed,
  is_hidden,
  hidden_reason,
  allow_sharing,
  share_link,
  media_urls,
  file_size_bytes,
  file_type,
  original_filename,
  video_master_url,
  video_preview_url,
  video_hls_url,
  video_processing_status,
  -- Narrative / VIP channel metadata (Onda Canal VIP — Conteúdo Narrativo)
  title,
  subtitle,
  teaser,
  section_type,
  content_format,
  series_id,
  series_title,
  chapter_number,
  read_time_minutes,
  narrative_status,
  scheduled_at
FROM public.posts;

ALTER VIEW public.v_feed_posts OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
