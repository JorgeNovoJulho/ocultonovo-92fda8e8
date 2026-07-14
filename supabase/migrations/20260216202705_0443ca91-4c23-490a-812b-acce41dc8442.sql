-- RPC to search messages within user's conversations
CREATE OR REPLACE FUNCTION public.search_my_messages(
  p_user_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  other_user_id uuid,
  other_user_name text,
  other_user_avatar text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id AS message_id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    p.id AS other_user_id,
    p.name AS other_user_name,
    p.avatar_url AS other_user_avatar
  FROM messages m
  INNER JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = p_user_id
  INNER JOIN conversation_participants cp2 ON cp2.conversation_id = m.conversation_id AND cp2.user_id != p_user_id
  INNER JOIN profiles p ON p.user_id = cp2.user_id
  WHERE m.content ILIKE '%' || p_query || '%'
    AND (m.deleted_for_everyone IS NULL OR m.deleted_for_everyone = false)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;