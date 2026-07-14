-- ============================================================
-- Realtime para contador de visualizações de vídeo (modal)
-- Faz o "👁 N" do PostExpandedModal atualizar ao vivo,
-- sem precisar recarregar a página.
-- Idempotente — pode rodar várias vezes no SQL Editor externo.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='oculto_media_play_views'
  ) THEN
    EXECUTE 'ALTER TABLE public.oculto_media_play_views REPLICA IDENTITY FULL';

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime'
         AND schemaname='public'
         AND tablename='oculto_media_play_views'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_media_play_views';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
