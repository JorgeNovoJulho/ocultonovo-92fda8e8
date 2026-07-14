
CREATE OR REPLACE FUNCTION public.delete_test_messages(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM messages
  WHERE conversation_id = p_conversation_id
    AND content LIKE '🧪%'
  ;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
