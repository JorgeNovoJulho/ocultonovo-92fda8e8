-- =====================================================================
-- PAID MEDIA HARDENING — 2026-05-07
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Não destrutivo: preserva colunas user_id/author_id, bucket post-media público.
-- =====================================================================

-- 1) PADRONIZAÇÃO DE OWNERSHIP -----------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS creator_id      uuid,
  ADD COLUMN IF NOT EXISTS preview_url     text,
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_bucket    text DEFAULT 'post-media',
  ADD COLUMN IF NOT EXISTS legacy_public   boolean DEFAULT false;

-- Backfill creator_id (auth user id) a partir de profiles
UPDATE public.posts p
SET creator_id = sub.user_id
FROM (
  SELECT pr.user_id, pr.id AS profile_id
  FROM public.profiles pr
) sub
WHERE p.creator_id IS NULL
  AND p.author_id = sub.profile_id;

-- Marca posts pagos antigos como legacy (mídia ainda em bucket público)
UPDATE public.posts
SET legacy_public = true
WHERE is_paid = true
  AND legacy_public IS NOT TRUE
  AND (media_bucket = 'post-media' OR media_bucket IS NULL);

CREATE INDEX IF NOT EXISTS idx_posts_creator_id ON public.posts(creator_id);
CREATE INDEX IF NOT EXISTS idx_posts_is_paid    ON public.posts(is_paid) WHERE is_paid = true;

-- 2) BUCKETS PRIVADOS / PREVIEWS ---------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('vip-paid-media', 'vip-paid-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('paid-previews', 'paid-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies storage.objects — vip-paid-media (privado)
DROP POLICY IF EXISTS "vip_paid_media_owner_insert" ON storage.objects;
CREATE POLICY "vip_paid_media_owner_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vip-paid-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "vip_paid_media_owner_update" ON storage.objects;
CREATE POLICY "vip_paid_media_owner_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'vip-paid-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "vip_paid_media_owner_delete" ON storage.objects;
CREATE POLICY "vip_paid_media_owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'vip-paid-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Sem policy de SELECT pública. Acesso só via signed URL (service role).
DROP POLICY IF EXISTS "vip_paid_media_public_read" ON storage.objects;

-- Policies paid-previews (público read, dono escreve)
DROP POLICY IF EXISTS "paid_previews_public_read" ON storage.objects;
CREATE POLICY "paid_previews_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'paid-previews');

DROP POLICY IF EXISTS "paid_previews_owner_write" ON storage.objects;
CREATE POLICY "paid_previews_owner_write" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'paid-previews'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "paid_previews_owner_update" ON storage.objects;
CREATE POLICY "paid_previews_owner_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'paid-previews'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "paid_previews_owner_delete" ON storage.objects;
CREATE POLICY "paid_previews_owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'paid-previews'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3) RLS media_access (defensivo) --------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='media_access') THEN
    EXECUTE 'ALTER TABLE public.media_access ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media_access'
        AND column_name = 'post_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.media_access ADD COLUMN post_id uuid';
    END IF;

    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS media_access_user_post_uidx ON public.media_access(user_id, post_id)';

    EXECUTE 'DROP POLICY IF EXISTS "media_access_select_own" ON public.media_access';
    EXECUTE $POL$
      CREATE POLICY "media_access_select_own" ON public.media_access
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.posts p
          WHERE p.id = media_access.post_id
            AND p.creator_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin','admin_master')
        )
      )
    $POL$;
  END IF;
END $$;

-- 4) VIEW SEGURA v_feed_posts ------------------------------------------
-- Mascara media_url e media_storage_path quando is_paid=true e usuário não tem acesso.
-- SECURITY INVOKER para herdar RLS de posts.
DROP VIEW IF EXISTS public.v_feed_posts CASCADE;
CREATE VIEW public.v_feed_posts
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.author_id,
  p.creator_id,
  p.content_text,
  p.media_type,
  p.thumbnail_url,
  p.preview_url,
  p.media_bucket,
  p.video_duration_seconds,
  p.privacy_level,
  p.is_paid,
  p.paid_price,
  p.legacy_public,
  p.likes_count,
  p.dislikes_count,
  p.comments_count,
  p.is_flash,
  p.post_type,
  p.created_at,
  p.updated_at,
  -- media_url visível só se: gratuito, dono, comprador, admin, ou legacy_public
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
  -- flag conveniente
  CASE
    WHEN COALESCE(p.is_paid, false) = false THEN false
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
  END AS is_locked
FROM public.posts p;

GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

-- 5) RPC validação de acesso para signed URL (chamada pela edge function) -
CREATE OR REPLACE FUNCTION public.can_access_paid_media(p_post_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = p_post_id
      AND (
        COALESCE(p.is_paid, false) = false
        OR p.creator_id = p_user_id
        OR COALESCE(p.legacy_public, false) = true
        OR EXISTS (SELECT 1 FROM public.media_access ma
                   WHERE ma.post_id = p_post_id AND ma.user_id = p_user_id)
        OR EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = p_user_id AND ur.role IN ('admin','admin_master'))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_paid_media(uuid, uuid) TO authenticated;

-- 6) Trigger: garantir creator_id em novos posts -----------------------
CREATE OR REPLACE FUNCTION public.fn_posts_ensure_creator_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creator_id IS NULL THEN
    -- Tenta usar auth.uid() (usuário autenticado fazendo o insert)
    NEW.creator_id := auth.uid();
    -- Fallback: resolve via profiles
    IF NEW.creator_id IS NULL AND NEW.author_id IS NOT NULL THEN
      SELECT user_id INTO NEW.creator_id
      FROM public.profiles WHERE id = NEW.author_id LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_ensure_creator_id ON public.posts;
CREATE TRIGGER trg_posts_ensure_creator_id
BEFORE INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.fn_posts_ensure_creator_id();

-- =====================================================================
-- FIM. Validar com:
-- SELECT id, is_paid, creator_id, legacy_public, media_url IS NOT NULL AS has_url
-- FROM v_feed_posts LIMIT 5;
-- =====================================================================
