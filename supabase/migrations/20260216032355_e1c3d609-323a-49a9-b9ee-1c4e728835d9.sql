-- Fix notify_on_comment to verify auth user exists before inserting notification
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner_profile_id UUID;
  v_post_owner_auth_id UUID;
BEGIN
  SELECT user_id INTO v_post_owner_profile_id FROM posts WHERE id = NEW.post_id;
  
  IF v_post_owner_profile_id IS NOT NULL AND v_post_owner_profile_id != NEW.user_id THEN
    SELECT user_id INTO v_post_owner_auth_id FROM profiles WHERE id = v_post_owner_profile_id;
    
    -- Only insert if the auth user actually exists
    IF v_post_owner_auth_id IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id = v_post_owner_auth_id) THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_post_owner_auth_id,
        'comment',
        'Novo comentário',
        'Alguém comentou no seu post',
        jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;