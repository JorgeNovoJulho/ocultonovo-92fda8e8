-- ============================================================
-- 2026_06_01_realtime_feed_publication.sql
-- Garante que o feed principal receba updates em tempo real
-- via Supabase Realtime (websocket) sem precisar de F5.
--
-- - Adiciona as tabelas-chave do feed à publicação `supabase_realtime`.
-- - Define REPLICA IDENTITY FULL para que UPDATE/DELETE entreguem
--   o payload completo (necessário para invalidar cache corretamente).
--
-- Idempotente: usa DO blocks com IF NOT EXISTS, pode rodar várias vezes.
-- ============================================================

-- 1) REPLICA IDENTITY FULL nas tabelas que o feed assina
ALTER TABLE public.posts            REPLICA IDENTITY FULL;
ALTER TABLE public.post_likes       REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments    REPLICA IDENTITY FULL;
ALTER TABLE public.saved_posts      REPLICA IDENTITY FULL;

-- 2) Garante a publicação supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END$$;

-- 3) Adiciona cada tabela à publicação se ainda não estiver
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts','post_likes','post_comments','saved_posts']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';
