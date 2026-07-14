-- ============================================================
-- FIX: GRANTs faltando em oculto_active_sessions
-- Sem GRANT explícito, PostgREST/Realtime retornam permissão negada
-- e a conexão dupla (single-session) não funciona de forma confiável.
-- Idempotente.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_active_sessions TO authenticated;
GRANT ALL ON public.oculto_active_sessions TO service_role;

-- Re-garante EXECUTE no RPC (caso tenha sido revogado)
GRANT EXECUTE ON FUNCTION public.claim_active_session(text, text, text, text) TO authenticated;

-- Garante que REPLICA IDENTITY FULL está aplicado (necessário p/ payload.new no realtime)
ALTER TABLE public.oculto_active_sessions REPLICA IDENTITY FULL;

-- Garante publicação realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_active_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_active_sessions;
  END IF;
END $$;
