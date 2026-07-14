
-- 1. Remove trigger duplicado de comentários
DROP TRIGGER IF EXISTS trigger_notify_on_comment ON public.post_comments;

-- 2. Função para notificar curtidas em posts
CREATE OR REPLACE FUNCTION public.notify_on_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner_profile_id UUID;
  v_post_owner_auth_id UUID;
  v_actor_name TEXT;
  v_actor_username TEXT;
  v_actor_user_id UUID;
  v_display_name TEXT;
BEGIN
  -- Ignora curtidas de seed
  IF COALESCE(NEW.is_seed, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_post_owner_profile_id FROM posts WHERE id = NEW.post_id;
  IF v_post_owner_profile_id IS NULL OR v_post_owner_profile_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_post_owner_auth_id FROM profiles WHERE id = v_post_owner_profile_id;
  IF v_post_owner_auth_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id = v_post_owner_auth_id) THEN
    RETURN NEW;
  END IF;

  SELECT name, username, user_id INTO v_actor_name, v_actor_username, v_actor_user_id
    FROM profiles WHERE id = NEW.user_id;
  v_display_name := COALESCE(NULLIF(v_actor_username, ''), NULLIF(v_actor_name, ''), 'Alguém');

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_post_owner_auth_id,
    'like',
    '@' || v_display_name || ' curtiu sua publicação',
    NULL,
    jsonb_build_object(
      'post_id', NEW.post_id,
      'actor_id', NEW.user_id,
      'actor_user_id', v_actor_user_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_on_post_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_post_like();

-- 3. Função para notificar quando alguém salva um post
CREATE OR REPLACE FUNCTION public.notify_on_post_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner_profile_id UUID;
  v_post_owner_auth_id UUID;
  v_actor_name TEXT;
  v_actor_username TEXT;
  v_actor_user_id UUID;
  v_actor_is_seed BOOLEAN;
  v_display_name TEXT;
BEGIN
  SELECT user_id INTO v_post_owner_profile_id FROM posts WHERE id = NEW.post_id;
  IF v_post_owner_profile_id IS NULL OR v_post_owner_profile_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT name, username, user_id, COALESCE(is_seed,false)
    INTO v_actor_name, v_actor_username, v_actor_user_id, v_actor_is_seed
    FROM profiles WHERE id = NEW.user_id;
  IF v_actor_is_seed THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_post_owner_auth_id FROM profiles WHERE id = v_post_owner_profile_id;
  IF v_post_owner_auth_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id = v_post_owner_auth_id) THEN
    RETURN NEW;
  END IF;

  v_display_name := COALESCE(NULLIF(v_actor_username, ''), NULLIF(v_actor_name, ''), 'Alguém');

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_post_owner_auth_id,
    'system',
    '@' || v_display_name || ' salvou sua publicação',
    'Seu conteúdo foi salvo nos favoritos.',
    jsonb_build_object(
      'post_id', NEW.post_id,
      'actor_id', NEW.user_id,
      'actor_user_id', v_actor_user_id,
      'notification_subtype', 'save'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_save ON public.saved_posts;
CREATE TRIGGER trg_notify_on_post_save
  AFTER INSERT ON public.saved_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_post_save();
