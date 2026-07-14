
-- Add is_private column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- Create a secure view that filters out blocked users' posts
CREATE OR REPLACE VIEW public.v_secure_posts AS
SELECT p.*
FROM public.posts p
WHERE NOT EXISTS (
  SELECT 1 FROM public.blocked_contacts bc
  WHERE bc.user_id = p.user_id 
    AND bc.block_type = 'blocked'
);

-- Create function to delete user account (used by edge function)
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid;
BEGIN
  -- Get profile id
  SELECT id INTO profile_id FROM public.profiles WHERE user_id = target_user_id;
  
  IF profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', target_user_id;
  END IF;

  -- Delete all user data (cascades handle most)
  DELETE FROM public.posts WHERE user_id = profile_id;
  DELETE FROM public.blocked_contacts WHERE user_id = profile_id OR blocked_user_id = profile_id;
  DELETE FROM public.follows WHERE follower_id = profile_id OR following_id = profile_id;
  DELETE FROM public.notifications WHERE user_id = target_user_id;
  DELETE FROM public.transactions WHERE user_id = profile_id;
  DELETE FROM public.subscriptions WHERE subscriber_id = profile_id OR creator_id = profile_id;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE id = profile_id;
  
  -- Delete auth user (requires service_role, handled by edge function)
END;
$$;
