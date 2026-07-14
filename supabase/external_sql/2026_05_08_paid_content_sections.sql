-- Paid content sections + watermark metadata for VIP channel uploads
-- Idempotent: safe to re-run in the external Supabase SQL Editor.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS section_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_section_type_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_section_type_check
      CHECK (section_type IS NULL OR section_type IN (
        'short_video','long_video','photo','photo_pack','video_pack'
      ));
  END IF;
END $$;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS watermark_meta jsonb;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS share_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS posts_share_slug_uidx
  ON public.posts (share_slug)
  WHERE share_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS posts_section_type_idx
  ON public.posts (author_id, section_type)
  WHERE section_type IS NOT NULL;
