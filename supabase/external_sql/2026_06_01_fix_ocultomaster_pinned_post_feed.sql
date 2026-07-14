-- ============================================================================
-- FIX: post fixado do @ocultomaster deve permanecer fixado no topo do feed
-- principal e do perfil, com colunas expostas na view pública v_feed_posts.
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- ============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_posts_is_pinned_true
  ON public.posts (author_id, is_pinned DESC, pinned_at DESC NULLS LAST, created_at DESC)
  WHERE is_pinned = true;

DROP VIEW IF EXISTS public.v_feed_posts CASCADE;
CREATE VIEW public.v_feed_posts AS
SELECT
  p.id,
  p.author_id,
  p.creator_id,
  p.is_pinned,
  p.pinned_at,
  p.content_text,
  CASE
    WHEN NOT COALESCE(p.is_paid, false) THEN p.media_url
    WHEN p.creator_id = auth.uid() THEN p.media_url
    WHEN EXISTS (
      SELECT 1
      FROM public.media_access ma
      WHERE ma.post_id = p.id
        AND ma.user_id = auth.uid()
    ) THEN p.media_url
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin_master'
    ) THEN p.media_url
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.media_access ma
        WHERE ma.post_id = p.id
          AND ma.user_id = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'admin_master'
      )
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

NOTIFY pgrst, 'reload schema';

-- Validação rápida:
-- SELECT id, is_pinned, pinned_at, created_at
-- FROM public.v_feed_posts
-- WHERE is_pinned = true
-- ORDER BY is_pinned DESC, pinned_at DESC NULLS LAST, created_at DESC
-- LIMIT 10;
