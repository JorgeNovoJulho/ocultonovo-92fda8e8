-- ============================================================================
-- OCULTO PLAY — Etapa 37: Legendas e Capítulos (.vtt)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente.
--
-- Cria:
--   * Tabela oculto_play_tracks (subtitles | captions | chapters) por item
--   * RPCs para listar / upsert / deletar (somente autor do item ou master)
--   * RLS: leitura para autenticados, escrita só pelo autor / master
-- Não muda nada do que já existe.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_tracks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('subtitles','captions','chapters')),
  lang        text NOT NULL DEFAULT 'pt-BR',
  label       text NOT NULL,
  vtt_url     text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oculto_play_tracks_item_idx
  ON public.oculto_play_tracks(item_id);

GRANT SELECT ON public.oculto_play_tracks TO authenticated;
GRANT ALL    ON public.oculto_play_tracks TO service_role;

ALTER TABLE public.oculto_play_tracks ENABLE ROW LEVEL SECURITY;

-- helper: o usuário é autor do item?
CREATE OR REPLACE FUNCTION public._is_oculto_play_item_author(p_item_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.oculto_play_items i
    JOIN public.profiles p ON p.id = i.author_id
    WHERE i.id = p_item_id
      AND p.user_id = p_uid
  );
$$;

DROP POLICY IF EXISTS "oculto_play_tracks_select_auth" ON public.oculto_play_tracks;
CREATE POLICY "oculto_play_tracks_select_auth"
  ON public.oculto_play_tracks FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "oculto_play_tracks_author_write" ON public.oculto_play_tracks;
CREATE POLICY "oculto_play_tracks_author_write"
  ON public.oculto_play_tracks FOR ALL
  TO authenticated
  USING (
    public._is_oculto_play_item_author(item_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin_master')
  )
  WITH CHECK (
    public._is_oculto_play_item_author(item_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin_master')
  );

-- ============================== RPCs ========================================

CREATE OR REPLACE FUNCTION public.oculto_play_tracks_list(p_item_id uuid)
RETURNS SETOF public.oculto_play_tracks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM public.oculto_play_tracks
  WHERE item_id = p_item_id
  ORDER BY kind, is_default DESC, lang;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_tracks_list(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_track_upsert(
  p_id         uuid,
  p_item_id    uuid,
  p_kind       text,
  p_lang       text,
  p_label      text,
  p_vtt_url    text,
  p_is_default boolean
) RETURNS public.oculto_play_tracks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.oculto_play_tracks;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (public._is_oculto_play_item_author(p_item_id, v_uid)
          OR public.has_role(v_uid, 'admin_master')) THEN
    RAISE EXCEPTION 'not the item author';
  END IF;

  IF p_kind NOT IN ('subtitles','captions','chapters') THEN
    RAISE EXCEPTION 'invalid track kind: %', p_kind;
  END IF;

  -- garante apenas um default por (item, kind)
  IF p_is_default THEN
    UPDATE public.oculto_play_tracks
       SET is_default = false
     WHERE item_id = p_item_id AND kind = p_kind
       AND (p_id IS NULL OR id <> p_id);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.oculto_play_tracks (item_id, kind, lang, label, vtt_url, is_default, created_by)
    VALUES (p_item_id, p_kind, COALESCE(p_lang,'pt-BR'), p_label, p_vtt_url, COALESCE(p_is_default,false), v_uid)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.oculto_play_tracks
       SET kind = p_kind,
           lang = COALESCE(p_lang,'pt-BR'),
           label = p_label,
           vtt_url = p_vtt_url,
           is_default = COALESCE(p_is_default,false)
     WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_track_upsert(uuid,uuid,text,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_track_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT item_id INTO v_item FROM public.oculto_play_tracks WHERE id = p_id;
  IF v_item IS NULL THEN RETURN false; END IF;

  IF NOT (public._is_oculto_play_item_author(v_item, v_uid)
          OR public.has_role(v_uid, 'admin_master')) THEN
    RAISE EXCEPTION 'not the item author';
  END IF;

  DELETE FROM public.oculto_play_tracks WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_track_delete(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
