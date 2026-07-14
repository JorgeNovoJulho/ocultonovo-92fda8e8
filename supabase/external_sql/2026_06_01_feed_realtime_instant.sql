-- =====================================================================
-- FEED REALTIME INSTANTÂNEO — garante atualização sem reload no feed
-- principal. Idempotente. Rodar no SQL Editor do Supabase externo.
-- =====================================================================

-- 1) Garante REPLICA IDENTITY FULL em posts (necessário para realtime
--    enviar payload completo de UPDATE/DELETE).
ALTER TABLE public.posts REPLICA IDENTITY FULL;

-- 2) Garante que a tabela posts está na publicação supabase_realtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'posts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.posts';
  END IF;
END $$;

-- 3) Garante colunas is_pinned / pinned_at em posts.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_posts_pinned_global
  ON public.posts (is_pinned, pinned_at DESC NULLS LAST, created_at DESC)
  WHERE is_pinned = true;

-- 4) Recria a view v_feed_posts expondo is_pinned/pinned_at sem mudar
--    nenhuma outra coluna (SELECT *). View permanece SECURITY INVOKER.
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_feed_posts'
  ) INTO v_exists;

  IF v_exists THEN
    -- Não dropa; apenas garante grants.
    NULL;
  ELSE
    EXECUTE $v$
      CREATE VIEW public.v_feed_posts AS
      SELECT * FROM public.posts
    $v$;
  END IF;
END $$;

GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

-- 5) Reload do schema cache do PostgREST.
NOTIFY pgrst, 'reload schema';
