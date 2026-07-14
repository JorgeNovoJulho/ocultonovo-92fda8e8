
-- Drop existing helpers that may have conflicting parameter names
DROP FUNCTION IF EXISTS public.oculto_get_actor_name(uuid);
DROP FUNCTION IF EXISTS public.oculto_get_post_owner_auth(uuid);
DROP FUNCTION IF EXISTS public.oculto_get_post_owner_profile(uuid);

CREATE FUNCTION public.oculto_get_actor_name(p_profile_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(username,''), NULLIF(name,''), 'Alguém')
  FROM public.profiles WHERE id = p_profile_id;
$$;

CREATE FUNCTION public.oculto_get_post_owner_profile(p_post_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.posts WHERE id = p_post_id;
$$;

-- LIKES
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN UPDATE public.posts SET likes_count=COALESCE(likes_count,0)+1 WHERE id=NEW.post_id; RETURN NEW;
  ELSIF TG_OP='DELETE' THEN UPDATE public.posts SET likes_count=GREATEST(0,COALESCE(likes_count,0)-1) WHERE id=OLD.post_id; RETURN OLD; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_post_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_profile uuid; v_owner_auth uuid; v_actor_name text; v_count int;
BEGIN
  v_owner_profile := public.oculto_get_post_owner_profile(NEW.post_id);
  IF v_owner_profile IS NULL OR v_owner_profile = NEW.user_id THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner_auth FROM public.profiles WHERE id=v_owner_profile;
  IF v_owner_auth IS NULL THEN RETURN NEW; END IF;
  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COALESCE(likes_count,0) INTO v_count FROM public.posts WHERE id=NEW.post_id;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(
    v_owner_auth,'like','@'||v_actor_name||' curtiu sua publicação',
    'Sua publicação tem '||v_count||' curtida'||CASE WHEN v_count=1 THEN '' ELSE 's' END,
    jsonb_build_object('post_id',NEW.post_id,'actor_profile_id',NEW.user_id,'count',v_count));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_post_likes_count AFTER INSERT OR DELETE ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.update_post_likes_count();
DROP TRIGGER IF EXISTS trg_post_likes_notify ON public.post_likes;
CREATE TRIGGER trg_post_likes_notify AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_like();

-- DISLIKES
CREATE OR REPLACE FUNCTION public.update_post_dislikes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN UPDATE public.posts SET dislikes_count=COALESCE(dislikes_count,0)+1 WHERE id=NEW.post_id; RETURN NEW;
  ELSIF TG_OP='DELETE' THEN UPDATE public.posts SET dislikes_count=GREATEST(0,COALESCE(dislikes_count,0)-1) WHERE id=OLD.post_id; RETURN OLD; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_post_dislike()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_profile uuid; v_owner_auth uuid; v_actor_name text; v_count int;
BEGIN
  v_owner_profile := public.oculto_get_post_owner_profile(NEW.post_id);
  IF v_owner_profile IS NULL OR v_owner_profile = NEW.user_id THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner_auth FROM public.profiles WHERE id=v_owner_profile;
  IF v_owner_auth IS NULL THEN RETURN NEW; END IF;
  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COALESCE(dislikes_count,0) INTO v_count FROM public.posts WHERE id=NEW.post_id;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(
    v_owner_auth,'system','@'||v_actor_name||' descurtiu sua publicação',
    'Sua publicação tem '||v_count||' descurtida'||CASE WHEN v_count=1 THEN '' ELSE 's' END,
    jsonb_build_object('post_id',NEW.post_id,'actor_profile_id',NEW.user_id,'count',v_count,'notification_type','dislike'));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_post_dislikes_count ON public.post_dislikes;
CREATE TRIGGER trg_post_dislikes_count AFTER INSERT OR DELETE ON public.post_dislikes FOR EACH ROW EXECUTE FUNCTION public.update_post_dislikes_count();
DROP TRIGGER IF EXISTS trg_post_dislikes_notify ON public.post_dislikes;
CREATE TRIGGER trg_post_dislikes_notify AFTER INSERT ON public.post_dislikes FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_dislike();

-- COMMENTS
CREATE OR REPLACE FUNCTION public.update_post_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN UPDATE public.posts SET comments_count=COALESCE(comments_count,0)+1 WHERE id=NEW.post_id; RETURN NEW;
  ELSIF TG_OP='DELETE' THEN UPDATE public.posts SET comments_count=GREATEST(0,COALESCE(comments_count,0)-1) WHERE id=OLD.post_id; RETURN OLD; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_post_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_profile uuid; v_owner_auth uuid; v_actor_name text; v_count int;
BEGIN
  v_owner_profile := public.oculto_get_post_owner_profile(NEW.post_id);
  IF v_owner_profile IS NULL OR v_owner_profile = NEW.user_id THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner_auth FROM public.profiles WHERE id=v_owner_profile;
  IF v_owner_auth IS NULL THEN RETURN NEW; END IF;
  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COALESCE(comments_count,0) INTO v_count FROM public.posts WHERE id=NEW.post_id;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(
    v_owner_auth,'comment','@'||v_actor_name||' comentou sua publicação',
    'Sua publicação tem '||v_count||' comentário'||CASE WHEN v_count=1 THEN '' ELSE 's' END,
    jsonb_build_object('post_id',NEW.post_id,'actor_profile_id',NEW.user_id,'count',v_count,'comment_id',NEW.id));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count AFTER INSERT OR DELETE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.update_post_comments_count();
DROP TRIGGER IF EXISTS trg_post_comments_notify ON public.post_comments;
CREATE TRIGGER trg_post_comments_notify AFTER INSERT ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_comment();

-- SAVES
CREATE OR REPLACE FUNCTION public.update_post_saves_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN UPDATE public.posts SET saves_count=COALESCE(saves_count,0)+1 WHERE id=NEW.post_id; RETURN NEW;
  ELSIF TG_OP='DELETE' THEN UPDATE public.posts SET saves_count=GREATEST(0,COALESCE(saves_count,0)-1) WHERE id=OLD.post_id; RETURN OLD; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_post_save()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_profile uuid; v_owner_auth uuid; v_actor_name text; v_count int;
BEGIN
  v_owner_profile := public.oculto_get_post_owner_profile(NEW.post_id);
  IF v_owner_profile IS NULL OR v_owner_profile = NEW.user_id THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner_auth FROM public.profiles WHERE id=v_owner_profile;
  IF v_owner_auth IS NULL THEN RETURN NEW; END IF;
  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COALESCE(saves_count,0) INTO v_count FROM public.posts WHERE id=NEW.post_id;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(
    v_owner_auth,'system','@'||v_actor_name||' salvou sua publicação',
    'Sua publicação foi salva '||v_count||' vez'||CASE WHEN v_count=1 THEN '' ELSE 'es' END,
    jsonb_build_object('post_id',NEW.post_id,'actor_profile_id',NEW.user_id,'count',v_count,'notification_type','save'));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_saved_posts_count ON public.saved_posts;
CREATE TRIGGER trg_saved_posts_count AFTER INSERT OR DELETE ON public.saved_posts FOR EACH ROW EXECUTE FUNCTION public.update_post_saves_count();
DROP TRIGGER IF EXISTS trg_saved_posts_notify ON public.saved_posts;
CREATE TRIGGER trg_saved_posts_notify AFTER INSERT ON public.saved_posts FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_save();

-- SHARES
CREATE OR REPLACE FUNCTION public.update_post_shares_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN UPDATE public.posts SET shares_count=COALESCE(shares_count,0)+1 WHERE id=NEW.post_id; RETURN NEW;
  ELSIF TG_OP='DELETE' THEN UPDATE public.posts SET shares_count=GREATEST(0,COALESCE(shares_count,0)-1) WHERE id=OLD.post_id; RETURN OLD; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_post_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_profile uuid; v_owner_auth uuid; v_actor_name text; v_count int;
BEGIN
  v_owner_profile := public.oculto_get_post_owner_profile(NEW.post_id);
  IF v_owner_profile IS NULL OR v_owner_profile = NEW.user_id THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner_auth FROM public.profiles WHERE id=v_owner_profile;
  IF v_owner_auth IS NULL THEN RETURN NEW; END IF;
  v_actor_name := public.oculto_get_actor_name(NEW.user_id);
  SELECT COALESCE(shares_count,0) INTO v_count FROM public.posts WHERE id=NEW.post_id;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(
    v_owner_auth,'system','@'||v_actor_name||' compartilhou sua publicação',
    'Sua publicação foi compartilhada '||v_count||' vez'||CASE WHEN v_count=1 THEN '' ELSE 'es' END,
    jsonb_build_object('post_id',NEW.post_id,'actor_profile_id',NEW.user_id,'count',v_count,'notification_type','share'));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_post_shares_count ON public.post_shares;
CREATE TRIGGER trg_post_shares_count AFTER INSERT OR DELETE ON public.post_shares FOR EACH ROW EXECUTE FUNCTION public.update_post_shares_count();
DROP TRIGGER IF EXISTS trg_post_shares_notify ON public.post_shares;
CREATE TRIGGER trg_post_shares_notify AFTER INSERT ON public.post_shares FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_share();

-- Reconcilia contadores
UPDATE public.posts p SET
  likes_count = COALESCE((SELECT COUNT(*) FROM public.post_likes WHERE post_id=p.id),0),
  dislikes_count = COALESCE((SELECT COUNT(*) FROM public.post_dislikes WHERE post_id=p.id),0),
  comments_count = COALESCE((SELECT COUNT(*) FROM public.post_comments WHERE post_id=p.id),0),
  saves_count = COALESCE((SELECT COUNT(*) FROM public.saved_posts WHERE post_id=p.id),0),
  shares_count = COALESCE((SELECT COUNT(*) FROM public.post_shares WHERE post_id=p.id),0);
