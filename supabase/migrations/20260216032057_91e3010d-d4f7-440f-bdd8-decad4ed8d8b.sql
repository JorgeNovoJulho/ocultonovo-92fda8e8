-- Drop the duplicate trigger that uses invalid type 'post_comment'
DROP TRIGGER IF EXISTS trigger_notify_post_comment ON public.post_comments;
DROP FUNCTION IF EXISTS notify_on_post_comment();