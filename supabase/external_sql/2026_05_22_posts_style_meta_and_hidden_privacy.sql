-- ============================================================
-- 2026_05_22: posts.style_meta (texto rico simples) + privacy 'hidden'
-- Idempotente · Supabase Externo
-- ============================================================

-- 1) Relaxa o CHECK do privacy_level para incluir 'hidden'
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_privacy_level_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_privacy_level_check
  CHECK (privacy_level = ANY (ARRAY['public','friends','vip','hidden']::text[]));

-- 2) Adiciona style_meta para posts somente-texto (fonte, tamanho, negrito, cor de fundo)
--    Estrutura JSON: { font_family: text, font_size: int, bold: bool, bg_color: text, text_color?: text }
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS style_meta jsonb;

COMMENT ON COLUMN public.posts.style_meta IS
  'Estilo opcional para posts somente-texto: font_family, font_size, bold, bg_color, text_color.';

NOTIFY pgrst, 'reload schema';
