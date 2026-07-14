
-- ================================================
-- NOTIFICATION TRIGGERS - FUNCTIONS ONLY (no lock conflicts)
-- ================================================

CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
  v_recipient_id UUID;
BEGIN
  SELECT name INTO v_sender_name FROM profiles WHERE user_id = NEW.sender_id;
  
  SELECT cp.user_id INTO v_recipient_id
  FROM conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id != NEW.sender_id
  LIMIT 1;
  
  IF v_recipient_id IS NOT NULL AND v_recipient_id != NEW.sender_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_recipient_id,
      'new_message',
      'Nova mensagem',
      COALESCE(v_sender_name, 'Alguém') || ' enviou uma mensagem',
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liker_name TEXT;
  v_post_owner UUID;
BEGIN
  SELECT name INTO v_liker_name FROM profiles WHERE user_id = NEW.user_id;
  SELECT user_id INTO v_post_owner FROM posts WHERE id = NEW.post_id;
  
  IF v_post_owner IS NOT NULL AND v_post_owner != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_post_owner, 'post_like', 'Curtida no seu post',
      COALESCE(v_liker_name, 'Alguém') || ' curtiu seu post',
      jsonb_build_object('post_id', NEW.post_id, 'liker_id', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commenter_name TEXT;
  v_post_owner UUID;
BEGIN
  SELECT name INTO v_commenter_name FROM profiles WHERE user_id = NEW.user_id;
  SELECT user_id INTO v_post_owner FROM posts WHERE id = NEW.post_id;
  
  IF v_post_owner IS NOT NULL AND v_post_owner != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_post_owner, 'post_comment', 'Novo comentário',
      COALESCE(v_commenter_name, 'Alguém') || ' comentou no seu post',
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follower_name TEXT;
BEGIN
  SELECT name INTO v_follower_name FROM profiles WHERE user_id = NEW.follower_id;
  
  IF NEW.following_id != NEW.follower_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.following_id, 'new_follower', 'Novo seguidor',
      COALESCE(v_follower_name, 'Alguém') || ' começou a te seguir',
      jsonb_build_object('follower_id', NEW.follower_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach triggers
DROP TRIGGER IF EXISTS trigger_notify_new_message ON messages;
CREATE TRIGGER trigger_notify_new_message
  AFTER INSERT ON messages FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_message();

DROP TRIGGER IF EXISTS trigger_notify_post_like ON post_likes;
CREATE TRIGGER trigger_notify_post_like
  AFTER INSERT ON post_likes FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_post_like();

DROP TRIGGER IF EXISTS trigger_notify_post_comment ON post_comments;
CREATE TRIGGER trigger_notify_post_comment
  AFTER INSERT ON post_comments FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_post_comment();

DROP TRIGGER IF EXISTS trigger_notify_new_follower ON follows;
CREATE TRIGGER trigger_notify_new_follower
  AFTER INSERT ON follows FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_follower();
