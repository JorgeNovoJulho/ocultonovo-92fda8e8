-- ============================================================================
-- AURA PULSES — Re-asserção de Realtime (idempotente)
-- Garante que a tabela aura_pulses está publicada para realtime e que o
-- payload do WAL contém todas as colunas necessárias para o frontend
-- (target_id, sender_id, pulse_type, metadata, created_at, status).
--
-- Use sempre que o pulso "emitir som mas não destacar mensagem" no
-- destinatário — sintoma clássico de canal sem REPLICA IDENTITY FULL
-- ou de tabela fora da publication supabase_realtime.
--
-- Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'aura_pulses'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_pulses';
  END IF;
END $$;

ALTER TABLE public.aura_pulses REPLICA IDENTITY FULL;

-- Confirma policy de SELECT para o target (necessário para realtime entregar)
DROP POLICY IF EXISTS "aura_pulses_select_own" ON public.aura_pulses;
CREATE POLICY "aura_pulses_select_own"
  ON public.aura_pulses FOR SELECT
  USING (sender_id = auth.uid() OR target_id = auth.uid());
