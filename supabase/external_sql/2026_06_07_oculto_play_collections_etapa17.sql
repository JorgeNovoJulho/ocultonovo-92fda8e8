-- ============================================================================
-- OCULTO PLAY — Etapa 17: Coleções (playlists pessoais)
-- 100% idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- Depende das etapas anteriores do PLAY (tabela oculto_play_items).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  name        text NOT NULL,
  description text,
  is_public   boolean NOT NULL DEFAULT false,
  cover_url   text,
  item_count  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_play_collections_owner ON public.oculto_play_collections(owner_id);
CREATE INDEX IF NOT EXISTS idx_play_collections_public ON public.oculto_play_collections(is_public) WHERE is_public = true;

CREATE TABLE IF NOT EXISTS public.oculto_play_collection_items (
  collection_id uuid NOT NULL REFERENCES public.oculto_play_collections(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  position      int NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_play_collection_items_item ON public.oculto_play_collection_items(item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_collections TO authenticated;
GRANT ALL ON public.oculto_play_collections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_collection_items TO authenticated;
GRANT ALL ON public.oculto_play_collection_items TO service_role;

ALTER TABLE public.oculto_play_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_play_collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pcol_select" ON public.oculto_play_collections;
CREATE POLICY "pcol_select" ON public.oculto_play_collections FOR SELECT
  USING (owner_id = auth.uid() OR is_public = true);

DROP POLICY IF EXISTS "pcol_insert" ON public.oculto_play_collections;
CREATE POLICY "pcol_insert" ON public.oculto_play_collections FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "pcol_update" ON public.oculto_play_collections;
CREATE POLICY "pcol_update" ON public.oculto_play_collections FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "pcol_delete" ON public.oculto_play_collections;
CREATE POLICY "pcol_delete" ON public.oculto_play_collections FOR DELETE
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "pcoli_select" ON public.oculto_play_collection_items;
CREATE POLICY "pcoli_select" ON public.oculto_play_collection_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.oculto_play_collections c
     WHERE c.id = collection_id
       AND (c.owner_id = auth.uid() OR c.is_public = true)
  ));

DROP POLICY IF EXISTS "pcoli_modify" ON public.oculto_play_collection_items;
CREATE POLICY "pcoli_modify" ON public.oculto_play_collection_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.oculto_play_collections c
     WHERE c.id = collection_id AND c.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.oculto_play_collections c
     WHERE c.id = collection_id AND c.owner_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.oculto_play_collection_recount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid;
BEGIN
  v_cid := COALESCE(NEW.collection_id, OLD.collection_id);
  UPDATE public.oculto_play_collections
     SET item_count = (SELECT COUNT(*) FROM public.oculto_play_collection_items WHERE collection_id = v_cid),
         updated_at = now()
   WHERE id = v_cid;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_play_collection_recount ON public.oculto_play_collection_items;
CREATE TRIGGER trg_play_collection_recount
AFTER INSERT OR DELETE ON public.oculto_play_collection_items
FOR EACH ROW EXECUTE FUNCTION public.oculto_play_collection_recount();

CREATE OR REPLACE FUNCTION public.oculto_play_collection_create(p_name text, p_description text DEFAULT NULL, p_is_public boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'name required'; END IF;
  INSERT INTO public.oculto_play_collections(owner_id, name, description, is_public)
  VALUES (auth.uid(), trim(p_name), nullif(trim(coalesce(p_description,'')),''), coalesce(p_is_public,false))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.oculto_play_collection_add(p_collection_id uuid, p_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oculto_play_collections WHERE id = p_collection_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not owner';
  END IF;
  INSERT INTO public.oculto_play_collection_items(collection_id, item_id) VALUES (p_collection_id, p_item_id)
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.oculto_play_collection_remove(p_collection_id uuid, p_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  DELETE FROM public.oculto_play_collection_items
   WHERE collection_id = p_collection_id AND item_id = p_item_id
     AND EXISTS (SELECT 1 FROM public.oculto_play_collections WHERE id = p_collection_id AND owner_id = auth.uid());
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.oculto_play_collection_delete(p_collection_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  DELETE FROM public.oculto_play_collections WHERE id = p_collection_id AND owner_id = auth.uid();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.oculto_play_my_collections()
RETURNS TABLE (
  id uuid, name text, description text, is_public boolean,
  cover_url text, item_count int, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, description, is_public, cover_url, item_count, updated_at
    FROM public.oculto_play_collections
   WHERE owner_id = auth.uid()
   ORDER BY updated_at DESC
$$;

CREATE OR REPLACE FUNCTION public.oculto_play_collection_items_list(p_collection_id uuid, p_limit int DEFAULT 50)
RETURNS SETOF public.oculto_play_items
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.*
    FROM public.oculto_play_collection_items ci
    JOIN public.oculto_play_items i ON i.id = ci.item_id
   WHERE ci.collection_id = p_collection_id
     AND EXISTS (
       SELECT 1 FROM public.oculto_play_collections c
        WHERE c.id = p_collection_id
          AND (c.owner_id = auth.uid() OR c.is_public = true)
     )
   ORDER BY ci.added_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(p_limit,50), 200))
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_collection_create(text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oculto_play_collection_add(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oculto_play_collection_remove(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oculto_play_collection_delete(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oculto_play_my_collections() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oculto_play_collection_items_list(uuid, int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
