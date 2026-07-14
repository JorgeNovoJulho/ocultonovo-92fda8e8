-- ============================================================================
-- 2026-05-22 — Habilita Realtime para o Feed em tempo real
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente — pode rodar quantas vezes precisar.
-- ============================================================================

-- 1) REPLICA IDENTITY FULL — necessário para o realtime enviar payload completo
ALTER TABLE IF EXISTS public.posts          REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.post_likes     REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.post_dislikes  REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.post_comments  REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.saved_posts    REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.post_shares    REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.profiles       REPLICA IDENTITY FULL;

-- 2) Garante a publicação supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END$$;

-- 3) Adiciona tabelas relevantes ao publication (sem duplicar)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'posts','post_likes','post_dislikes','post_comments',
    'saved_posts','post_shares','profiles'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime'
           AND schemaname='public'
           AND tablename=t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END$$;

-- 4) Índice para acelerar a paginação por created_at desc (feed principal)
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc
  ON public.posts (created_at DESC);

-- 5) Verificação rápida (opcional — comente se não quiser ver no output)
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
ORDER BY tablename;
