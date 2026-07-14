-- ============================================================
-- Comunidades Ocultas — Parte 10
-- Pendências auditadas:
--   • banned_words enforcement (trigger BEFORE INSERT topics+replies)
--   • require_post_approval flow (status pending_review + RPCs aprovar/rejeitar)
--   • Notificação automática para owner/mods em nova solicitação de membership
--   • RPC community_pending_topics(_community) para painel do mod
--   • Index para acelerar busca por status pending nos pendings
-- Idempotente — pode rodar várias vezes.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) ENFORCEMENT DE BANNED_WORDS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oculto_community_check_banned_words(_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings RECORD;
  _word TEXT;
  _haystack TEXT;
BEGIN
  IF _text IS NULL OR length(_text) = 0 THEN RETURN FALSE; END IF;
  SELECT banned_words INTO _settings FROM public.oculto_community_settings LIMIT 1;
  IF _settings IS NULL OR _settings.banned_words IS NULL OR array_length(_settings.banned_words, 1) IS NULL THEN
    RETURN FALSE;
  END IF;
  _haystack := lower(_text);
  FOREACH _word IN ARRAY _settings.banned_words LOOP
    IF length(coalesce(_word,'')) > 0 AND position(lower(_word) IN _haystack) > 0 THEN
      RETURN TRUE;
    END IF;
  END LOOP;
  RETURN FALSE;
END;
$$;

-- Topics: banned words bloqueia + require_post_approval força pending_review
CREATE OR REPLACE FUNCTION public.oculto_community_topics_pre_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _community RECORD;
  _role TEXT;
BEGIN
  IF public.oculto_community_check_banned_words(coalesce(NEW.title,'') || ' ' || coalesce(NEW.body,'')) THEN
    RAISE EXCEPTION 'banned_word_detected' USING ERRCODE = '22023';
  END IF;

  SELECT require_post_approval, owner_id INTO _community
    FROM public.oculto_communities WHERE id = NEW.community_id;
  IF _community IS NULL THEN RETURN NEW; END IF;

  IF _community.require_post_approval AND NEW.status = 'published' THEN
    -- Owner/mod publicam direto
    SELECT role INTO _role FROM public.oculto_community_members
      WHERE community_id = NEW.community_id AND user_id = NEW.author_id AND status = 'active' LIMIT 1;
    IF _role IS DISTINCT FROM 'owner' AND _role IS DISTINCT FROM 'moderator' THEN
      NEW.status := 'pending_review';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_community_topics_pre_insert ON public.oculto_community_topics;
CREATE TRIGGER trg_oculto_community_topics_pre_insert
BEFORE INSERT ON public.oculto_community_topics
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_topics_pre_insert();

-- Replies: banned words bloqueia
CREATE OR REPLACE FUNCTION public.oculto_community_replies_pre_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.oculto_community_check_banned_words(coalesce(NEW.body,'')) THEN
    RAISE EXCEPTION 'banned_word_detected' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_community_replies_pre_insert ON public.oculto_community_replies;
CREATE TRIGGER trg_oculto_community_replies_pre_insert
BEFORE INSERT ON public.oculto_community_replies
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_replies_pre_insert();


-- ─────────────────────────────────────────────
-- 2) APROVAÇÃO DE TÓPICOS PENDENTES
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_pending_topics(_community UUID)
RETURNS TABLE (
  id UUID,
  community_id UUID,
  author_id UUID,
  title TEXT,
  body TEXT,
  is_adult BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.community_id, t.author_id, t.title, t.body, t.is_adult, t.created_at
    FROM public.oculto_community_topics t
   WHERE t.community_id = _community
     AND t.status = 'pending_review'
     AND (
       EXISTS (
         SELECT 1 FROM public.oculto_community_members m
          WHERE m.community_id = _community
            AND m.user_id = auth.uid()
            AND m.status = 'active'
            AND m.role IN ('owner','moderator')
       )
       OR EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin','master')
       )
     )
   ORDER BY t.created_at ASC
   LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.community_topic_approve(_topic UUID, _approve BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t RECORD;
  _is_mod BOOLEAN := FALSE;
  _is_admin BOOLEAN := FALSE;
BEGIN
  SELECT * INTO _t FROM public.oculto_community_topics WHERE id = _topic;
  IF _t IS NULL THEN RAISE EXCEPTION 'topic_not_found'; END IF;
  IF _t.status <> 'pending_review' THEN RAISE EXCEPTION 'topic_not_pending'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.oculto_community_members
     WHERE community_id = _t.community_id AND user_id = auth.uid()
       AND status='active' AND role IN ('owner','moderator')
  ) INTO _is_mod;
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','master')
  ) INTO _is_admin;
  IF NOT _is_mod AND NOT _is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _approve THEN
    UPDATE public.oculto_community_topics SET status='published', updated_at=NOW() WHERE id=_topic;
    -- Notifica autor
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
    VALUES (
      _t.author_id, 'community_topic_approved',
      'Tópico aprovado',
      'Seu tópico "' || left(coalesce(_t.title,''),60) || '" foi aprovado.',
      jsonb_build_object('community_id', _t.community_id, 'topic_id', _t.id),
      FALSE
    );
  ELSE
    UPDATE public.oculto_community_topics SET status='removed', updated_at=NOW() WHERE id=_topic;
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
    VALUES (
      _t.author_id, 'community_topic_rejected',
      'Tópico rejeitado',
      'Seu tópico "' || left(coalesce(_t.title,''),60) || '" não foi aprovado pelos moderadores.',
      jsonb_build_object('community_id', _t.community_id, 'topic_id', _t.id),
      FALSE
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_pending_topics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_topic_approve(UUID, BOOLEAN) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_occ_topics_pending
  ON public.oculto_community_topics(community_id, status) WHERE status='pending_review';


-- ─────────────────────────────────────────────
-- 3) NOTIFICAÇÃO PARA OWNER/MODS EM NOVA SOLICITAÇÃO DE MEMBERSHIP
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oculto_community_member_pending_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _community RECORD;
  _admin RECORD;
  _requester_name TEXT;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT id, title, slug INTO _community FROM public.oculto_communities WHERE id = NEW.community_id;
  IF _community IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce(display_name, name, username, 'alguém') INTO _requester_name
    FROM public.profiles WHERE id = NEW.user_id OR user_id = NEW.user_id LIMIT 1;

  FOR _admin IN
    SELECT user_id FROM public.oculto_community_members
     WHERE community_id = NEW.community_id AND status='active' AND role IN ('owner','moderator')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
    VALUES (
      _admin.user_id,
      'community_membership_request',
      'Nova solicitação em ' || _community.title,
      coalesce(_requester_name,'alguém') || ' pediu para entrar.',
      jsonb_build_object('community_id', _community.id, 'slug', _community.slug, 'requester_id', NEW.user_id),
      FALSE
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_community_member_pending_notify ON public.oculto_community_members;
CREATE TRIGGER trg_oculto_community_member_pending_notify
AFTER INSERT ON public.oculto_community_members
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_member_pending_notify();


-- ─────────────────────────────────────────────
-- 4) RPC admin: listar todos convites globais
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_invites_admin_list(_limit INT DEFAULT 200)
RETURNS TABLE (
  id UUID,
  community_id UUID,
  community_title TEXT,
  community_slug TEXT,
  code TEXT,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses_count INT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.community_id, c.title, c.slug, i.code, i.created_by,
         i.expires_at, i.max_uses, i.uses_count, i.is_active, i.created_at
    FROM public.oculto_community_invites i
    JOIN public.oculto_communities c ON c.id = i.community_id
   WHERE EXISTS (
     SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','master')
   )
   ORDER BY i.created_at DESC
   LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.community_invites_admin_list(INT) TO authenticated;
