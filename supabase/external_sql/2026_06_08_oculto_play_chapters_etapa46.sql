-- ============================================================
-- Etapa 46 — Capítulos & Skip Intro (Oculto Play)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  position_seconds numeric(10,2) NOT NULL CHECK (position_seconds >= 0),
  end_seconds numeric(10,2),
  label text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'chapter'
    CHECK (kind IN ('intro','recap','chapter','highlight','outro')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_play_chapters_item
  ON public.oculto_play_chapters (item_id, position_seconds);

GRANT SELECT ON public.oculto_play_chapters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_play_chapters TO authenticated;
GRANT ALL ON public.oculto_play_chapters TO service_role;

ALTER TABLE public.oculto_play_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chapters_select_all" ON public.oculto_play_chapters;
CREATE POLICY "chapters_select_all"
  ON public.oculto_play_chapters FOR SELECT USING (true);

DROP POLICY IF EXISTS "chapters_owner_write" ON public.oculto_play_chapters;
CREATE POLICY "chapters_owner_write"
  ON public.oculto_play_chapters FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.oculto_play_chapters_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_oculto_play_chapters_touch ON public.oculto_play_chapters;
CREATE TRIGGER trg_oculto_play_chapters_touch
  BEFORE UPDATE ON public.oculto_play_chapters
  FOR EACH ROW EXECUTE FUNCTION public.oculto_play_chapters_touch();

-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_list_chapters(p_item_id uuid)
RETURNS TABLE (
  id uuid,
  position_seconds numeric,
  end_seconds numeric,
  label text,
  kind text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.position_seconds, c.end_seconds, c.label, c.kind
    FROM public.oculto_play_chapters c
   WHERE c.item_id = p_item_id
   ORDER BY c.position_seconds ASC;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_list_chapters(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_upsert_chapter(
  p_id uuid,
  p_item_id uuid,
  p_position_seconds numeric,
  p_end_seconds numeric,
  p_label text,
  p_kind text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  BEGIN
    EXECUTE 'SELECT owner_id FROM public.oculto_play_items WHERE id = $1'
      INTO v_owner USING p_item_id;
  EXCEPTION WHEN OTHERS THEN
    v_owner := v_uid;
  END;
  IF v_owner IS NULL THEN v_owner := v_uid; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'not owner'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.oculto_play_chapters
      (item_id, owner_id, position_seconds, end_seconds, label, kind)
    VALUES
      (p_item_id, v_uid, COALESCE(p_position_seconds,0), p_end_seconds,
       COALESCE(p_label,''), COALESCE(p_kind,'chapter'))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.oculto_play_chapters
       SET position_seconds = COALESCE(p_position_seconds, position_seconds),
           end_seconds      = p_end_seconds,
           label            = COALESCE(p_label, label),
           kind             = COALESCE(p_kind, kind)
     WHERE id = p_id AND owner_id = v_uid
     RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_upsert_chapter(uuid,uuid,numeric,numeric,text,text) TO authenticated;

-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_delete_chapter(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.oculto_play_chapters
   WHERE id = p_id AND owner_id = auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_delete_chapter(uuid) TO authenticated;
