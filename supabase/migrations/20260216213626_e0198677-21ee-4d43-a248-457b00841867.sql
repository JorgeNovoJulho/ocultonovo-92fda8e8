-- Fix the broken trigger that references non-existent column conversations.creator_id
CREATE OR REPLACE FUNCTION public.clear_priority_on_creator_reply()
RETURNS TRIGGER AS $$
BEGIN
  -- Simply clear priority when any participant replies
  -- The old logic referenced conversations.creator_id which doesn't exist
  UPDATE public.conversation_participants
  SET has_unread_priority = false
  WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;