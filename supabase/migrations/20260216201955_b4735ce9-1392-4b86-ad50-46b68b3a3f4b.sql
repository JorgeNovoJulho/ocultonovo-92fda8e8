-- Create atomic RPC to find or create a 1-on-1 conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_user1_id uuid,
  p_user2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  -- Validate inputs
  IF p_user1_id IS NULL OR p_user2_id IS NULL THEN
    RAISE EXCEPTION 'Both user IDs are required';
  END IF;
  
  IF p_user1_id = p_user2_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  -- Find existing conversation between the two users
  SELECT cp1.conversation_id INTO v_conversation_id
  FROM conversation_participants cp1
  INNER JOIN conversation_participants cp2 
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = p_user1_id 
    AND cp2.user_id = p_user2_id
  LIMIT 1;

  -- If found, return it
  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create new conversation
  INSERT INTO conversations DEFAULT VALUES
  RETURNING id INTO v_conversation_id;

  -- Add both participants atomically
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES 
    (v_conversation_id, p_user1_id),
    (v_conversation_id, p_user2_id);

  RETURN v_conversation_id;
END;
$$;