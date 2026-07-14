-- =========================================================
-- Oculto Play — gate de postagem por toggle + limpeza @chupador_de_pepega
-- 1) Remove qualquer item do @chupador_de_pepega no Oculto Play
-- 2) Recria oculto_play_save_draft: quando o toggle do kind estiver
--    desligado, somente @oculto_master pode publicar.
-- =========================================================

-- 1) Limpeza absoluta dos itens do @chupador_de_pepega
DELETE FROM public.oculto_play_items i
 USING public.profiles p
 WHERE p.id = i.author_id
   AND lower(p.username) = 'chupador_de_pepega';

-- 2) Função hardened
DROP FUNCTION IF EXISTS public.oculto_play_save_draft(
  public.oculto_play_kind, public.oculto_play_section, public.oculto_play_visibility,
  text, text, text, text, text, text[], timestamptz
);

CREATE OR REPLACE FUNCTION public.oculto_play_save_draft(
  p_kind        public.oculto_play_kind,
  p_section     public.oculto_play_section,
  p_visibility  public.oculto_play_visibility,
  p_title       text,
  p_caption     text,
  p_media_url   text,
  p_thumb_url   text,
  p_audio_url   text,
  p_tags        text[] DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid;
  v_username text;
  v_id uuid;
  v_is_draft boolean;
  v_is_pub boolean;
  v_cfg public.oculto_play_config;
  v_kind_on boolean := true;
  v_is_master boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT id, lower(coalesce(username,''))
    INTO v_profile, v_username
    FROM public.profiles
   WHERE user_id = auth.uid()
   LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'profile missing'; END IF;

  v_is_master := (v_username = 'oculto_master')
                 OR EXISTS (SELECT 1 FROM public.user_roles ur
                             WHERE ur.user_id = auth.uid()
                               AND ur.role::text IN ('admin','master'));

  -- Lê config global
  SELECT * INTO v_cfg
    FROM public.oculto_play_config
   ORDER BY created_at ASC LIMIT 1;

  IF v_cfg.id IS NOT NULL THEN
    -- Plataforma totalmente desligada
    IF coalesce(v_cfg.enabled, true) = false AND NOT v_is_master THEN
      RAISE EXCEPTION 'oculto_play_disabled' USING ERRCODE = '42501';
    END IF;

    v_kind_on := CASE p_kind::text
      WHEN 'short_video' THEN coalesce(v_cfg.short_videos_on, true)
      WHEN 'meme'        THEN coalesce(v_cfg.memes_on, true)
      WHEN 'audio'       THEN coalesce(v_cfg.audios_on, true)
      WHEN 'vip_teaser'  THEN coalesce(v_cfg.vip_teasers_on, true)
      ELSE true
    END;

    IF NOT v_kind_on AND NOT v_is_master THEN
      RAISE EXCEPTION 'oculto_play_kind_disabled' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for <= now() THEN
    RAISE EXCEPTION 'scheduled time must be in the future';
  END IF;

  v_is_draft := (p_scheduled_for IS NULL);
  v_is_pub   := false;

  INSERT INTO public.oculto_play_items (
    author_id, kind, section, visibility, title, caption,
    media_url, thumb_url, audio_url, tags,
    is_draft, is_published, scheduled_for
  ) VALUES (
    v_profile, p_kind, p_section, p_visibility,
    NULLIF(trim(p_title),''), NULLIF(trim(p_caption),''),
    p_media_url, p_thumb_url, p_audio_url, COALESCE(p_tags, '{}'),
    v_is_draft, v_is_pub, p_scheduled_for
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_save_draft(
  public.oculto_play_kind, public.oculto_play_section, public.oculto_play_visibility,
  text, text, text, text, text, text[], timestamptz
) TO authenticated;

NOTIFY pgrst, 'reload schema';
