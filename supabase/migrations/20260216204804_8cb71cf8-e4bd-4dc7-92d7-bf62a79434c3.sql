
-- RPC to undo last swipe: deletes most recent action and returns the target profile id
CREATE OR REPLACE FUNCTION public.undo_last_swipe(user_uuid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  -- Find and delete the most recent swipe
  DELETE FROM perfect_pairs
  WHERE id = (
    SELECT id FROM perfect_pairs
    WHERE user_id = user_uuid
    ORDER BY created_at DESC
    LIMIT 1
  )
  RETURNING target_id INTO target;
  
  RETURN target; -- returns NULL if nothing was found
END;
$$;
