CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  profile_id uuid;
  caller_uid uuid;
BEGIN
  caller_uid := auth.uid();

  -- Authorization: caller must be deleting their own account, or be an admin
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  IF caller_uid <> target_user_id AND NOT public.is_admin_master(caller_uid) THEN
    RAISE EXCEPTION 'Unauthorized: can only delete your own account';
  END IF;

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
END;
$function$;

-- Revoke direct execute from clients; only service role / edge functions should call it
REVOKE EXECUTE ON FUNCTION public.delete_user_account(uuid) FROM anon, authenticated;