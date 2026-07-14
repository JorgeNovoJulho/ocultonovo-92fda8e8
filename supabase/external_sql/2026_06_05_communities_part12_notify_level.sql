-- =====================================================================
-- 2026_06_05 — COMUNIDADES OCULTAS — PARTE 12
-- Notificações granulares por membership (all | mentions | mute).
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLUNA notify_level em oculto_community_members
-- ---------------------------------------------------------------------
ALTER TABLE public.oculto_community_members
  ADD COLUMN IF NOT EXISTS notify_level TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'oculto_community_members_notify_level_chk'
  ) THEN
    ALTER TABLE public.oculto_community_members
      ADD CONSTRAINT oculto_community_members_notify_level_chk
      CHECK (notify_level IN ('all','mentions','mute'));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. TRIGGER _community_notify_reply respeita notify_level
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._community_notify_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic        RECORD;
  v_parent_user  UUID;
  v_community    UUID;
BEGIN
  SELECT t.id, t.author_id, t.title, t.community_id
    INTO v_topic
    FROM public.oculto_community_topics t
   WHERE t.id = NEW.topic_id;

  IF v_topic.id IS NULL THEN
    RETURN NEW;
  END IF;
  v_community := v_topic.community_id;

  -- Notifica autor do tópico (se não for o próprio respondente e notify_level não for mute)
  IF v_topic.author_id IS NOT NULL AND v_topic.author_id <> NEW.author_id THEN
    IF EXISTS (
      SELECT 1 FROM public.oculto_community_members m
       WHERE m.community_id = v_community
         AND m.user_id = v_topic.author_id
         AND m.status = 'active'
         AND m.notify_level IN ('all')  -- autor sempre é "all" envolvido; 'mentions' = só @, 'mute' = nada
    ) OR NOT EXISTS (
      -- caso o autor não esteja na tabela de membros (legado), assume 'all'
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
          'topic_id', v_topic.id,
          'reply_id', NEW.id,
          'topic_title', v_topic.title
        )
      );
    END IF;
  END IF;

  -- Notifica autor da reply pai (se houver, diferente do respondente)
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

-- Garante o trigger
DROP TRIGGER IF EXISTS community_notify_reply_trg ON public.oculto_community_replies;
CREATE TRIGGER community_notify_reply_trg
AFTER INSERT ON public.oculto_community_replies
FOR EACH ROW EXECUTE FUNCTION public._community_notify_reply();

-- ---------------------------------------------------------------------
-- 3. RPC para o usuário ajustar seu próprio notify_level
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_set_notify_level(
  _community UUID,
  _level TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _level NOT IN ('all','mentions','mute') THEN
    RAISE EXCEPTION 'invalid_level';
  END IF;

  UPDATE public.oculto_community_members
     SET notify_level = _level
   WHERE community_id = _community
     AND user_id = v_uid
     AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_set_notify_level(UUID, TEXT) TO authenticated;

-- =====================================================================
-- FIM PARTE 12
-- =====================================================================
