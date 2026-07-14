-- Garante Realtime nas tabelas usadas pelo painel admin do OCULTO PLAY.
-- Idempotente — pode rodar várias vezes no SQL Editor do Supabase externo.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['oculto_play_items','oculto_play_reports','oculto_play_config']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
