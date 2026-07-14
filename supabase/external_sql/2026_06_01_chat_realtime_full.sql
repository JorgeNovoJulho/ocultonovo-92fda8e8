-- ============================================================
-- 2026_06_01_chat_realtime_full.sql
-- Garante realtime completo para o ecossistema de chat
-- (mensagens, conversas, participantes, perfis, notificações).
--
-- Idempotente: pode rodar várias vezes sem erro.
-- Cole este SQL no SQL Editor do Supabase externo
-- (rvybbrkzmboqbhcemqar.supabase.co).
-- ============================================================

-- 1) REPLICA IDENTITY FULL — permite que payloads de UPDATE/DELETE
--    cheguem ao cliente com a linha antiga e nova completas.
ALTER TABLE IF EXISTS public.messages                 REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.conversations            REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.conversation_participants REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.profiles                 REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.notifications            REPLICA IDENTITY FULL;

-- 2) Adiciona tabelas à publicação supabase_realtime se ainda não estiverem.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'messages',
    'conversations',
    'conversation_participants',
    'profiles',
    'notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Adicionada à publicação supabase_realtime: %', t;
    ELSE
      RAISE NOTICE 'Já estava na publicação: %', t;
    END IF;
  END LOOP;
END $$;

-- 3) Verificação final
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('messages','conversations','conversation_participants','profiles','notifications')
ORDER BY tablename;
