-- ============================================================
-- Posts ↔ Oculto Play — permite que um post do feed principal
-- aponte para um item do OCULTO PLAY (compartilhamento embutido
-- com capa + player de prévia + CTA para ouvir completa).
--
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

-- 1) Coluna em posts ---------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS oculto_play_item_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'oculto_play_items'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'posts_oculto_play_item_id_fkey'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_oculto_play_item_id_fkey
      FOREIGN KEY (oculto_play_item_id)
      REFERENCES public.oculto_play_items(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS posts_oculto_play_item_id_idx
  ON public.posts (oculto_play_item_id)
  WHERE oculto_play_item_id IS NOT NULL;

-- 2) View v_feed_posts — recria adicionando oculto_play_item_id --------
DROP VIEW IF EXISTS public.v_feed_posts CASCADE;
CREATE VIEW public.v_feed_posts
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.author_id,
  p.creator_id,
  p.is_pinned,
  p.pinned_at,
  p.content_text,
  CASE
    WHEN COALESCE(p.is_paid, false) = false THEN p.media_url
    WHEN auth.uid() IS NOT NULL AND p.creator_id = auth.uid() THEN p.media_url
    WHEN COALESCE(p.legacy_public, false) = true THEN p.media_url
    WHEN auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.media_access ma
      WHERE ma.post_id = p.id AND ma.user_id = auth.uid()
    ) THEN p.media_url
    WHEN auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','admin_master')
    ) THEN p.media_url
    ELSE NULL
  END AS media_url,
  p.media_urls,
  p.media_type,
  p.thumbnail_url,
  p.preview_url,
  p.media_bucket,
  p.media_storage_path,
  p.legacy_public,
  p.video_duration_seconds,
  p.video_master_url,
  p.video_preview_url,
  p.video_hls_url,
  p.video_processing_status,
  p.privacy_level,
  CASE
    WHEN COALESCE(p.is_paid, false) = false THEN COALESCE(p.is_locked, false)
    WHEN auth.uid() IS NOT NULL AND p.creator_id = auth.uid() THEN false
    WHEN COALESCE(p.legacy_public, false) = true THEN false
    WHEN auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.media_access ma
      WHERE ma.post_id = p.id AND ma.user_id = auth.uid()
    ) THEN false
    WHEN auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','admin_master')
    ) THEN false
    ELSE true
  END AS is_locked,
  p.is_paid,
  p.paid_price,
  p.is_hidden,
  p.hidden_reason,
  p.preview_blur,
  p.likes_count,
  p.dislikes_count,
  p.comments_count,
  p.saves_count,
  p.shares_count,
  p.is_flash,
  p.post_type,
  p.is_seed,
  p.allow_sharing,
  p.share_link,
  p.file_size_bytes,
  p.file_type,
  p.original_filename,
  p.title,
  p.subtitle,
  p.teaser,
  p.section_type,
  p.content_format,
  p.series_id,
  p.series_title,
  p.chapter_number,
  p.read_time_minutes,
  p.created_at,
  p.updated_at,
  p.oculto_play_item_id
FROM public.posts p;

GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
