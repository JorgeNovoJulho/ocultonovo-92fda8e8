-- =============================================================
-- Adiciona colunas opcionais ao public.posts para reativar:
--  • style_meta   → estilização de texto (fonte/fundo/cor/negrito) no feed
--  • preview_blur → intensidade de blur de prévia PPV
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Após rodar, reativar as colunas em src/hooks/usePosts.tsx POST_COLUMNS.
-- =============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS style_meta jsonb;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS preview_blur integer;

COMMENT ON COLUMN public.posts.style_meta IS
  'Metadados de estilização para posts somente-texto: { font_family, font_size, bold, bg_color, text_color }.';
COMMENT ON COLUMN public.posts.preview_blur IS
  'Intensidade do blur (px) aplicada à prévia de conteúdo pago (PPV).';
