-- Fix the check constraint to allow all notification types used by triggers and app code
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'message'::text, 
  'like'::text, 
  'subscription'::text, 
  'follow'::text, 
  'comment'::text,
  'new_follower'::text,
  'new_message'::text,
  'post_like'::text,
  'post_comment'::text,
  'visit'::text,
  'mention'::text,
  'story_reply'::text,
  'unlock'::text,
  'charge'::text,
  'security'::text,
  'system'::text,
  'founder_status'::text,
  'verification_rejected'::text
]));

-- Fix notify_on_comment to use auth user_id instead of profile_id
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
  -- Get post owner profile id
  SELECT user_id INTO v_post_owner_profile_id FROM posts WHERE id = NEW.post_id;
  
  -- Don't notify if commenter is the post owner
  IF v_post_owner_profile_id IS NOT NULL AND v_post_owner_profile_id != NEW.user_id THEN
    -- Look up auth user id from profile
    SELECT user_id INTO v_post_owner_auth_id FROM profiles WHERE id = v_post_owner_profile_id;
    
    IF v_post_owner_auth_id IS NOT NULL THEN
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