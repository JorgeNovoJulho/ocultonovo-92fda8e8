-- ============================================================
-- OCULTO PLAY — Extende oculto_play_update_item para aceitar
-- visibilidade e preview_start/end_seconds (edição completa).
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

DROP FUNCTION IF EXISTS public.oculto_play_update_item(uuid, text, text, text, text, text[], text);

CREATE OR REPLACE FUNCTION public.oculto_play_update_item(
  p_item_id        uuid,
  p_title          text DEFAULT NULL,
  p_caption        text DEFAULT NULL,
  p_composer_name  text DEFAULT NULL,
  p_ai_tool        text DEFAULT NULL,
  p_genre_tags     text[] DEFAULT NULL,
  p_thumb_url      text DEFAULT NULL,
  p_visibility     text DEFAULT NULL,
  p_preview_start  numeric DEFAULT NULL,
  p_preview_end    numeric DEFAULT NULL
)
RETURNS public.oculto_play_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.oculto_play_items;
  v_vis public.oculto_play_visibility;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.oculto_play_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.author_id <> v_uid
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.user_id = v_uid AND p.id = v_row.author_id
     )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_visibility IS NOT NULL THEN
    BEGIN
      v_vis := p_visibility::public.oculto_play_visibility;
    EXCEPTION WHEN others THEN
      v_vis := v_row.visibility;
    END;
  ELSE
    v_vis := v_row.visibility;
  END IF;

  UPDATE public.oculto_play_items
     SET title                 = COALESCE(p_title,          title),
         caption               = COALESCE(p_caption,        caption),
         composer_name         = COALESCE(p_composer_name,  composer_name),
         ai_tool               = COALESCE(p_ai_tool,        ai_tool),
         genre_tags            = COALESCE(p_genre_tags,     genre_tags),
         thumb_url             = COALESCE(p_thumb_url,      thumb_url),
         visibility            = v_vis,
         preview_start_seconds = COALESCE(p_preview_start,  preview_start_seconds),
         preview_end_seconds   = COALESCE(p_preview_end,    preview_end_seconds),
         updated_at            = now()
   WHERE id = p_item_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_update_item(
  uuid, text, text, text, text, text[], text, text, numeric, numeric
) TO authenticated, service_role;
