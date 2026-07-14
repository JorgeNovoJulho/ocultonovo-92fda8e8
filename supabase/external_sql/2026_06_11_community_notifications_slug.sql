-- Inclui community_slug no payload da notificação de community_reply
-- para que o clique na notificação abra direto o tópico sem lookup extra.
CREATE OR REPLACE FUNCTION public.oculto_community_reply_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic       RECORD;
  v_community   UUID;
  v_slug        TEXT;
  v_parent_user UUID;
BEGIN
  SELECT t.id, t.author_id, t.community_id, t.title
    INTO v_topic
    FROM public.oculto_community_topics t
   WHERE t.id = NEW.topic_id;

  IF v_topic.id IS NULL THEN
    RETURN NEW;
  END IF;
  v_community := v_topic.community_id;

  SELECT slug INTO v_slug FROM public.oculto_communities WHERE id = v_community;

  IF v_topic.author_id IS NOT NULL AND v_topic.author_id <> NEW.author_id THEN
    IF EXISTS (
      SELECT 1 FROM public.oculto_community_members m
       WHERE m.community_id = v_community
         AND m.user_id = v_topic.author_id
         AND m.status = 'active'
         AND m.notify_level IN ('all')
    ) OR NOT EXISTS (
      SELECT 1 FROM public.oculto_community_members m
       WHERE m.community_id = v_community AND m.user_id = v_topic.author_id
    ) THEN
      INSERT INTO public.notifications(user_id, type, title, message, data)
      VALUES (
        v_topic.author_id,
        'community_reply',
        'Nova resposta no seu tópico',
        left(coalesce(NEW.body, ''), 140),
        jsonb_build_object(
          'community_id', v_community,
          'community_slug', v_slug,
          'topic_id', v_topic.id,
          'reply_id', NEW.id,
          'topic_title', v_topic.title
        )
      );
    END IF;
  END IF;

  IF NEW.parent_reply_id IS NOT NULL THEN
    SELECT author_id INTO v_parent_user
      FROM public.oculto_community_replies
     WHERE id = NEW.parent_reply_id;

    IF v_parent_user IS NOT NULL AND v_parent_user <> NEW.author_id
       AND v_parent_user <> v_topic.author_id THEN
      IF EXISTS (
        SELECT 1 FROM public.oculto_community_members m
         WHERE m.community_id = v_community
           AND m.user_id = v_parent_user
           AND m.status = 'active'
           AND m.notify_level = 'all'
      ) OR NOT EXISTS (
        SELECT 1 FROM public.oculto_community_members m
         WHERE m.community_id = v_community AND m.user_id = v_parent_user
      ) THEN
        INSERT INTO public.notifications(user_id, type, title, message, data)
        VALUES (
          v_parent_user,
          'community_reply',
          'Responderam você',
          left(coalesce(NEW.body, ''), 140),
          jsonb_build_object(
            'community_id', v_community,
            'community_slug', v_slug,
            'topic_id', v_topic.id,
            'reply_id', NEW.id,
            'parent_reply_id', NEW.parent_reply_id,
            'topic_title', v_topic.title
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
