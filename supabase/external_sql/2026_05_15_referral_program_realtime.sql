-- ============================================================
-- Realtime para campanhas e níveis de afiliado (pendência 14-a)
-- Idempotente.
-- ============================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['oculto_affiliate_campaigns','oculto_affiliate_levels'];
  already_member BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) INTO already_member;
      IF NOT already_member THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
