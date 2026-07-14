-- ==========================================================================
-- 2026_05_27_misterios_destaque_v_feed_posts_fix.sql
-- Corrige a origem de dados da seção "Mistérios em Destaque"
-- Uso: cole no SQL Editor do Supabase EXTERNO
-- ======================================================================

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
  p.scheduled_at
FROM public.posts p;

ALTER VIEW public.v_feed_posts OWNER TO postgres;
GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public"
  ON public.posts
  FOR SELECT
  USING (
    (
      COALESCE(is_hidden, false) = false
      AND COALESCE(privacy_level, 'public') = 'public'
    )
    OR auth.uid() = creator_id
    OR auth.uid() = author_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (
          p.id = public.posts.author_id
          OR p.id = public.posts.creator_id
        )
    )
  );

NOTIFY pgrst, 'reload schema';
