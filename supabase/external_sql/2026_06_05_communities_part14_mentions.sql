-- ============================================================
-- COMMUNITIES — Parte 14: Menções @usuário (autocomplete + notificação)
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1) RPC para autocomplete de @menções dentro de uma comunidade
--    Devolve membros ativos cujo username começa com o prefixo.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_search_mentionable_users(
  _community uuid,
  _q text,
  _limit int DEFAULT 8
) RETURNS TABLE (
  user_id uuid,
  username text,
  name text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := lower(regexp_replace(coalesce(_q, ''), '^@', ''));
  v_max int := LEAST(GREATEST(coalesce(_limit, 8), 1), 15);
BEGIN
  IF length(v_q) < 1 OR _community IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.user_id,
         p.username,
         COALESCE(p.name, p.display_name, p.username) AS name,
         p.avatar_url
  FROM public.oculto_community_members m
  JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.community_id = _community
    AND COALESCE(m.status, 'active') = 'active'
    AND p.username IS NOT NULL
    AND lower(p.username) LIKE v_q || '%'
  ORDER BY length(p.username) ASC, p.username ASC
  LIMIT v_max;
END $$;

REVOKE ALL ON FUNCTION public.community_search_mentionable_users(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.community_search_mentionable_users(uuid, text, int) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- 2) Trigger: ao inserir tópico/resposta, varre @username no body
--    e cria notifications.type='community_mention' para cada alvo.
--    - Apenas tópicos com status='published' (ou sem status) disparam.
--    - Ignora menção ao próprio autor.
--    - Deduplica destinatários.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_emit_mention_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text := '';
  v_mention text;
  v_handle text;
  v_target_user uuid;
  v_topic_id uuid;
  v_reply_id uuid := NULL;
  v_community uuid;
  v_slug text;
  v_title text;
  v_url text;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_author_profile uuid;
  v_author_user uuid;
  v_status text;
BEGIN
  IF TG_TABLE_NAME = 'oculto_community_topics' THEN
    v_topic_id := NEW.id;
    v_title := NEW.title;
    v_text := COALESCE(NEW.body, '');
    v_community := NEW.community_id;
    v_author_profile := NEW.author_id;
    BEGIN v_status := NEW.status; EXCEPTION WHEN OTHERS THEN v_status := 'published'; END;
    IF COALESCE(v_status, 'published') <> 'published' THEN RETURN NEW; END IF;
  ELSE
    v_topic_id := NEW.topic_id;
    v_reply_id := NEW.id;
    v_text := COALESCE(NEW.body, '');
    v_community := NEW.community_id;
    v_author_profile := NEW.author_id;
    SELECT title INTO v_title FROM public.oculto_community_topics WHERE id = v_topic_id;
  END IF;

  IF v_text = '' THEN RETURN NEW; END IF;

  -- Resolve user_id do autor (author_id pode ser profile.id OU auth user id, dependendo da tabela)
  SELECT user_id INTO v_author_user FROM public.profiles WHERE id = v_author_profile LIMIT 1;
  IF v_author_user IS NULL THEN v_author_user := v_author_profile; END IF;

  SELECT slug INTO v_slug FROM public.oculto_communities WHERE id = v_community;
  v_url := '/comunidades/' || COALESCE(v_slug, v_community::text) || '/topico/' || v_topic_id::text;

  FOR v_mention IN
    SELECT DISTINCT (regexp_matches(v_text, '@([A-Za-z0-9_\.]{2,30})', 'g'))[1]
  LOOP
    v_handle := lower(v_mention);
    SELECT p.user_id INTO v_target_user
      FROM public.profiles p
      WHERE lower(p.username) = v_handle
      LIMIT 1;

    IF v_target_user IS NULL THEN CONTINUE; END IF;
    IF v_target_user = v_author_user THEN CONTINUE; END IF;
    IF v_target_user = ANY(v_seen) THEN CONTINUE; END IF;
    v_seen := v_seen || v_target_user;

    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_target_user,
        'community_mention',
        'Você foi mencionado em uma comunidade',
        LEFT(v_text, 140),
        jsonb_build_object(
          'community_id', v_community,
          'community_slug', v_slug,
          'topic_id', v_topic_id,
          'topic_title', v_title,
          'reply_id', v_reply_id,
          'url', v_url,
          'mentioned_by', v_author_user
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- best-effort: não bloquear a publicação se a insert falhar
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_community_mentions_topic ON public.oculto_community_topics;
CREATE TRIGGER trg_community_mentions_topic
AFTER INSERT ON public.oculto_community_topics
FOR EACH ROW EXECUTE FUNCTION public.community_emit_mention_notifications();

DROP TRIGGER IF EXISTS trg_community_mentions_reply ON public.oculto_community_replies;
CREATE TRIGGER trg_community_mentions_reply
AFTER INSERT ON public.oculto_community_replies
FOR EACH ROW EXECUTE FUNCTION public.community_emit_mention_notifications();

NOTIFY pgrst, 'reload schema';
