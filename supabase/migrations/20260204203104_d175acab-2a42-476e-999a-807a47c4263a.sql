-- =====================================================
-- CORREÇÃO DE SEGURANÇA: Mais funções com search_path
-- =====================================================

-- 1. notify_on_comment
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert notification for post owner
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT 
    p.user_id,
    'comment',
    'Novo comentário',
    'Alguém comentou no seu post',
    jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id)
  FROM public.posts p
  WHERE p.id = NEW.post_id
  AND p.user_id != NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- 2. update_comments_count
CREATE OR REPLACE FUNCTION public.update_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 3. update_post_likes_count
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 4. update_post_dislikes_count
CREATE OR REPLACE FUNCTION public.update_post_dislikes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET dislikes_count = COALESCE(dislikes_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET dislikes_count = GREATEST(COALESCE(dislikes_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 5. update_comment_likes_count
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.post_comments SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.post_comments SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 6. update_conversation_timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- 7. update_user_activity
CREATE OR REPLACE FUNCTION public.update_user_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles 
  SET last_activity_at = now(), is_online = true 
  WHERE id = auth.uid();
  RETURN NEW;
END;
$$;

-- 8. check_capacity_threshold
CREATE OR REPLACE FUNCTION public.check_capacity_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
  max_capacity INTEGER;
BEGIN
  SELECT COUNT(*) INTO current_count FROM public.profiles WHERE is_creator = true;
  SELECT (value->>'max_creators')::INTEGER INTO max_capacity FROM public.system_settings WHERE key = 'capacity';
  
  IF max_capacity IS NOT NULL AND current_count >= max_capacity THEN
    RAISE EXCEPTION 'Capacidade máxima de criadores atingida';
  END IF;
  
  RETURN NEW;
END;
$$;

-- 9. save_comment_edit_history
CREATE OR REPLACE FUNCTION public.save_comment_edit_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO public.comment_edit_history (comment_id, previous_content, edited_by)
    VALUES (OLD.id, OLD.content, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- 10. emit_subscription_activity
CREATE OR REPLACE FUNCTION public.emit_subscription_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
    INSERT INTO public.public_activities (user_id, activity_type, target_user_id, amount)
    VALUES (NEW.subscriber_id, 'subscription', NEW.creator_id, NEW.amount);
  END IF;
  RETURN NEW;
END;
$$;

-- 11. emit_gift_activity
CREATE OR REPLACE FUNCTION public.emit_gift_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.public_activities (user_id, activity_type, target_user_id, amount, metadata)
  VALUES (NEW.sender_id, 'gift', NEW.recipient_id, NEW.amount, jsonb_build_object('gift_id', NEW.gift_id));
  RETURN NEW;
END;
$$;

-- 12. update_feature_votes_count
CREATE OR REPLACE FUNCTION public.update_feature_votes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feature_requests SET votes_count = COALESCE(votes_count, 0) + 1 WHERE id = NEW.feature_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feature_requests SET votes_count = GREATEST(COALESCE(votes_count, 0) - 1, 0) WHERE id = OLD.feature_id;
  END IF;
  RETURN NULL;
END;
$$;