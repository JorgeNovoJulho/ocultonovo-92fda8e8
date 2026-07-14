-- ============================================================
-- Realtime na tabela subscriptions
-- Idempotente — pode ser rodado várias vezes no SQL Editor externo.
-- Necessário para o canal do criador atualizar a contagem
-- de assinantes em tempo real, sem reload de página.
-- ============================================================

DO $$
BEGIN
  -- Adiciona subscriptions ao publication supabase_realtime, se ainda não estiver
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'subscriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions';
  END IF;
END$$;

-- Garante REPLICA IDENTITY FULL para o realtime receber payload completo
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
