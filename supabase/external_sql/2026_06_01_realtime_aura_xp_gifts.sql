-- ============================================================================
-- Habilita REPLICA IDENTITY FULL + adiciona oculto_aura_xp_gifts na
-- publicação supabase_realtime para que o destinatário receba INSERTs em
-- tempo real (modal de presente recebido) sem depender de notifications.
-- Idempotente — pode rodar várias vezes.
-- ============================================================================

ALTER TABLE public.oculto_aura_xp_gifts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_xp_gifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_xp_gifts';
  END IF;
END $$;

-- Garante também REPLICA IDENTITY FULL em notifications (payload completo no realtime)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
