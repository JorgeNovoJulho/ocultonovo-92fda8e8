-- ============================================================================
-- PULSO DE AURA — Realtime para painel Admin Master
-- Garante que mudanças em aura_pulse_settings sejam ouvidas em tempo real
-- pelo painel /admin/aura-pulse.
-- 100% idempotente.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'aura_pulse_settings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_pulse_settings';
  END IF;
END $$;

-- REPLICA IDENTITY FULL para que o payload do realtime inclua todas as colunas
ALTER TABLE public.aura_pulse_settings REPLICA IDENTITY FULL;
