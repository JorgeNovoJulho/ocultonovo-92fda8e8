-- ============================================================================
-- OCULTO PLAY — Etapa 8: Notificações in-app + integração Stories/Comunidades
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Nada destrutivo. Não toca em posts/stories/comunidades.
-- ----------------------------------------------------------------------------
-- O que faz:
--   1) trigger AFTER INSERT em public.oculto_play_items que dispara
--      notificações in-app (public.notifications) para até 100 seguidores
--      do autor — apenas para itens publicados e não-seed.
--   2) RPC oculto_play_has_recent(p_hours) — boolean. Usada pelo "pulso"
--      do PLAY na barra de Stories.
--   3) RPC oculto_play_for_community(p_community_id, p_limit) — lista itens
--      do PLAY ancorados a uma comunidade (passa por can_access_oculto_play()).
-- Todas as funções SECURITY DEFINER com SET search_path=public.
-- ============================================================================

-- ---------- 1) Trigger de notificações para seguidores ----------
CREATE OR REPLACE FUNCTION public.oculto_play_notify_followers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_username text;
  v_author_user_id  uuid;
  v_title           text;
  v_body            text;
  v_kind_label      text;
  v_followers_table text;
  v_count           int := 0;
BEGIN
  -- Só notifica itens publicados e que não sejam seed
  IF NEW.is_published IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF NEW.is_seed = true THEN RETURN NEW; END IF;

  -- Resolve autor (profiles.id -> user_id, username)
  SELECT p.user_id, p.username
    INTO v_author_user_id, v_author_username
    FROM public.profiles p
   WHERE p.id = NEW.author_id
   LIMIT 1;

  IF v_author_user_id IS NULL THEN RETURN NEW; END IF;

  -- Rótulo amigável do tipo
  v_kind_label := CASE NEW.kind::text
    WHEN 'short_video'    THEN 'um novo vídeo'
    WHEN 'meme'           THEN 'um meme novo'
    WHEN 'audio'          THEN 'um novo áudio'
    WHEN 'vip_teaser'     THEN 'um teaser VIP'
    WHEN 'community_post' THEN 'um post de comunidade'
    WHEN 'challenge'      THEN 'um novo desafio'
    ELSE 'algo novo'
  END;

  v_title := COALESCE('@' || v_author_username, 'Alguém que você segue')
             || ' postou no PLAY';
  v_body  := 'Publicou ' || v_kind_label
             || COALESCE(' — ' || NULLIF(NEW.title, ''), '');

  -- Detecta a tabela de seguidores (segue padrão do useOcultoPlayDerived)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='follows'
  ) THEN
    v_followers_table := 'follows';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='oculto_follows'
  ) THEN
    v_followers_table := 'oculto_follows';
  ELSE
    RETURN NEW; -- sem tabela de seguidores, nada a fazer
  END IF;

  -- Insere até 100 notificações (top seguidores por created_at desc)
  EXECUTE format($f$
    INSERT INTO public.notifications (user_id, type, title, body, data, actor_id)
    SELECT f.follower_id,
           'oculto_play_new',
           %L,
           %L,
           jsonb_build_object(
             'play_item_id', %L::uuid,
             'kind',         %L::text,
             'author_id',    %L::uuid,
             'cta_url',      '/play'
           ),
           %L
      FROM public.%I f
     WHERE f.following_id = %L
       AND f.follower_id IS DISTINCT FROM %L
     ORDER BY f.created_at DESC NULLS LAST
     LIMIT 100
    $f$,
    v_title, v_body,
    NEW.id, NEW.kind::text, v_author_user_id,
    v_author_user_id,
    v_followers_table,
    v_author_user_id, v_author_user_id
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- (opcional) registra contagem em metadado do item
  IF v_count > 0 THEN
    UPDATE public.oculto_play_items
       SET share_count = share_count -- no-op pra não tocar contadores
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca quebra o INSERT do item por causa de notificação
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_play_notify_followers ON public.oculto_play_items;
CREATE TRIGGER trg_oculto_play_notify_followers
AFTER INSERT ON public.oculto_play_items
FOR EACH ROW EXECUTE FUNCTION public.oculto_play_notify_followers();

-- ---------- 2) RPC oculto_play_has_recent (pulse na Stories rail) ----------
CREATE OR REPLACE FUNCTION public.oculto_play_has_recent(p_hours int DEFAULT 24)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE v_ok boolean;
BEGIN
  -- Respeita o gate de acesso ao PLAY
  IF NOT public.can_access_oculto_play() THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_play_items
     WHERE is_published = true
       AND COALESCE(is_seed, false) = false
       AND published_at >= now() - make_interval(hours => GREATEST(1, p_hours))
  ) INTO v_ok;
  RETURN COALESCE(v_ok, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_has_recent(int) TO authenticated, anon;

-- ---------- 3) RPC oculto_play_for_community ----------
CREATE OR REPLACE FUNCTION public.oculto_play_for_community(
  p_community_id uuid,
  p_limit int DEFAULT 8
)
RETURNS TABLE (
  id            uuid,
  author_id     uuid,
  kind          text,
  title         text,
  caption       text,
  media_url     text,
  thumb_url     text,
  duration_sec  int,
  view_count    int,
  like_count    int,
  published_at  timestamptz,
  author_username    text,
  author_display_name text,
  author_avatar_url  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RETURN; -- vazio
  END IF;
  RETURN QUERY
  SELECT i.id, i.author_id, i.kind::text, i.title, i.caption,
         i.media_url, i.thumb_url, i.duration_sec,
         i.view_count, i.like_count, i.published_at,
         p.username, p.display_name, p.avatar_url
    FROM public.oculto_play_items i
    LEFT JOIN public.profiles p ON p.id = i.author_id
   WHERE i.source_community_id = p_community_id
     AND i.is_published = true
     AND COALESCE(i.is_seed, false) = false
   ORDER BY i.published_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 30));
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_for_community(uuid, int) TO authenticated, anon;

-- ============================================================================
-- FIM — Etapa 8
-- ============================================================================
