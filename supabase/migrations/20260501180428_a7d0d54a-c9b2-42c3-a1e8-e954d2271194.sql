
-- ============================================================
-- NOTIFICAÇÕES PARA O CRIADOR: like, dislike, comment, save, share
-- Inclui contagem atual da interação no body
-- ============================================================

-- Helper: pega nome do ator (profiles.id = user_id)
CREATE OR REPLACE FUNCTION public.oculto_get_actor_name(_actor_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(p.name, p.username, 'Alguém')
  FROM public.profiles p
  WHERE p.id = _actor_id
  LIMIT 1;
$$;

-- ============= LIKE =============
CREATE OR REPLACE FUNCTION public.notify_on_post_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_actor_name text;
  v_count int;
BEGIN
  IF COALESCE(NEW.is_seed, false) THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COUNT(*) INTO v_count FROM public.post_likes WHERE post_id = NEW.post_id;

  INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
  VALUES (
    v_owner, 'like',
    v_actor_name || ' curtiu sua publicação',
    'Sua publicação tem ' || v_count || ' ' || CASE WHEN v_count = 1 THEN 'curtida' ELSE 'curtidas' END,
    jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'count', v_count),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_on_post_like
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_like();

-- ============= DISLIKE =============
CREATE OR REPLACE FUNCTION public.notify_on_post_dislike()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_actor_name text;
  v_count int;
BEGIN
  SELECT user_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COUNT(*) INTO v_count FROM public.post_dislikes WHERE post_id = NEW.post_id;

  INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
  VALUES (
    v_owner, 'dislike',
    v_actor_name || ' não curtiu sua publicação',
    'Sua publicação tem ' || v_count || ' ' || CASE WHEN v_count = 1 THEN 'descurtida' ELSE 'descurtidas' END,
    jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'count', v_count),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_dislike ON public.post_dislikes;
CREATE TRIGGER trg_notify_on_post_dislike
AFTER INSERT ON public.post_dislikes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_dislike();

-- ============= COMMENT =============
CREATE OR REPLACE FUNCTION public.notify_on_post_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_actor_name text;
  v_count int;
  v_type text;
BEGIN
  IF COALESCE(NEW.is_seed, false) OR COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COUNT(*) INTO v_count FROM public.post_comments WHERE post_id = NEW.post_id AND COALESCE(is_hidden,false) = false;
  v_type := CASE WHEN NEW.parent_id IS NOT NULL THEN 'reply' ELSE 'comment' END;

  INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
  VALUES (
    v_owner, v_type,
    v_actor_name || CASE WHEN v_type='reply' THEN ' respondeu em sua publicação' ELSE ' comentou em sua publicação' END,
    'Sua publicação tem ' || v_count || ' ' || CASE WHEN v_count = 1 THEN 'comentário' ELSE 'comentários' END,
    jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'comment_id', NEW.id, 'count', v_count),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_comment ON public.post_comments;
CREATE TRIGGER trg_notify_on_post_comment
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_comment();

-- ============= SAVE =============
CREATE OR REPLACE FUNCTION public.notify_on_post_save()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_actor_name text;
  v_count int;
BEGIN
  SELECT user_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COUNT(*) INTO v_count FROM public.saved_posts WHERE post_id = NEW.post_id;

  INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
  VALUES (
    v_owner, 'save',
    v_actor_name || ' salvou sua publicação',
    'Sua publicação foi salva ' || v_count || ' ' || CASE WHEN v_count = 1 THEN 'vez' ELSE 'vezes' END,
    jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'count', v_count, 'notification_type', 'save'),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_save ON public.saved_posts;
CREATE TRIGGER trg_notify_on_post_save
AFTER INSERT ON public.saved_posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_save();

-- ============= SHARE =============
CREATE OR REPLACE FUNCTION public.notify_on_post_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_actor_name text;
  v_count int;
BEGIN
  SELECT user_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COUNT(*) INTO v_count FROM public.post_shares WHERE post_id = NEW.post_id;

  INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
  VALUES (
    v_owner, 'share',
    v_actor_name || ' compartilhou sua publicação',
    'Sua publicação foi compartilhada ' || v_count || ' ' || CASE WHEN v_count = 1 THEN 'vez' ELSE 'vezes' END,
    jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'count', v_count, 'channel', NEW.channel),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_share ON public.post_shares;
CREATE TRIGGER trg_notify_on_post_share
AFTER INSERT ON public.post_shares
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_share();

-- ============= COUNTERS (garantir que estejam ativos) =============
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = COALESCE(likes_count,0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(0, COALESCE(likes_count,0) - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_update_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_update_post_likes_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.update_post_likes_count();

CREATE OR REPLACE FUNCTION public.update_post_dislikes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET dislikes_count = COALESCE(dislikes_count,0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET dislikes_count = GREATEST(0, COALESCE(dislikes_count,0) - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_update_post_dislikes_count ON public.post_dislikes;
CREATE TRIGGER trg_update_post_dislikes_count
AFTER INSERT OR DELETE ON public.post_dislikes
FOR EACH ROW EXECUTE FUNCTION public.update_post_dislikes_count();

CREATE OR REPLACE FUNCTION public.update_post_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = COALESCE(comments_count,0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(0, COALESCE(comments_count,0) - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_update_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_update_post_comments_count
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.update_post_comments_count();
