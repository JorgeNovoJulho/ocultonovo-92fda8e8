-- =====================================================================
-- Feed Principal — Garante Realtime ATIVO para public.posts no Supabase
-- EXTERNO. Sem isso, o websocket não emite eventos e o feed só atualiza
-- ao recarregar manualmente (sintoma reportado por usuários).
--
-- - Adiciona public.posts à publicação supabase_realtime (idempotente).
-- - REPLICA IDENTITY FULL para que UPDATE/DELETE entreguem `old_record`
--   completo (contadores de likes/comments refletem ao vivo nos cards).
-- - Tabelas dependentes do feed (post_likes, post_comments, saved_posts)
--   também entram na publicação — assim contadores reagem na mesma hora.
--
-- Executar no SQL Editor do Supabase EXTERNO. Idempotente.
-- =====================================================================

DO $$
BEGIN
  -- posts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'posts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.posts';
  END IF;

  -- post_likes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'post_likes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes';
  END IF;

  -- post_comments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'post_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments';
  END IF;

  -- saved_posts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'saved_posts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_posts';
  END IF;
END$$;

-- REPLICA IDENTITY FULL — entrega o registro completo no payload do UPDATE/DELETE.
-- Necessário para que o cliente reflita contadores e exclusões instantaneamente.
ALTER TABLE public.posts          REPLICA IDENTITY FULL;
ALTER TABLE public.post_likes     REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments  REPLICA IDENTITY FULL;
ALTER TABLE public.saved_posts    REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
