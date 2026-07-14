-- =====================================================================
-- 2026-06-25 — Notificações ao DONO da comunidade
-- Quando: (1) novo tópico criado, (2) nova resposta em qualquer tópico,
-- (3) novo membro entrou (status virou 'active').
-- Não notifica o próprio dono quando ele é o autor da ação.
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) NOVO TÓPICO -> notifica dono
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._community_notify_owner_new_topic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_slug  TEXT;
  v_name  TEXT;
BEGIN
  IF NEW.community_id IS NULL OR NEW.author_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.status, 'active') <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, slug, title
    INTO v_owner, v_slug, v_name
    FROM public.oculto_communities
   WHERE id = NEW.community_id;

  IF v_owner IS NULL OR v_owner = NEW.author_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(user_id, type, title, message, data)
  VALUES (
    v_owner,
    'community_new_topic',
    'Novo tópico em ' || COALESCE(v_name, 'sua comunidade'),
    LEFT(COALESCE(NEW.title, ''), 140),
    jsonb_build_object(
      'community_id', NEW.community_id,
      'community_slug', v_slug,
      'topic_id', NEW.id,
      'topic_title', NEW.title,
      'author_id', NEW.author_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_notify_owner_new_topic_trg ON public.oculto_community_topics;
CREATE TRIGGER community_notify_owner_new_topic_trg
AFTER INSERT ON public.oculto_community_topics
FOR EACH ROW EXECUTE FUNCTION public._community_notify_owner_new_topic();

-- ---------------------------------------------------------------------
-- 2) NOVA RESPOSTA -> notifica dono (se já não for autor do tópico/reply)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._community_notify_owner_new_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic     RECORD;
  v_owner     UUID;
  v_slug      TEXT;
  v_name      TEXT;
BEGIN
  IF COALESCE(NEW.status, 'active') <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT t.id, t.author_id, t.community_id, t.title
    INTO v_topic
    FROM public.oculto_community_topics t
   WHERE t.id = NEW.topic_id;

  IF v_topic.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, slug, title
    INTO v_owner, v_slug, v_name
    FROM public.oculto_communities
   WHERE id = v_topic.community_id;

  IF v_owner IS NULL OR v_owner = NEW.author_id THEN
    RETURN NEW;
  END IF;

  -- Evita duplicidade: se o dono é o autor do tópico, já recebe via gatilho de reply existente.
  IF v_owner = v_topic.author_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(user_id, type, title, message, data)
  VALUES (
    v_owner,
    'community_new_reply',
    'Nova resposta em ' || COALESCE(v_name, 'sua comunidade'),
    LEFT(COALESCE(NEW.body, ''), 140),
    jsonb_build_object(
      'community_id', v_topic.community_id,
      'community_slug', v_slug,
      'topic_id', v_topic.id,
      'topic_title', v_topic.title,
      'reply_id', NEW.id,
      'author_id', NEW.author_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_notify_owner_new_reply_trg ON public.oculto_community_replies;
CREATE TRIGGER community_notify_owner_new_reply_trg
AFTER INSERT ON public.oculto_community_replies
FOR EACH ROW EXECUTE FUNCTION public._community_notify_owner_new_reply();

-- ---------------------------------------------------------------------
-- 3) NOVO MEMBRO ATIVO -> notifica dono
-- Dispara em INSERT com status='active' ou UPDATE quando status muda para 'active'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._community_notify_owner_new_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_slug  TEXT;
  v_name  TEXT;
  v_uname TEXT;
  v_should BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should := (COALESCE(NEW.status, '') = 'active');
  ELSIF TG_OP = 'UPDATE' THEN
    v_should := (COALESCE(NEW.status, '') = 'active'
                 AND COALESCE(OLD.status, '') <> 'active');
  END IF;

  IF NOT v_should OR NEW.user_id IS NULL OR NEW.community_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, slug, title
    INTO v_owner, v_slug, v_name
    FROM public.oculto_communities
   WHERE id = NEW.community_id;

  IF v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_uname FROM public.profiles
   WHERE user_id = NEW.user_id OR id = NEW.user_id
   LIMIT 1;

  INSERT INTO public.notifications(user_id, type, title, message, data)
  VALUES (
    v_owner,
    'community_new_member',
    'Novo membro em ' || COALESCE(v_name, 'sua comunidade'),
    CASE WHEN v_uname IS NOT NULL AND v_uname <> ''
         THEN '@' || v_uname || ' acabou de entrar'
         ELSE 'Um novo membro acabou de entrar'
    END,
    jsonb_build_object(
      'community_id', NEW.community_id,
      'community_slug', v_slug,
      'member_user_id', NEW.user_id,
      'member_username', v_uname
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_notify_owner_new_member_trg ON public.oculto_community_members;
CREATE TRIGGER community_notify_owner_new_member_trg
AFTER INSERT OR UPDATE OF status ON public.oculto_community_members
FOR EACH ROW EXECUTE FUNCTION public._community_notify_owner_new_member();

NOTIFY pgrst, 'reload schema';
-- =====================================================================
-- FIM
-- =====================================================================
