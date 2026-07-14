-- =============================================================================
-- Garante que as tabelas do chat estão na publication `supabase_realtime`.
-- Sem isso, INSERT/UPDATE de novas conversas e participações não chegam ao
-- cliente em tempo real — a inbox fica "presa" no estado em cache até o
-- usuário recarregar a página. Idempotente: pode ser rodado várias vezes.
-- =============================================================================

DO $$
DECLARE
  t text;
  has_pub boolean;
BEGIN
  -- Cria a publication caso ainda não exista (ambientes muito novos).
  SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    INTO has_pub;
  IF NOT has_pub THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;

  FOR t IN
    SELECT unnest(ARRAY[
      'messages',
      'conversations',
      'conversation_participants',
      'blocked_contacts'
    ])
  LOOP
    -- Só adiciona se a tabela existir e ainda não estiver na publication.
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;

    -- REPLICA IDENTITY FULL — necessário para o cliente ter `old` em UPDATE/DELETE
    -- (usado para detectar `is_read` transitando de false→true, por exemplo).
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;
