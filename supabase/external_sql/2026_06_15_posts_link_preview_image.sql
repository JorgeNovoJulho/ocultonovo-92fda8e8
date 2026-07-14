-- =====================================================================
-- 2026_06_15 — Capa persistida para previews sociais de links externos
-- =====================================================================
-- Quando o usuário publica um post que é APENAS um link (ex.: x.com,
-- youtube, tiktok), o modal "Revelar algo novo" já mostra a thumbnail
-- resolvida via microlink/noembed/fxtwitter. Antes essa imagem só
-- existia em runtime — quando o crawler do WhatsApp/Telegram vinha
-- buscar a og:image, a API externa podia estar fora do ar, lenta ou
-- bloqueada → preview "sem imagem".
--
-- Agora persistimos a imagem no banco no momento da criação do post.
-- O endpoint /c/og-image/:id usa esse valor instantaneamente (zero
-- dependência de APIs externas no caminho do crawler).
-- =====================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS link_preview_image_url TEXT;

COMMENT ON COLUMN public.posts.link_preview_image_url IS
  'Thumbnail resolvida no client (microlink/noembed/fxtwitter/YouTube) quando o post é apenas um link externo. Usada como og:image em /c/:id sem precisar refazer lookup em runtime.';

-- Index leve só para queries administrativas — opcional, idempotente.
CREATE INDEX IF NOT EXISTS posts_link_preview_image_url_partial
  ON public.posts ((link_preview_image_url IS NOT NULL))
  WHERE link_preview_image_url IS NOT NULL;
