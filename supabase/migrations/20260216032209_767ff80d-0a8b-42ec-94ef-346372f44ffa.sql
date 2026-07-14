-- Drop the trigger that uses invalid type 'post_like'
DROP TRIGGER IF EXISTS trigger_notify_post_like ON public.post_likes;
DROP FUNCTION IF EXISTS notify_on_post_like();