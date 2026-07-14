-- ============================================================================
-- Fixar postagens no topo do perfil (somente @ocultomaster - controle no front)
-- Idempotente: pode rodar várias vezes sem erro.
-- ----------------------------------------------------------------------------
-- 1) Garante colunas (já usadas em CreatorChannelPage). Se já existirem, ok.
-- 2) Índice parcial para acelerar ordenação "pinned first" no perfil.
-- ============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL;

-- Índice parcial: só indexa postagens fixadas (geralmente 0–poucas linhas).
CREATE INDEX IF NOT EXISTS idx_posts_is_pinned_true
  ON public.posts (author_id, pinned_at DESC NULLS LAST)
  WHERE is_pinned = true;
