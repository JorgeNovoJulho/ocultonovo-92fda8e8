-- ============================================================
-- Etapa 57 — Play → Comunidade (CORREÇÃO: tabela real é
-- oculto_community_topics, não oculto_community_posts).
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

-- Adiciona link opcional do tópico para um item do Play
ALTER TABLE public.oculto_community_topics
  ADD COLUMN IF NOT EXISTS play_item_id uuid
  REFERENCES public.oculto_play_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_community_topics_play_item
  ON public.oculto_community_topics(play_item_id)
  WHERE play_item_id IS NOT NULL;

-- Remove versão antiga (se existir, com qualquer corpo)
DROP FUNCTION IF EXISTS public.oculto_play_share_to_community(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.oculto_play_share_to_community(
  p_item_id uuid,
  p_community_id uuid,
  p_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_topic_id uuid;
  v_item record;
  v_title text;
  v_body  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT id, title, caption, thumb_url, media_url, kind::text AS kind
    INTO v_item
    FROM public.oculto_play_items
   WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'play item not found';
  END IF;

  v_title := COALESCE(NULLIF(trim(v_item.title), ''),
                      NULLIF(trim(v_item.caption), ''),
                      '🎬 Item do Oculto Play');

  v_body := COALESCE(p_message, '')
            || E'\n\n🎬 Compartilhado do Oculto Play'
            || CASE WHEN v_item.media_url IS NOT NULL
                    THEN E'\n' || v_item.media_url
                    ELSE '' END;

  INSERT INTO public.oculto_community_topics (
    community_id, author_id, title, body, play_item_id
  ) VALUES (
    p_community_id,
    v_uid,
    left(v_title, 200),
    v_body,
    p_item_id
  )
  RETURNING id INTO v_topic_id;

  RETURN v_topic_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_share_to_community(uuid, uuid, text)
  TO authenticated;
