-- =====================================================================
-- 2026_06_09 — Habilita Realtime para o feed principal
-- =====================================================================
-- Causa raiz: a publicação `supabase_realtime` no banco externo estava
-- VAZIA. Por isso INSERT/UPDATE/DELETE em `posts` nunca chegavam ao
-- websocket e o feed só atualizava ao recarregar a página.
--
-- Este script é IDEMPOTENTE (pode rodar várias vezes sem erro):
--   1) Garante REPLICA IDENTITY FULL nas tabelas (necessário p/ UPDATE
--      e DELETE entregarem o registro completo).
--   2) Adiciona as tabelas à publicação `supabase_realtime` se ainda
--      não estiverem lá.
-- =====================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'posts',
    'post_likes',
    'post_dislikes',
    'post_comments',
    'post_shares',
    'saved_posts',
    'comment_likes',
    'profiles',
    'follows',
    'notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 1) REPLICA IDENTITY FULL (necessário p/ payload completo em UPDATE/DELETE)
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', t);

      -- 2) Adiciona à publicação supabase_realtime se ainda não estiver
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
      END IF;
    END IF;
  END LOOP;
END$$;

-- Verificação (rode separadamente se quiser conferir):
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname='supabase_realtime' ORDER BY tablename;
