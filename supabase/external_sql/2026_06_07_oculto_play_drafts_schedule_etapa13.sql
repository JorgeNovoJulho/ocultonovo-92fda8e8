-- ============================================================================
-- OCULTO PLAY — Etapa 13: Rascunhos + Agendamento de publicação
-- Cole no SQL Editor do Supabase EXTERNO. 100% idempotente.
-- Depende de 2026_06_07_oculto_play_content.sql.
-- ============================================================================

-- 1) Colunas novas em oculto_play_items
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS is_draft       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_for  timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_error text;

CREATE INDEX IF NOT EXISTS idx_play_items_drafts_author
  ON public.oculto_play_items(author_id)
  WHERE is_draft = true;

CREATE INDEX IF NOT EXISTS idx_play_items_scheduled_due
  ON public.oculto_play_items(scheduled_for)
  WHERE scheduled_for IS NOT NULL AND is_published = false AND is_draft = false;

-- 2) Listar meus rascunhos + agendados
CREATE OR REPLACE FUNCTION public.oculto_play_my_drafts(p_limit int DEFAULT 50)
RETURNS TABLE (
  id            uuid,
  kind          public.oculto_play_kind,
  section       public.oculto_play_section,
  visibility    public.oculto_play_visibility,
  title         text,
  caption       text,
  media_url     text,
  thumb_url     text,
  audio_url     text,
  tags          text[],
  is_draft      boolean,
  is_published  boolean,
  scheduled_for timestamptz,
  schedule_error text,
  created_at    timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.kind, i.section, i.visibility, i.title, i.caption,
         i.media_url, i.thumb_url, i.audio_url, i.tags,
         i.is_draft, i.is_published, i.scheduled_for, i.schedule_error, i.created_at
    FROM public.oculto_play_items i
   WHERE i.author_id = v_profile_id
     AND (i.is_draft = true OR (i.scheduled_for IS NOT NULL AND i.is_published = false))
   ORDER BY COALESCE(i.scheduled_for, i.created_at) DESC
   LIMIT GREATEST(1, LEAST(p_limit, 200));
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_my_drafts(int) TO authenticated;

-- 3) Helper interno: confere que o item pertence ao usuário atual
CREATE OR REPLACE FUNCTION public._oculto_play_assert_owner(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author uuid; v_profile uuid;
BEGIN
  SELECT author_id INTO v_author FROM public.oculto_play_items WHERE id = p_item_id;
  IF v_author IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile IS NULL OR v_profile <> v_author THEN
    IF NOT public.has_role(auth.uid(), 'admin_master') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  RETURN v_author;
END $$;

-- 4) Agendar item já existente (rascunho ou publicado)
CREATE OR REPLACE FUNCTION public.oculto_play_schedule_item(
  p_item_id uuid,
  p_when    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._oculto_play_assert_owner(p_item_id);
  IF p_when IS NULL OR p_when <= now() THEN
    RAISE EXCEPTION 'scheduled time must be in the future';
  END IF;

  UPDATE public.oculto_play_items
     SET is_draft      = false,
         is_published  = false,
         scheduled_for = p_when,
         schedule_error = NULL
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'scheduled_for', p_when);
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_schedule_item(uuid,timestamptz) TO authenticated;

-- 5) Publicar agora (vira de rascunho/agendado para publicado)
CREATE OR REPLACE FUNCTION public.oculto_play_publish_draft(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._oculto_play_assert_owner(p_item_id);

  UPDATE public.oculto_play_items
     SET is_draft      = false,
         is_published  = true,
         scheduled_for = NULL,
         schedule_error = NULL,
         published_at  = COALESCE(published_at, now())
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_publish_draft(uuid) TO authenticated;

-- 6) Cancelar agendamento (volta para rascunho)
CREATE OR REPLACE FUNCTION public.oculto_play_cancel_schedule(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._oculto_play_assert_owner(p_item_id);

  UPDATE public.oculto_play_items
     SET scheduled_for = NULL,
         is_draft      = true,
         is_published  = false,
         schedule_error = NULL
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_cancel_schedule(uuid) TO authenticated;

-- 7) Salvar como rascunho (insert simples retornando id) — usado pelo upload
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
DECLARE v_profile uuid; v_id uuid; v_is_draft boolean; v_is_pub boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'profile missing'; END IF;

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

-- 8) Worker: publica todos os agendados vencidos
CREATE OR REPLACE FUNCTION public.oculto_play_publish_due()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.oculto_play_items
       SET is_published  = true,
           is_draft      = false,
           scheduled_for = NULL,
           schedule_error = NULL,
           published_at  = COALESCE(published_at, now())
     WHERE is_published = false
       AND is_draft     = false
       AND scheduled_for IS NOT NULL
       AND scheduled_for <= now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_publish_due() TO authenticated, service_role;

-- 9) Agendar pg_cron: rodar a cada minuto
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('oculto_play_publish_due_every_minute')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oculto_play_publish_due_every_minute');
    PERFORM cron.schedule(
      'oculto_play_publish_due_every_minute',
      '* * * * *',
      $cron$ SELECT public.oculto_play_publish_due(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
