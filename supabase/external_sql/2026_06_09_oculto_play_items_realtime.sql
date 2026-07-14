-- ============================================================
-- OCULTO PLAY — Realtime para view_count / like_count dos cards
-- Adiciona oculto_play_items à publication supabase_realtime
-- para que o incremento de view_count chegue em tempo real
-- na sessão Áudios e na sessão Vídeos.
-- 100% idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- REPLICA IDENTITY FULL (necessário para payload completo no UPDATE)
  BEGIN
    EXECUTE 'ALTER TABLE public.oculto_play_items REPLICA IDENTITY FULL';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime'
       AND schemaname='public'
       AND tablename='oculto_play_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_items';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
