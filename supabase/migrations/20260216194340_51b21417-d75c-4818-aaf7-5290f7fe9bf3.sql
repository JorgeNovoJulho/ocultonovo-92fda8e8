
-- Trigger to notify post owner when someone comments
CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner_auth_id uuid;
  v_commenter_name text;
  v_post_id uuid;
BEGIN
  -- Get post owner's auth user_id
  SELECT p.user_id INTO v_post_owner_auth_id
  FROM public.posts po
  JOIN public.profiles p ON p.id = po.user_id
  WHERE po.id = NEW.post_id;

  -- Get commenter name
  SELECT name INTO v_commenter_name
  FROM public.profiles WHERE id = NEW.user_id;

  -- Don't notify if commenting on own post
  IF v_post_owner_auth_id IS NOT NULL AND v_post_owner_auth_id != (SELECT user_id FROM public.profiles WHERE id = NEW.user_id) THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_post_owner_auth_id,
      'comment',
      'Novo comentário',
      COALESCE(v_commenter_name, 'Alguém') || ' comentou no seu post.',
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'commenter_id', NEW.user_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_post_comment_notify
  AFTER INSERT ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_post_comment();
