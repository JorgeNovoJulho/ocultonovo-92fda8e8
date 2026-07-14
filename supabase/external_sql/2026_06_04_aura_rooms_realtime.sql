-- =============================================================================
-- Aura Rooms — Realtime habilitado
-- =============================================================================
-- Garante que a tabela `oculto_aura_rooms` faça parte da publicação
-- `supabase_realtime`, para que o frontend (HiddenRoomsCarousel +
-- useAuraRoomsList) receba INSERT/UPDATE/DELETE em tempo real assim que
-- o admin criar/ativar/desativar uma sala — sem precisar recarregar.
--
-- Idempotente: se já estiver adicionada, ignora silenciosamente.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_aura_rooms'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_rooms';
  END IF;
END $$;

-- Opcional, mas recomendado: payloads completos no Realtime
ALTER TABLE public.oculto_aura_rooms REPLICA IDENTITY FULL;
