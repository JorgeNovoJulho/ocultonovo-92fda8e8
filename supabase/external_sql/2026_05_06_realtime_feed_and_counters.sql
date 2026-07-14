-- ============================================================
-- Realtime para feed principal + contadores de ações
-- Idempotente — pode ser executado várias vezes sem erro.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'posts',
    'post_likes',
    'post_dislikes',
    'post_comments',
    'saved_posts',
    'post_shares',
    'profiles'
  ];
  already_member BOOLEAN;
BEGIN
  -- Garante publication
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- REPLICA IDENTITY FULL (sempre seguro)
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

      -- Verifica antes de adicionar para evitar erro 42710
      SELECT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) INTO already_member;

      IF NOT already_member THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
