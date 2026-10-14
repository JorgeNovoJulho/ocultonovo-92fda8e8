-- ============================================================
-- Chat: lista de conversas do usuário logado em UMA consulta.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
--
-- Por quê: a lista do chat era montada no app com 5+ consultas diretas às
-- tabelas. Se a regra de acesso (RLS) de qualquer uma delas não liberasse
-- a leitura, o banco devolvia "nada" (sem erro) e a lista aparecia vazia
-- ("Nenhuma mensagem ainda") para o usuário — mesmo com conversas e com
-- notificações de mensagem chegando.
--
-- Esta função roda com permissão do banco (SECURITY DEFINER), mas SÓ
-- devolve conversas em que o próprio usuário logado (auth.uid() ou um dos
-- seus perfis) é participante. Respeita bloqueios (is_chat_blocked_pair).
-- ============================================================

CREATE OR REPLACE FUNCTION public.chat_my_conversations()
RETURNS TABLE (
  conversation_id        uuid,
  created_at             timestamptz,
  updated_at             timestamptz,
  is_archived            boolean,
  last_read_at           timestamptz,
  has_unread_priority    boolean,
  total_priority_amount  numeric,
  peer_user_id           uuid,
  last_message_id        uuid,
  last_message_sender_id uuid,
  last_message_content   text,
  last_message_is_read   boolean,
  last_message_at        timestamptz,
  unread_count           integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.uid() AS id
    UNION
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  ),
  mine AS (
    SELECT
      cp.conversation_id,
      bool_or(COALESCE(cp.is_archived, false))          AS is_archived,
      max(cp.last_read_at)                               AS last_read_at,
      bool_or(COALESCE(cp.has_unread_priority, false))  AS has_unread_priority,
      max(COALESCE(cp.total_priority_amount, 0))         AS total_priority_amount
    FROM public.conversation_participants cp
    WHERE auth.uid() IS NOT NULL
      AND cp.user_id IN (SELECT id FROM me)
    GROUP BY cp.conversation_id
  ),
  with_peer AS (
    SELECT
      m.*,
      (
        SELECT cp2.user_id
        FROM public.conversation_participants cp2
        WHERE cp2.conversation_id = m.conversation_id
          AND cp2.user_id NOT IN (SELECT id FROM me)
        ORDER BY cp2.joined_at ASC
        LIMIT 1
      ) AS peer_user_id
    FROM mine m
  )
  SELECT
    w.conversation_id::uuid,
    COALESCE(c.created_at, lm.created_at, now())::timestamptz,
    COALESCE(c.updated_at, lm.created_at, c.created_at, now())::timestamptz,
    w.is_archived::boolean,
    w.last_read_at::timestamptz,
    w.has_unread_priority::boolean,
    w.total_priority_amount::numeric,
    w.peer_user_id::uuid,
    lm.id::uuid,
    lm.sender_id::uuid,
    lm.content::text,
    lm.is_read::boolean,
    lm.created_at::timestamptz,
    (
      SELECT count(*)::integer
      FROM public.messages mm
      WHERE mm.conversation_id = w.conversation_id
        AND mm.sender_id NOT IN (SELECT id FROM me)
        AND (w.last_read_at IS NULL OR mm.created_at > w.last_read_at)
    )
  FROM with_peer w
  LEFT JOIN public.conversations c ON c.id = w.conversation_id
  LEFT JOIN LATERAL (
    SELECT msg.id, msg.sender_id, msg.content, msg.is_read, msg.created_at
    FROM public.messages msg
    WHERE msg.conversation_id = w.conversation_id
    ORDER BY msg.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE w.peer_user_id IS NULL
     OR NOT public.is_chat_blocked_pair(auth.uid(), w.peer_user_id);
$$;

REVOKE ALL ON FUNCTION public.chat_my_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_my_conversations() TO authenticated;

-- Índices que deixam a função rápida mesmo com muitas mensagens.
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id
  ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id
  ON public.conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
