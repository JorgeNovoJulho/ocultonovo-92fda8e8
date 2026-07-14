
-- Trigger function: when a new referral is inserted, create a notification for the parent
CREATE OR REPLACE FUNCTION public.notify_referral_parent()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_user_id uuid;
  v_child_name text;
BEGIN
  -- Get parent's user_id from profiles
  SELECT user_id INTO v_parent_user_id
  FROM public.profiles
  WHERE id = NEW.parent_id;

  -- Get child's display name
  SELECT COALESCE(name, username, 'Alguém') INTO v_child_name
  FROM public.profiles
  WHERE id = NEW.child_id;

  -- Only notify if parent exists and is different from child
  IF v_parent_user_id IS NOT NULL AND NEW.parent_id <> NEW.child_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_parent_user_id,
      'follow',
      '🔥 Novo membro no seu clã!',
      v_child_name || ' acabou de entrar no OCULTO através do seu link.',
      jsonb_build_object(
        'notification_type', 'referral_conversion',
        'child_id', NEW.child_id,
        'referral_source', NEW.referral_source
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop if exists to be safe
DROP TRIGGER IF EXISTS trg_notify_referral_parent ON public.referral_tree;

-- Create trigger
CREATE TRIGGER trg_notify_referral_parent
AFTER INSERT ON public.referral_tree
FOR EACH ROW
EXECUTE FUNCTION public.notify_referral_parent();

-- Enable realtime on referral_tree so the stats card updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_tree;
