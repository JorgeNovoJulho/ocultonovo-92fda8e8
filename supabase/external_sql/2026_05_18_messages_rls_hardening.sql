-- ============================================================================
-- HARDENING DE RLS — public.messages
-- Objetivo: garantir que o remetente SEMPRE consegue SELECT da própria mensagem
-- recém-inserida (o que evita a mensagem "sumir" do histórico após enviar).
-- Também garante INSERT/UPDATE/DELETE coerentes para os dois participantes
-- da conversa, mapeando profiles.id (sender_id) <-> auth.users.id (auth.uid()).
--
-- 100% idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Garante RLS habilitado
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2) Helper SECURITY DEFINER: retorna TRUE se o auth.uid() é dono do profile
--    cujo id é o sender_id (ou se o auth.uid() participa da conversa).
--    Usa SET search_path = public para evitar schema poisoning.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    LEFT JOIN public.profiles p1 ON p1.id = c.participant_1
    LEFT JOIN public.profiles p2 ON p2.id = c.participant_2
    WHERE c.id = _conversation_id
      AND (
        c.participant_1 = auth.uid()
        OR c.participant_2 = auth.uid()
        OR p1.user_id = auth.uid()
        OR p2.user_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_profile_id(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = _profile_id OR user_id = _profile_id)
      AND user_id = auth.uid()
  ) OR _profile_id = auth.uid();
$$;

-- 3) Limpa policies antigas que possam estar bloqueando o SELECT do próprio remetente
DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_sender"     ON public.messages;
DROP POLICY IF EXISTS "messages_update_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_sender"     ON public.messages;

-- 4) SELECT: qualquer um dos dois participantes da conversa pode ler
CREATE POLICY "messages_select_participants"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING ( public.is_conversation_participant(conversation_id) );

-- 5) INSERT: só pode inserir mensagem cujo sender_id pertence a você E
--    você participa da conversa
CREATE POLICY "messages_insert_sender"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.owns_profile_id(sender_id)
    AND public.is_conversation_participant(conversation_id)
  );

-- 6) UPDATE: participantes podem marcar como lida; remetente pode editar/deletar
CREATE POLICY "messages_update_participants"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING ( public.is_conversation_participant(conversation_id) )
  WITH CHECK ( public.is_conversation_participant(conversation_id) );

-- 7) DELETE: apenas o remetente
CREATE POLICY "messages_delete_sender"
  ON public.messages
  FOR DELETE
  TO authenticated
  USING ( public.owns_profile_id(sender_id) );

-- 8) Realtime: garante que a tabela messages está publicada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- publication já existe / sem permissão: ignora silenciosamente
  NULL;
END $$;

-- 9) Garante REPLICA IDENTITY FULL para o realtime entregar os payloads completos
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 10) Recarrega o schema do PostgREST
NOTIFY pgrst, 'reload schema';
