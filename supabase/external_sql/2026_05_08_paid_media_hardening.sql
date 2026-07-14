-- =============================================================================
-- 2026_05_08_paid_media_security_hardening.sql (v2 — defensive)
-- Fase A: Backend hardening — colunas, VIEW, buckets, policies, RPC
-- Idempotente: pode rodar múltiplas vezes sem erro
-- =============================================================================

-- ── 1. Adicionar colunas faltando em posts ──────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS creator_id uuid,
  ADD COLUMN IF NOT EXISTS author_id uuid,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_bucket text DEFAULT 'post-media',
  ADD COLUMN IF NOT EXISTS legacy_public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_seed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_reason text,
  ADD COLUMN IF NOT EXISTS allow_sharing boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS share_link text,
  ADD COLUMN IF NOT EXISTS media_urls text[],
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS video_master_url text,
  ADD COLUMN IF NOT EXISTS video_preview_url text,
  ADD COLUMN IF NOT EXISTS video_hls_url text,
  ADD COLUMN IF NOT EXISTS video_processing_status text,
  ADD COLUMN IF NOT EXISTS video_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS paid_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_flash boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS post_type text,
  ADD COLUMN IF NOT EXISTS likes_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislikes_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS privacy_level text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;

-- ── 2. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_posts_creator_id ON public.posts(creator_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_media_storage_path ON public.posts(media_storage_path);

-- ── 3. Backfill author_id / creator_id (defensivo: detecta se user_id existe) ─
DO $$
DECLARE
  has_user_id boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='user_id'
  ) INTO has_user_id;

  IF has_user_id THEN
    EXECUTE 'UPDATE public.posts SET author_id = user_id WHERE author_id IS NULL AND user_id IS NOT NULL';
    EXECUTE $sql$
      UPDATE public.posts
      SET creator_id = (
        SELECT p.user_id FROM public.profiles p WHERE p.id = posts.user_id LIMIT 1
      )
      WHERE creator_id IS NULL AND user_id IS NOT NULL
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE public.posts
      SET creator_id = (
        SELECT p.user_id FROM public.profiles p WHERE p.id = posts.author_id LIMIT 1
      )
      WHERE creator_id IS NULL AND author_id IS NOT NULL
    $sql$;
    RAISE NOTICE 'Coluna user_id ausente em posts — usando author_id como fallback.';
  END IF;
END $$;

-- ── 4. Marcar posts pagos antigos como legacy ───────────────────────────────
UPDATE public.posts
SET legacy_public = true
WHERE legacy_public = false
  AND is_paid = true
  AND media_url IS NOT NULL
  AND (media_storage_path IS NULL OR media_bucket = 'post-media');

-- ── 5. Criar buckets ────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vip-paid-media', 'vip-paid-media', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('paid-previews', 'paid-previews', true)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Storage policies (drop+create — Postgres não tem CREATE POLICY IF NOT EXISTS)
DROP POLICY IF EXISTS "Owner can upload to vip-paid-media" ON storage.objects;
CREATE POLICY "Owner can upload to vip-paid-media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vip-paid-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Owner can delete from vip-paid-media" ON storage.objects;
CREATE POLICY "Owner can delete from vip-paid-media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vip-paid-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Public can read paid-previews" ON storage.objects;
CREATE POLICY "Public can read paid-previews"
ON storage.objects FOR SELECT
USING (bucket_id = 'paid-previews');

DROP POLICY IF EXISTS "Owner can upload to paid-previews" ON storage.objects;
CREATE POLICY "Owner can upload to paid-previews"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'paid-previews'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ── 7. RPC: can_access_paid_media ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_paid_media(
  p_post_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts
    WHERE id = p_post_id
      AND (
        creator_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM public.media_access
          WHERE post_id = p_post_id AND user_id = p_user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = p_user_id AND role = 'admin_master'
        )
      )
  );
$$;

-- ── 8. VIEW segura: v_feed_posts ────────────────────────────────────────────
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
  video_processing_status
FROM public.posts;

ALTER VIEW public.v_feed_posts OWNER TO postgres;

-- ── 9. RLS em posts ─────────────────────────────────────────────────────────
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read posts via view" ON public.posts;
CREATE POLICY "Public can read posts via view"
ON public.posts FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Users can insert own posts" ON public.posts;
CREATE POLICY "Users can insert own posts"
ON public.posts FOR INSERT
TO authenticated
WITH CHECK (
  creator_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = public.posts.author_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
CREATE POLICY "Users can update own posts"
ON public.posts FOR UPDATE
TO authenticated
USING (
  creator_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = public.posts.author_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
CREATE POLICY "Users can delete own posts"
ON public.posts FOR DELETE
TO authenticated
USING (
  creator_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = public.posts.author_id AND user_id = auth.uid())
);

-- ── 10. Trigger: auto-popular author_id e creator_id no INSERT ──────────────
CREATE OR REPLACE FUNCTION public.posts_auto_owner_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creator_id IS NULL THEN
    NEW.creator_id := auth.uid();
  END IF;
  IF NEW.author_id IS NULL AND NEW.creator_id IS NOT NULL THEN
    SELECT id INTO NEW.author_id
    FROM public.profiles
    WHERE user_id = NEW.creator_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_posts_auto_owner ON public.posts;
CREATE TRIGGER tr_posts_auto_owner
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.posts_auto_owner_fields();

-- =============================================================================
-- FIM DO SQL
-- =============================================================================
