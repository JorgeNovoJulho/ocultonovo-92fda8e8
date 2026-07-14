-- 2026_06_15 — Corrige preview social /c e força recache v=2 em links existentes
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).

-- 1) Colunas usadas pelo preview social persistente.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS link_preview_image_url text;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS share_slug text;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS share_link text;

COMMENT ON COLUMN public.posts.link_preview_image_url IS
  'Thumbnail/capa resolvida no momento do post para previews sociais de /c/:id.';

-- Índices seguros/idempotentes.
CREATE INDEX IF NOT EXISTS posts_link_preview_image_url_partial
  ON public.posts ((link_preview_image_url IS NOT NULL))
  WHERE link_preview_image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS posts_share_slug_idx
  ON public.posts (share_slug)
  WHERE share_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS posts_share_link_idx
  ON public.posts (share_link)
  WHERE share_link IS NOT NULL;

-- 2) Preenche share_slug dos posts antigos para a página /c apontar sempre para o post.
UPDATE public.posts
SET share_slug = id::text,
    updated_at = now()
WHERE share_slug IS NULL;

-- 3) Atualiza TODOS os links de compartilhamento /c existentes para ?v=2,
-- sem duplicar querystring e preservando posts que ainda não tinham share_link.
UPDATE public.posts
SET share_link = 'https://ocultoswing.com.br/c/' || COALESCE(NULLIF(share_slug, ''), id::text) || '?v=2',
    updated_at = now()
WHERE share_link IS NULL
   OR share_link ~ '^https?://(www\.)?ocultoswing\.com\.br/c/'
   OR share_link ~ '^/c/';

-- 4) Backfill rápido de capa para posts antigos que já têm mídia própria.
UPDATE public.posts
SET link_preview_image_url = COALESCE(thumbnail_url, media_url),
    updated_at = now()
WHERE link_preview_image_url IS NULL
  AND (
    media_type = 'image'
    OR thumbnail_url IS NOT NULL
  )
  AND COALESCE(thumbnail_url, media_url) IS NOT NULL;

-- 5) Relatório do que ainda depende de resolução externa/novo post para capa.
SELECT
  COUNT(*) FILTER (WHERE share_link LIKE '%/c/%?v=2') AS links_com_v2,
  COUNT(*) FILTER (WHERE link_preview_image_url IS NOT NULL) AS posts_com_capa_social,
  COUNT(*) FILTER (
    WHERE link_preview_image_url IS NULL
      AND content_text ~* '^\s*https?://'
      AND media_url IS NULL
  ) AS links_antigos_sem_capa_persistida
FROM public.posts;
