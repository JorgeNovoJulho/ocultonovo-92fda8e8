-- ============================================================================
-- FEED UNIVERSAL — posts públicos visíveis para todos + realtime estável
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente: pode rodar mais de uma vez.
--
-- Problema corrigido:
--   - Posts válidos de usuários reais (ex.: @lorena_villar) existiam na tabela
--     e na view, mas podiam sumir para usuários com filtros locais/perfil.
--   - Este SQL garante a base do banco: view completa, SELECT público seguro,
--     defaults, normalização de owner e publication realtime.
--   - O frontend agora não usa filtro de gênero no feed principal; o feed é
--     universal por recência/visibilidade.
-- ============================================================================

-- 1) Defaults defensivos: novos posts comuns entram como feed público visível.
ALTER TABLE public.posts
  ALTER COLUMN privacy_level SET DEFAULT 'public';

ALTER TABLE public.posts
  ALTER COLUMN is_hidden SET DEFAULT false;

ALTER TABLE public.posts
  ALTER COLUMN is_flash SET DEFAULT false;

ALTER TABLE public.posts
  ALTER COLUMN post_type SET DEFAULT 'feed';

-- 2) Normaliza owner no INSERT/UPDATE sem quebrar posts antigos.
CREATE OR REPLACE FUNCTION public.posts_auto_owner_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creator_id IS NULL THEN
    NEW.creator_id := auth.uid();
  END IF;

  IF NEW.author_id IS NULL AND NEW.creator_id IS NOT NULL THEN
    SELECT p.id
      INTO NEW.author_id
      FROM public.profiles p
     WHERE p.user_id = NEW.creator_id OR p.id = NEW.creator_id
     ORDER BY (p.user_id = NEW.creator_id) DESC, p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  NEW.privacy_level := COALESCE(NULLIF(NEW.privacy_level, ''), 'public');
  NEW.is_hidden := COALESCE(NEW.is_hidden, false);
  NEW.is_flash := COALESCE(NEW.is_flash, false);
  NEW.post_type := COALESCE(NULLIF(NEW.post_type, ''), CASE WHEN NEW.is_flash THEN 'story' ELSE 'feed' END);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_posts_auto_owner ON public.posts;
CREATE TRIGGER tr_posts_auto_owner
BEFORE INSERT OR UPDATE OF creator_id, author_id, privacy_level, is_hidden, is_flash, post_type
ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.posts_auto_owner_fields();

-- 3) View do feed com todas as colunas esperadas pelo app e sem filtro oculto.
--    A filtragem de stories/hidden continua no frontend e/ou nas queries.
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
  p.updated_at
FROM public.posts p;

GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

-- 4) RLS: leitura pública de posts não ocultos; autores/admins ainda veem próprios/ocultos.
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read posts via view" ON public.posts;
DROP POLICY IF EXISTS "Feed public read visible posts" ON public.posts;
CREATE POLICY "Feed public read visible posts"
ON public.posts
FOR SELECT
TO anon, authenticated
USING (COALESCE(is_hidden, false) = false);

DROP POLICY IF EXISTS "Users can read own posts" ON public.posts;
CREATE POLICY "Users can read own posts"
ON public.posts
FOR SELECT
TO authenticated
USING (
  creator_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = posts.author_id AND pr.user_id = auth.uid()
  )
);

-- 5) Realtime robusto para todos os clientes.
ALTER TABLE public.posts REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      CREATE PUBLICATION supabase_realtime;
      ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  END;
END$$;

-- 6) Cap mínimo do plano FREE para não derrubar posts recentes rápido demais.
UPDATE public.feed_settings
   SET max_posts = GREATEST(COALESCE(max_posts, 0), 100),
       is_enabled = true,
       updated_at = now()
 WHERE plan_type = 'free';

-- 7) Diagnóstico rápido: deve retornar os posts recentes da Lorena no topo.
-- SELECT id, author_id, media_type, is_hidden, is_flash, post_type, created_at
-- FROM public.v_feed_posts
-- WHERE author_id = '5c735615-6b12-4ff5-8063-77ad8a42565a'
--   AND COALESCE(is_hidden,false) = false
--   AND COALESCE(is_flash,false) = false
-- ORDER BY created_at DESC
-- LIMIT 10;

NOTIFY pgrst, 'reload schema';