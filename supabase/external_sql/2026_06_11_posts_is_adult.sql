-- ============================================================
-- 2026-06-11 — Marca +18 por post (autor define)
-- Default TRUE: todo novo post é considerado adulto até o autor desmarcar.
-- O feed aplica um blur padrão nas mídias (foto/vídeo) quando is_adult=true.
-- Enquetes (post_type='poll') NUNCA recebem o blur padrão.
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_adult boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.posts.is_adult IS
  'Quando TRUE, o feed aplica blur padrão nas mídias do post (foto/vídeo). Enquetes ignoram.';

-- Atualiza a view do feed para expor a coluna (se existir).
-- Se a sua v_feed_posts já é "select *" da tabela posts, basta recarregar o schema.
NOTIFY pgrst, 'reload schema';
