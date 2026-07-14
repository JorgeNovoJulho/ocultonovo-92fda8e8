-- ============================================================
-- COMUNIDADES OCULTAS — PARTE 7
-- Realtime: tópicos, replies, members
-- Cole no SQL Editor do Supabase EXTERNO. Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_community_topics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_community_topics;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_community_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_community_replies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_community_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_community_members;
  END IF;
END $$;

ALTER TABLE public.oculto_community_topics  REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_community_replies REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_community_members REPLICA IDENTITY FULL;

-- ============================================================
-- FIM PARTE 7
-- ============================================================
