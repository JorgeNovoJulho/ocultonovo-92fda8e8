-- ============================================================================
-- 2026-06-16 — Card de Tópico de Comunidade no Feed Principal
--
-- O cliente passa a inserir, automaticamente ao publicar um tópico de
-- comunidade, um post em `public.posts` com:
--   - post_type = 'community_topic'
--   - content_text = '__COMMUNITY_TOPIC__\n{json snapshot}'
--
-- O `v_feed_posts` JÁ expõe `post_type` e `content_text`, então o card
-- aparece naturalmente no feed.
--
-- Esta migração apenas:
--   1) garante o índice para filtrar/excluir posts deste tipo rapidamente;
--   2) adiciona o tipo à publicação realtime (já coberto, mas idempotente);
--   3) recarrega o cache do PostgREST.
--
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- ============================================================================

-- 1) Índice para o feed filtrar por post_type com baixa latência
CREATE INDEX IF NOT EXISTS idx_posts_post_type_created
  ON public.posts (post_type, created_at DESC);

-- 2) Garante REPLICA IDENTITY FULL (necessário para o realtime entregar o card)
ALTER TABLE public.posts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  END IF;
END $$;

-- 3) Recarrega cache de schema
NOTIFY pgrst, 'reload schema';
